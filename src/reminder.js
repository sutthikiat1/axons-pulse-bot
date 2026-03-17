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

// ── 17:00 Broadcast ──

function buildBroadcastEmbed() {
  const today = getToday();
  const memberCount = db.getMemberCount();
  const pending = db.getPendingMembers(today);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📋 AXONS Pulse — Daily Check-in")
    .setDescription(
      [
        "สวัสดีทีม! อย่าลืมทำ **AXONS Pulse** check-in ประจำวันนี้นะครับ",
        "",
        `⏰ Deadline: **18:00** วันนี้`,
        `👥 Pending: **${pending.length}/${memberCount}** members`,
        "",
        "กดปุ่มด้านล่างหลังจากทำ Pulse เสร็จแล้ว",
      ].join("\n")
    )
    .addFields(
      { name: "📅 Date", value: dayjs().format("DD MMM YYYY"), inline: true },
      { name: "📆 Day", value: dayjs().format("dddd"), inline: true },
      {
        name: "📊 Status",
        value: pending.length === memberCount ? "🟡 Awaiting" : "🟢 In Progress",
        inline: true,
      }
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
      .setStyle(ButtonStyle.Secondary)
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
  console.log(`[BROADCAST] Sent daily reminder: ${getToday()}`);
  return message;
}

// ── 18:00 Summary ──

function buildSummaryEmbed() {
  const today = getToday();
  const members = db.getActiveMembers();
  const checkins = db.getCheckins(today);
  const pending = db.getPendingMembers(today);

  // Mark pending as missed
  for (const member of pending) {
    db.recordCheckin(member.discordId, today, "missed");
  }

  // Re-fetch after marking missed
  const finalCheckins = db.getCheckins(today);
  const done = finalCheckins.filter((c) => c.status === "done");
  const skipped = finalCheckins.filter((c) => c.status === "skip");
  const missed = finalCheckins.filter((c) => c.status === "missed");

  const total = members.length;
  const completionRate = total > 0 ? Math.round((done.length / total) * 100) : 0;

  // Progress bar
  const barLength = 20;
  const filledBars = Math.round((completionRate / 100) * barLength);
  const progressBar =
    "🟩".repeat(filledBars) + "⬜".repeat(barLength - filledBars);

  // Top streaks
  const streaks = members
    .map((m) => ({ ...m, streak: db.getStreak(m.discordId) }))
    .filter((m) => m.streak > 0)
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 3);

  const embed = new EmbedBuilder()
    .setColor(missed.length === 0 ? 0x23a559 : 0xf0b232)
    .setTitle("📊 Daily Summary — " + dayjs().format("DD MMM YYYY"))
    .setDescription(
      [
        `${progressBar}`,
        `**${done.length}/${total}** completed (${completionRate}%)`,
      ].join("\n")
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

  embed
    .setTimestamp()
    .setFooter({ text: "AXONS Pulse Bot • Daily Summary" });

  return embed;
}

async function sendSummary(channel) {
  const embed = buildSummaryEmbed();
  await channel.send({ embeds: [embed] });
  console.log(`[SUMMARY] Sent daily summary: ${getToday()}`);
}

// ── Button confirm response ──

function buildConfirmEmbed(discordId, status) {
  const today = getToday();
  const streak = db.getStreak(discordId);
  const streakEmoji = getStreakEmoji(streak);

  if (status === "done") {
    return new EmbedBuilder()
      .setColor(0x23a559)
      .setDescription(
        `✅ <@${discordId}> confirmed! ${streakEmoji} Streak: **${streak} days**`
      )
      .setTimestamp();
  } else {
    return new EmbedBuilder()
      .setColor(0x95a5a6)
      .setDescription(`⏭️ <@${discordId}> skipped today (ลา/WFH)`)
      .setTimestamp();
  }
}

// ── Status embed ──

function buildStatusEmbed() {
  const today = getToday();
  const members = db.getActiveMembers();
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
  buildConfirmEmbed,
  buildStatusEmbed,
  buildLeaderboardEmbed,
};
