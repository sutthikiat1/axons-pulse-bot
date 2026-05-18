const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const db = require("./db");
const {
  getToday,
  refreshBroadcastEmbed,
  buildExportCSV,
  buildStatusEmbed,
  buildLeaderboardEmbed,
  sendBroadcast,
  sendSummary,
  getDailyRank,
  pointsForRank,
  getUserWeeklyScore,
} = require("./reminder");

// ── Button handler ──

async function handleButton(interaction) {
  const today = getToday();
  const userId = interaction.user.id;

  // Export CSV (disabled — uncomment to re-enable)
  // if (interaction.customId === "pulse_export") {
  //   const csv = buildExportCSV(today);
  //   const buffer = Buffer.from(csv, "utf-8");
  //   const attachment = new AttachmentBuilder(buffer, {
  //     name: `pulse-checkin-${today}.csv`,
  //   });
  //   return interaction.reply({
  //     content: `📊 Export สำหรับวันที่ ${today}`,
  //     files: [attachment],
  //     ephemeral: true,
  //   });
  // }

  // Check if user is a tracked member
  const members = db.getActiveMembers();
  const isMember = members.some((m) => m.discordId === userId);

  if (!isMember) {
    return interaction.reply({
      content:
        "❌ คุณยังไม่ได้อยู่ในรายชื่อ tracking ให้แจ้ง admin ใช้ `/pulse-admin add` เพิ่มคุณก่อน",
      ephemeral: true,
    });
  }

  // Check if already checked in today
  const checkins = db.getCheckins(today);
  const existing = checkins.find((c) => c.discordId === userId);

  if (existing) {
    return interaction.reply({
      content: `📌 คุณ check-in วันนี้แล้ว (${existing.status === "done" ? "✅ Done" : "⏭️ Skip"})`,
      ephemeral: true,
    });
  }

  // Record check-in
  const status = interaction.customId === "pulse_done" ? "done" : "skip";
  db.recordCheckin(userId, today, status);

  // Reply ephemeral (only user sees)
  const streak = db.getStreak(userId);
  let msg;
  if (status === "done") {
    const rank = getDailyRank(userId, today);
    const earned = pointsForRank(rank, "done");
    const weeklyTotal = getUserWeeklyScore(userId);
    msg = [
      `✅ Confirmed!`,
      `🏁 Rank วันนี้: **#${rank}** (+${earned} pts)`,
      `🏆 รวมสัปดาห์นี้: **${weeklyTotal} pts**`,
      `🔥 Streak: **${streak} days**`,
    ].join("\n");
  } else {
    const weeklyTotal = getUserWeeklyScore(userId);
    msg = [
      `⏭️ Skipped today (ลา/WFH) (+1 pt)`,
      `🏆 รวมสัปดาห์นี้: **${weeklyTotal} pts**`,
    ].join("\n");
  }

  await interaction.reply({ content: msg, ephemeral: true });

  // Refresh the broadcast embed with updated attendee list
  await refreshBroadcastEmbed(interaction.client);
}

// ── Slash command handler ──

async function handleCommand(interaction) {
  const { commandName, options } = interaction;

  if (commandName === "pulse") {
    const sub = options.getSubcommand();

    if (sub === "status") {
      const embed = buildStatusEmbed();
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "mystats") {
      const userId = interaction.user.id;
      const streak = db.getStreak(userId);
      const members = db.getActiveMembers();
      const isMember = members.some((m) => m.discordId === userId);

      if (!isMember) {
        return interaction.reply({
          content: "❌ คุณยังไม่ได้อยู่ในรายชื่อ tracking",
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📊 My Pulse Stats")
        .addFields(
          { name: "🔥 Current Streak", value: `${streak} days`, inline: true },
          { name: "👤 User", value: `<@${userId}>`, inline: true },
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === "leaderboard") {
      const embed = buildLeaderboardEmbed();
      return interaction.reply({ embeds: [embed] });
    }
  }

  if (commandName === "pulse-admin") {
    const sub = options.getSubcommand();

    if (sub === "add") {
      const user = options.getUser("user");
      if (user.bot) {
        return interaction.reply({
          content: "❌ ไม่สามารถเพิ่ม bot ได้",
          ephemeral: true,
        });
      }
      db.addMember(user.id, user.displayName || user.username);
      return interaction.reply({
        content: `✅ เพิ่ม <@${user.id}> เข้ารายชื่อ tracking แล้ว`,
        ephemeral: true,
      });
    }

    if (sub === "remove") {
      const user = options.getUser("user");
      db.removeMember(user.id);
      return interaction.reply({
        content: `🗑️ ลบ <@${user.id}> ออกจากรายชื่อ tracking แล้ว`,
        ephemeral: true,
      });
    }

    if (sub === "list") {
      const members = db.getActiveMembers();
      if (members.length === 0) {
        return interaction.reply({
          content:
            "📭 ยังไม่มีสมาชิกในรายชื่อ ใช้ `/pulse-admin add` เพื่อเพิ่ม",
          ephemeral: true,
        });
      }

      const list = members
        .map((m, i) => `${i + 1}. <@${m.discordId}> (${m.displayName})`)
        .join("\n");

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`👥 Tracked Members (${members.length})`)
        .setDescription(list)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "add-role") {
      const role = options.getRole("role");
      await interaction.deferReply({ ephemeral: true });

      const guild = interaction.guild;
      await guild.members.fetch();
      const membersWithRole = guild.members.cache.filter(
        (m) => m.roles.cache.has(role.id) && !m.user.bot,
      );

      let added = 0;
      for (const [, member] of membersWithRole) {
        db.addMember(member.id, member.displayName || member.user.username);
        added++;
      }

      return interaction.editReply({
        content: `✅ เพิ่ม ${added} สมาชิกจาก role **${role.name}** เข้ารายชื่อ tracking แล้ว`,
        ephemeral: true,
      });
    }

    if (sub === "broadcast") {
      await interaction.deferReply({ ephemeral: true });
      await sendBroadcast(interaction.channel);
      return interaction.editReply({ content: "✅ Broadcast sent!" });
    }

    if (sub === "summary") {
      await interaction.deferReply({ ephemeral: true });
      await sendSummary(interaction.channel);
      return interaction.editReply({ content: "✅ Summary sent!" });
    }
  }
}

module.exports = { handleButton, handleCommand };
