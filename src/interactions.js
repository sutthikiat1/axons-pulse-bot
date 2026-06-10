const {
  EmbedBuilder,
  AttachmentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");
const dayjs = require("dayjs");
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
  getRandomQuestion,
  getQuestionByIndex,
} = require("./reminder");

// Question/answer mode driven by src/questions.config.js
const {
  isFixedMode,
  getCorrectAnswer,
} = require("./questions.config");

// ── Shared check-in flow (used by both button Skip and modal Done) ──

async function processCheckin(interaction, status, qa = null) {
  const today = getToday();
  const userId = interaction.user.id;

  const members = db.getActiveMembers();
  const isMember = members.some((m) => m.discordId === userId);

  if (!isMember) {
    return interaction.reply({
      content:
        "❌ คุณยังไม่ได้อยู่ในรายชื่อ tracking ให้แจ้ง admin ใช้ `/pulse-admin add` เพิ่มคุณก่อน",
      ephemeral: true,
    });
  }

  const checkins = db.getCheckins(today);
  const existing = checkins.find((c) => c.discordId === userId);

  if (existing) {
    return interaction.reply({
      content: `📌 คุณ check-in วันนี้แล้ว (${existing.status === "done" ? "✅ Done" : "⏭️ Skip"})`,
      ephemeral: true,
    });
  }

  db.recordCheckin(userId, today, status);
  if (qa) {
    db.recordQA(userId, today, qa.questionIndex, qa.answer);
  }

  const streak = db.getStreak(userId);
  const myCheckin = db.getCheckins(today).find((c) => c.discordId === userId);
  const clickedAt = myCheckin?.confirmedAt
    ? dayjs(myCheckin.confirmedAt).format("HH:mm:ss.SSS")
    : "--:--:--.---";

  let msg;
  if (status === "done") {
    const rank = getDailyRank(userId, today);
    const earned = pointsForRank(rank, "done");
    const weeklyTotal = getUserWeeklyScore(userId);
    const lines = [
      `✅ Confirmed! บันทึกเมื่อ \`${clickedAt}\``,
      `🏁 Rank วันนี้: **#${rank}** (+${earned} pts)`,
      `🏆 รวมสัปดาห์นี้: **${weeklyTotal} pts**`,
      `🔥 Streak: **${streak} days**`,
    ];
    if (qa) {
      const qText = getQuestionByIndex(qa.questionIndex) || "(unknown)";
      lines.push(
        "",
        "─── 🎭 คำตอบของคุณ ───",
        `❓ ${qText}`,
        `💬 ${qa.answer}`,
      );
    }
    msg = lines.join("\n");
  } else {
    const weeklyTotal = getUserWeeklyScore(userId);
    msg = [
      `⏭️ Skipped today (ลา/WFH) (+1 pt) — กดเมื่อ \`${clickedAt}\``,
      `🏆 รวมสัปดาห์นี้: **${weeklyTotal} pts**`,
    ].join("\n");
  }

  await interaction.reply({ content: msg, ephemeral: true });
  await refreshBroadcastEmbed(interaction.client);
}

// Active check-in window: 17:00 – 19:00 (inclusive of 19:00:00)
const CHECKIN_WINDOW_START_MIN = 17 * 60; // 17:00
const CHECKIN_WINDOW_END_MIN = 19 * 60; // 19:00

function isWithinCheckinWindow() {
  const now = dayjs();
  const minutes = now.hour() * 60 + now.minute();
  return (
    minutes >= CHECKIN_WINDOW_START_MIN && minutes <= CHECKIN_WINDOW_END_MIN
  );
}

// ── Button handler ──

async function handleButton(interaction) {
  // Time gate — block clicks outside 17:00–19:00 window
  if (!isWithinCheckinWindow()) {
    return interaction.reply({
      content:
        "❌ ปุ่มใช้งานได้เฉพาะช่วง **17:00 – 19:00 น.** เท่านั้น (Asia/Bangkok)",
      ephemeral: true,
    });
  }

  // Only accept clicks on today's current official broadcast message.
  // Blocks: yesterday's leftover buttons, overwritten test broadcasts,
  // any clicks before today's broadcast has been sent.
  // const today = getToday();
  // const msgData = db.getBroadcastMessage(today);
  // if (!msgData || interaction.message?.id !== msgData.messageId) {
  //   return interaction.reply({
  //     content:
  //       "❌ ปุ่มนี้ไม่ใช่ broadcast ล่าสุดของวันนี้ — ต้องใช้ปุ่มจาก broadcast ล่าสุดเท่านั้น (รอ 17:00 หรือดูข้อความ broadcast ใหม่สุด)",
  //     ephemeral: true,
  //   });
  // }

  // Export CSV (disabled — uncomment to re-enable)
  // if (interaction.customId === "pulse_export") {
  //   const today = getToday();
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

  // Wait → fake reminder, no check-in recorded
  if (interaction.customId === "pulse_wait") {
    return interaction.reply({
      content: "⏳ อย่าลืมบันทึกข้อมูลในระบบนะ",
      ephemeral: true,
    });
  }

  // Done → open daily-question modal (recorded only after user submits valid answer)
  if (interaction.customId === "pulse_done") {
    const { index, text } = getRandomQuestion();
    const modal = new ModalBuilder()
      .setCustomId(`pulse_done_confirm_${index}`)
      .setTitle("🎭 ตอบคำถามก่อน check-in");

    const fixed = isFixedMode();
    const input = new TextInputBuilder()
      .setCustomId("answer_text")
      .setLabel(text)
      .setPlaceholder(
        fixed
          ? "ตอบให้ถูก พิมผิด = ไม่บันทึก"
          : "ตอบอะไรก็ได้ (อย่างน้อย 3 ตัวอักษร)",
      )
      .setStyle(fixed ? TextInputStyle.Short : TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(fixed ? 50 : 500);

    if (!fixed) input.setMinLength(3);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // Skip → record immediately (no confirmation needed)
  if (interaction.customId === "pulse_skip") {
    return processCheckin(interaction, "skip");
  }
}

// ── Modal submit handler ──

async function handleModalSubmit(interaction) {
  if (interaction.customId.startsWith("pulse_done_confirm_")) {
    const indexStr = interaction.customId.replace("pulse_done_confirm_", "");
    const questionIndex = Number.parseInt(indexStr, 10);
    const answer = interaction.fields.getTextInputValue("answer_text").trim();

    // Validation: in fixed mode, must exact-match the correct answer
    const correctAnswer = getCorrectAnswer();
    if (correctAnswer !== null && answer !== correctAnswer) {
      return interaction.reply({
        content: `❌ ตอบไม่ถูก ไม่บันทึกข้อมูล — ลองอีกที (กด Done ใหม่)`,
        ephemeral: true,
      });
    }

    return processCheckin(interaction, "done", { questionIndex, answer });
  }
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

    if (sub === "reset-today") {
      const today = getToday();
      db.resetToday(today);
      await refreshBroadcastEmbed(interaction.client);
      return interaction.reply({
        content: `🗑️ ลบ check-in ของวันที่ **${today}** แล้ว — broadcast เดิมยังกดได้ ทุกคนสามารถ check-in ใหม่ได้`,
        ephemeral: true,
      });
    }
  }
}

module.exports = { handleButton, handleCommand, handleModalSubmit };
