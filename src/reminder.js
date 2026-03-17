const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const dayjs = require("dayjs");
const db = require("./db");

function getToday() {
  return dayjs().format("YYYY-MM-DD");
}

function getStreakEmoji(streak) {
  if (streak >= 20) return "👑";
  if (streak >= 10) return "⭐";
  if (streak >= 5) return "🔥";
  if (streak >= 3) return "✨";
  return "";
}

// ── Build broadcast embed with live attendee list ──

function buildBroadcastEmbed() {
  const today = getToday();
  const memberCount = db.getMemberCount();
  const checkins = db.getCheckins(today);
  const pending = db.getPendingMembers(today);

  const doneList = checkins.filter((c) => c.status === "done");
  const skipList = checkins.filter((c) => c.status === "skip");
  const checkedIn = doneList.length + skipList.length;

  let attendeeText = "";
  if (checkins.length > 0) {
    attendeeText = checkins
      .map((c, i) => {
        const time = c.confirmedAt
          ? dayjs(c.confirmedAt).format("HH:mm")
          : "--:--";
        const icon = c.status === "done" ? "✅" : "⏭️";
        return `${i + 1}. ${icon} <@${c.discordId}> — ${c.displayName} @ ${time}`;
      })
      .join("\n");
  } else {
    attendeeText = "_ยังไม่มีคน check-in_";
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📋 AXONS Pulse — Daily Check-in")
    .setDescription(
      [
        `📅 **${dayjs().format("DD MMM YYYY")}** (${dayjs().format("dddd")})`,
        `⏰ Deadline: **18:00** today`,
        "",
        `👥 **Attendee Count**`,
        `${checkedIn}/${memberCount}`,
        "",
        `📋 **Attendees**`,
        attendeeText,
      ].join("\n")
    )
    .setTimestamp()
    .setFooter({ text: "AXONS Pulse Bot • กด Done เมื่อทำ Pulse แล้ว" });

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("pulse_done")
      .setLabel("✅ Done")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("pulse_skip")
      .setLabel("⏭️ Skip (ลา/WFH)")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("pulse_export")
      .setLabel("📊 Export CSV")
      .setStyle(ButtonStyle.Primary)
  );

  return { embed, buttons };
}

async function sendBroadcast(channel) {
  const { embed, buttons } = buildBroadcastEmbed();
  const message = await channel.send({
    content: "@everyone",
    embeds: [embed],
    components: [buttons],
  });

  db.setBroadcastMessage(getToday(), message.id, channel.id);
  console.log(`[BROADCAST] Sent daily reminder: ${getToday()}`);
  return message;
}

// ── Refresh the broadcast embed in-place ──

async function refreshBroadcastEmbed(client) {
  const today = getToday();
  const msgData = db.getBroadcastMessage(today);
  if (!msgData) return;

  try {
    const channel = await client.channels.fetch(msgData.channelId);
    const message = await channel.messages.fetch(msgData.messageId);
    const { embed, buttons } = buildBroadcastEmbed();
    await message.edit({ embeds: [embed], components: [buttons] });
  } catch (err) {
    console.error("[REFRESH] Failed to update broadcast:", err.message);
  }
}

// ── 18:00 Summary ──

function buildSummaryEmbed() {
  const today = getToday();
  const members = db.getActiveMembers();
  const pending = db.getPendingMembers(today);

  for (const member of pending) {
    db.recordCheckin(member.discordId, today, "missed");
  }

  const finalCheckins = db.getCheckins(today);
  const done = finalCheckins.filter((c) => c.status === "done");
  const skipped = finalCheckins.filter((c) => c.status === "skip");
  const missed = finalCheckins.filter((c) => c.status === "missed");

  const total = members.length;
  const completionRate = total > 0 ? Math.round((done.length / total) * 100) : 0;

  const barLength = 20;
  const filledBars = Math.round((completionRate / 100) * barLength);
  const progressBar = "🟩".repeat(filledBars) + "⬜".repeat(barLength - filledBars);

  const streaks = members
    .map((m) => ({ ...m, streak: db.getStreak(m.discordId) }))
    .filter((m) => m.streak > 0)
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 3);

  const embed = new EmbedBuilder()
    .setColor(missed.length === 0 ? 0x23a559 : 0xf0b232)
    .setTitle("📊 Daily Summary — " + dayjs().format("DD MMM YYYY"))
    .setDescription(
      [progressBar, `**${done.length}/${total}** completed (${completionRate}%)`].join("\n")
    )
    .addFields(
      { name: "✅ Done", value: `${done.length}`, inline: true },
      { name: "⏭️ Skipped", value: `${skipped.length}`, inline: true },
      { name: "❌ Missed", value: `${missed.length}`, inline: true }
    );

  if (missed.length > 0) {
    embed.addFields({
      name: "🚨 Missed (ยังไม่ได้ทำ)",
      value: missed.map((m) => `<@${m.discordId}>`).join(" "),
    });
  }

  if (streaks.length > 0) {
    embed.addFields({
      name: "🏆 Top Streaks",
      value: streaks
        .map(
          (m, i) =>
            `${["🥇", "🥈", "🥉"][i]} <@${m.discordId}> — ${m.streak} days ${getStreakEmoji(m.streak)}`
        )
        .join("\n"),
    });
  }

  embed.setTimestamp().setFooter({ text: "AXONS Pulse Bot • Daily Summary" });
  return embed;
}

async function sendSummary(channel) {
  const embed = buildSummaryEmbed();
  await channel.send({ embeds: [embed] });
  console.log(`[SUMMARY] Sent daily summary: ${getToday()}`);
}

// ── Export CSV ──

function buildExportCSV(date) {
  const checkins = db.getCheckins(date);
  const pending = db.getPendingMembers(date);

  const rows = [["No", "Discord_ID", "Display_Name", "Status", "Time"]];

  let i = 1;
  for (const c of checkins) {
    const time = c.confirmedAt ? dayjs(c.confirmedAt).format("HH:mm:ss") : "";
    rows.push([i++, c.discordId, c.displayName, c.status, time]);
  }
  for (const m of pending) {
    rows.push([i++, m.discordId, m.displayName, "pending", ""]);
  }

  return rows.map((r) => r.join(",")).join("\n");
}

// ── Status embed ──

function buildStatusEmbed() {
  const today = getToday();
  const checkins = db.getCheckins(today);
  const pending = db.getPendingMembers(today);

  const done = checkins.filter((c) => c.status === "done");
  const skipped = checkins.filter((c) => c.status === "skip");

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📋 Today's Status — " + dayjs().format("DD MMM YYYY"))
    .addFields(
      { name: "✅ Done", value: `${done.length}`, inline: true },
      { name: "⏭️ Skip", value: `${skipped.length}`, inline: true },
      { name: "⏳ Pending", value: `${pending.length}`, inline: true }
    );

  if (done.length > 0) {
    embed.addFields({
      name: "Completed",
      value: done.map((c) => `<@${c.discordId}>`).join(", "),
    });
  }

  if (pending.length > 0) {
    embed.addFields({
      name: "Still waiting",
      value: pending.map((m) => `<@${m.discordId}>`).join(", "),
    });
  }

  return embed;
}

// ── Leaderboard ──

function buildLeaderboardEmbed() {
  const members = db.getActiveMembers();
  const streaks = members
    .map((m) => ({ ...m, streak: db.getStreak(m.discordId) }))
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 10);

  const embed = new EmbedBuilder()
    .setColor(0xf0b232)
    .setTitle("🏆 Pulse Streak Leaderboard")
    .setDescription(
      streaks.length > 0
        ? streaks
            .map(
              (m, i) =>
                `**${i + 1}.** <@${m.discordId}> — ${m.streak} days ${getStreakEmoji(m.streak)}`
            )
            .join("\n")
        : "No streaks yet! Start checking in to build yours."
    )
    .setTimestamp()
    .setFooter({ text: "AXONS Pulse Bot • Leaderboard" });

  return embed;
}

module.exports = {
  getToday,
  sendBroadcast,
  sendSummary,
  refreshBroadcastEmbed,
  buildExportCSV,
  buildStatusEmbed,
  buildLeaderboardEmbed,
};
