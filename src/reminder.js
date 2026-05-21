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

// ── Daily fun questions (shown in Done confirmation modal) ──
// Single-question mode for today — everyone gets the same prompt.
// To restore the full random pool: comment out the line below and
// uncomment the array beneath it.
const DAILY_QUESTIONS = ["มือถือใช้โทรหรือใช้ทอดไข่?"];

// const DAILY_QUESTIONS = [
//   "ลิเวอร์พูล กับ แมนยู ใครเก่งกว่า",
//   "ชอบเมนูอาหารอะไร 🍜",
//   "ขาดเงินหรือขาดรัก",
//   "จะลบแอปอะไร",
//   "โมโหเหมือนสัตว์อะไร",
//   "อยาก mute ใคร",
//   "รวยแล้วทำอะไร",
//   "พูดคำไหนบ่อยสุด",
//   "กินอะไรได้ทุกวัน",
//   "เพลงประจำช่วงนี้คือ",
//   "ตัวเองเป็นสีอะไร",
//   "งอนแล้วเงียบไหม",
//   "โลกแตกจะทำอะไร",
//   "คนแบบไหนน่ารำคาญ",
//   "อยากมีพลังอะไร",
//   "เหนื่อยเรื่องอะไร",
//   "อยากติดเกาะกับใคร",
//   "อยากเปลี่ยนชื่อเป็นอะไร",
//   "ซื้ออะไรเปลืองสุด",
//   "ฟังเพลงไหนวนได้",
//   "สกิลเด่นของตัวเองคือ",
//   "เรื่องไหนโป๊ะสุด",
//   "แฟนเก่าทักจะตอบว่า",
//   "มีล้านแรกจะทำอะไร",
//   "ชีวิตเหมือนวันอะไร",
//   "อยากบอกอะไรตัวเอง ✨",
//   "นอนกี่โมงเมื่อคืน",
//   "ดองแชตเก่งไหม",
//   "ติดหวานหรือสายขม",
//   "ขี้หึงไหม",
//   "ชอบคนพูดเก่งไหม",
//   "Introvert หรือ extrovert",
//   "ใช้เงินเก่งไหม",
//   "ตอนนี้อยากได้อะไรสุด",
//   "แอบส่องใครบ่อยไหม",
//   "ขี้งอนหรือขี้เบื่อ",
//   "คิดถึงใครอยู่ไหม",
//   "ติดมือถือวันละกี่ชม.",
//   "ชอบกลางวันหรือกลางคืน",
//   "มีเพลงอกหักประจำตัวไหม",
//   "ล่าสุดร้องไห้เพราะอะไร",
//   "ถ้าหายไป 1 วัน จะไปไหน",
//   "ช่วงนี้คลั่งอะไรอยู่",
//   "อยากพักหรืออยากเที่ยว",
//   "คนแบบไหนแพ้ทาง",
//   "เคยเผลอเรียกผิดชื่อไหม",
//   "ชอบตัวเองตอนอยู่กับใคร",
//   "มีเรื่องไหนอยากลืม",
//   "ตอนนี้หัวใจสีอะไร",
//   "อยากได้กอดไหม",
//   "มีเรื่องอะไรที่ยังไม่พูด 👀",
// ];

function getRandomQuestion() {
  const index = Math.floor(Math.random() * DAILY_QUESTIONS.length);
  return { index, text: DAILY_QUESTIONS[index] };
}

function getQuestionByIndex(index) {
  return DAILY_QUESTIONS[index] ?? null;
}

function getStreakEmoji(streak) {
  if (streak >= 20) return "👑";
  if (streak >= 10) return "⭐";
  if (streak >= 5) return "🔥";
  if (streak >= 3) return "✨";
  return "";
}

// ── Scoring ──
// Reset weekly: scores are computed dynamically from Monday → today.

function getWeekStart() {
  const today = dayjs();
  const dow = today.day(); // Sun=0, Mon=1, ..., Sat=6
  const offset = dow === 0 ? -6 : 1 - dow;
  return today.add(offset, "day").format("YYYY-MM-DD");
}

function pointsForRank(rank, status) {
  if (status === "skip") return 1;
  if (status === "missed") return 0;
  // status === "done"
  if (rank === 1) return 10;
  if (rank === 2) return 8;
  if (rank === 3) return 6;
  if (rank <= 5) return 4;
  return 2;
}

function getDailyRank(discordId, date) {
  const dayCheckins = db.getCheckins(date);
  const doneSorted = dayCheckins
    .filter((c) => c.status === "done")
    .sort((a, b) => (a.confirmedAt || "").localeCompare(b.confirmedAt || ""));
  const idx = doneSorted.findIndex((c) => c.discordId === discordId);
  return idx === -1 ? null : idx + 1;
}

function calculateWeeklyScores() {
  const weekStart = getWeekStart();
  const today = getToday();
  const checkins = db.getWeeklyCheckins(weekStart, today);

  const byDate = {};
  for (const c of checkins) {
    if (!byDate[c.date]) byDate[c.date] = [];
    byDate[c.date].push(c);
  }

  const scores = {};
  for (const date in byDate) {
    const dayCheckins = byDate[date];
    const doneSorted = dayCheckins
      .filter((c) => c.status === "done")
      .sort((a, b) => (a.confirmedAt || "").localeCompare(b.confirmedAt || ""));

    doneSorted.forEach((c, idx) => {
      const pts = pointsForRank(idx + 1, "done");
      if (!scores[c.discordId])
        scores[c.discordId] = { displayName: c.displayName, points: 0 };
      scores[c.discordId].points += pts;
    });

    for (const c of dayCheckins) {
      if (c.status === "skip" || c.status === "missed") {
        const pts = pointsForRank(0, c.status);
        if (!scores[c.discordId])
          scores[c.discordId] = { displayName: c.displayName, points: 0 };
        scores[c.discordId].points += pts;
      }
    }
  }

  return Object.entries(scores)
    .map(([discordId, s]) => ({
      discordId,
      displayName: s.displayName,
      points: s.points,
    }))
    .sort((a, b) => b.points - a.points);
}

function getUserWeeklyScore(discordId) {
  const all = calculateWeeklyScores();
  return all.find((s) => s.discordId === discordId)?.points || 0;
}

function buildWeeklyScoreboardText() {
  const scores = calculateWeeklyScores();
  if (scores.length === 0) return "_ยังไม่มีคะแนนสัปดาห์นี้_";
  const medals = ["🥇", "🥈", "🥉"];
  return scores
    .slice(0, 10)
    .map((s, i) => {
      const prefix = medals[i] || `**${i + 1}.**`;
      return `${prefix} <@${s.discordId}> — **${s.points}** pts`;
    })
    .join("\n");
}

function getWeeklyPeriodText() {
  const weekStart = dayjs(getWeekStart());
  const weekEnd = weekStart.add(6, "day"); // Sunday
  const nextReset = weekStart.add(7, "day"); // Next Monday
  return `📅 ช่วง ${weekStart.format("DD MMM")} – ${weekEnd.format("DD MMM")} • 🔄 รีเซ็ตจันทร์ ${nextReset.format("DD MMM")} 00:00 น.`;
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

  // Build Q&A lookup map (only Done check-ins have Q&A)
  const qaList = db.getQAForDate(today);
  const qaByUser = {};
  for (const q of qaList) qaByUser[q.discordId] = q;

  let attendeeText = "";
  if (checkins.length > 0) {
    attendeeText = checkins
      .map((c, i) => {
        const time = c.confirmedAt
          ? dayjs(c.confirmedAt).format("HH:mm:ss.SSS")
          : "--:--:--.---";
        const icon = c.status === "done" ? "✅" : "⏭️";
        let line = `${i + 1}. ${icon} <@${c.discordId}> — ${c.displayName} @ \`${time}\``;

        const qa = qaByUser[c.discordId];
        if (qa && c.status === "done") {
          const qText = getQuestionByIndex(qa.questionIndex) || "(?)";
          line += `\n   ❓ ${qText}\n   💬 ${qa.answer}`;
        }
        return line;
      })
      .join("\n");
  } else {
    attendeeText = "_ยังไม่มีคน check-in_";
  }

  const scoreboardText = buildWeeklyScoreboardText();
  const periodText = getWeeklyPeriodText();

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📋 AXONS Pulse — Daily Check-in")
    .setDescription(
      [
        `📅 **${dayjs().format("DD MMM YYYY")}** (${dayjs().format("dddd")})`,
        `⏰ Deadline: **19:00** today`,
        "",
        `👥 **Attendee Count**`,
        `${checkedIn}/${memberCount}`,
        "",
        `📋 **Attendees**`,
        attendeeText,
        "",
        `🏆 **Weekly Scoreboard**`,
        periodText,
        scoreboardText,
      ].join("\n"),
    )
    .setTimestamp()
    .setFooter({ text: "AXONS Pulse Bot • กด Done เมื่อทำ Pulse แล้ว" });

  return embed;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Build Done + Skip + Wait buttons. All 3 are shuffled to random
// positions every broadcast. Wait is a "fake" button that only shows
// a reminder ephemeral message — does not record a check-in.
function buildBroadcastButtons() {
  const doneBtn = new ButtonBuilder()
    .setCustomId("pulse_done")
    .setLabel("✅ Done")
    .setStyle(ButtonStyle.Success);

  const skipBtn = new ButtonBuilder()
    .setCustomId("pulse_skip")
    .setLabel("⏭️ Skip (ลา/WFH)")
    .setStyle(ButtonStyle.Secondary);

  const waitBtn = new ButtonBuilder()
    .setCustomId("pulse_wait")
    .setLabel("⏳ Wait")
    .setStyle(ButtonStyle.Primary);

  const shuffled = shuffleArray([doneBtn, skipBtn, waitBtn]);
  const row = new ActionRowBuilder().addComponents(...shuffled);
  return [row];
}

async function sendBroadcast(channel) {
  const embed = buildBroadcastEmbed();
  const components = buildBroadcastButtons();
  const message = await channel.send({
    content: "@everyone",
    embeds: [embed],
    components,
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
    const embed = buildBroadcastEmbed();
    // Only update embed; keep existing components so the shuffled
    // Done position stays fixed for the whole day.
    await message.edit({ embeds: [embed] });
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
  const completionRate =
    total > 0 ? Math.round((done.length / total) * 100) : 0;

  const barLength = 20;
  const filledBars = Math.round((completionRate / 100) * barLength);
  const progressBar =
    "🟩".repeat(filledBars) + "⬜".repeat(barLength - filledBars);

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
        progressBar,
        `**${done.length}/${total}** completed (${completionRate}%)`,
      ].join("\n"),
    )
    .addFields(
      { name: "✅ Done", value: `${done.length}`, inline: true },
      { name: "⏭️ Skipped", value: `${skipped.length}`, inline: true },
      { name: "❌ Missed", value: `${missed.length}`, inline: true },
    );

  if (missed.length > 0) {
    embed.addFields({
      name: "🚨 Missed (ยังไม่ได้ทำ)",
      value: missed.map((m) => `<@${m.discordId}>`).join(" "),
    });
  }

  // Weekly scoreboard (resets every Monday)
  const scoreboardText = buildWeeklyScoreboardText();
  const periodText = getWeeklyPeriodText();
  embed.addFields({
    name: `🏆 Weekly Scoreboard`,
    value: `${periodText}\n${scoreboardText}`,
  });

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
    const time = c.confirmedAt
      ? dayjs(c.confirmedAt).format("HH:mm:ss.SSS")
      : "";
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
      { name: "⏳ Pending", value: `${pending.length}`, inline: true },
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
                `**${i + 1}.** <@${m.discordId}> — ${m.streak} days ${getStreakEmoji(m.streak)}`,
            )
            .join("\n")
        : "No streaks yet! Start checking in to build yours.",
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
  getWeekStart,
  pointsForRank,
  getDailyRank,
  calculateWeeklyScores,
  getUserWeeklyScore,
  buildWeeklyScoreboardText,
  getRandomQuestion,
  getQuestionByIndex,
};
