const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

let db = null;
const DB_PATH = process.env.DB_PATH || "./data/pulse.db";

async function initDB() {
  const SQL = await initSqlJs();
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS members (
      discord_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('done', 'skip', 'missed')),
      confirmed_at TEXT,
      UNIQUE(discord_id, date)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS broadcast_messages (
      date TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      channel_id TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS checkin_qa (
      discord_id TEXT NOT NULL,
      date TEXT NOT NULL,
      question_index INTEGER NOT NULL,
      answer TEXT NOT NULL,
      PRIMARY KEY (discord_id, date)
    )
  `);

  save();
  console.log("[DB] Initialized successfully");
}

function save() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// ── Member management ──

function addMember(discordId, displayName) {
  db.run(
    `INSERT OR REPLACE INTO members (discord_id, display_name, active) VALUES (?, ?, 1)`,
    [discordId, displayName],
  );
  save();
}

function removeMember(discordId) {
  db.run(`UPDATE members SET active = 0 WHERE discord_id = ?`, [discordId]);
  save();
}

function getActiveMembers() {
  return (
    db
      .exec(
        `SELECT discord_id, display_name FROM members WHERE active = 1 ORDER BY display_name`,
      )[0]
      ?.values.map(([id, name]) => ({ discordId: id, displayName: name })) || []
  );
}

function getMemberCount() {
  const result = db.exec(`SELECT COUNT(*) FROM members WHERE active = 1`);
  return result[0]?.values[0][0] || 0;
}

// ── Check-in management ──

function recordCheckin(discordId, date, status) {
  db.run(
    `INSERT OR REPLACE INTO checkins (discord_id, date, status, confirmed_at)
     VALUES (?, ?, ?, strftime('%Y-%m-%d %H:%M:%f','now','localtime'))`,
    [discordId, date, status],
  );
  save();
}

function getCheckins(date) {
  const result = db.exec(
    `SELECT c.discord_id, m.display_name, c.status, c.confirmed_at
     FROM checkins c
     JOIN members m ON c.discord_id = m.discord_id
     WHERE c.date = ? AND m.active = 1
     ORDER BY c.confirmed_at ASC`,
    [date],
  );
  return (
    result[0]?.values.map(([id, name, status, time]) => ({
      discordId: id,
      displayName: name,
      status,
      confirmedAt: time,
    })) || []
  );
}

function getPendingMembers(date) {
  const result = db.exec(
    `SELECT m.discord_id, m.display_name
     FROM members m
     WHERE m.active = 1
       AND m.discord_id NOT IN (
         SELECT discord_id FROM checkins WHERE date = ?
       )`,
    [date],
  );
  return (
    result[0]?.values.map(([id, name]) => ({
      discordId: id,
      displayName: name,
    })) || []
  );
}

function getStreak(discordId) {
  const result = db.exec(
    `SELECT date FROM checkins
     WHERE discord_id = ? AND status = 'done'
     ORDER BY date DESC`,
    [discordId],
  );
  if (!result[0]) return 0;

  const dates = result[0].values.map(([d]) => d);
  let streak = 0;
  const today = new Date();

  for (let i = 0; i < dates.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    while (expected.getDay() === 0 || expected.getDay() === 6) {
      expected.setDate(expected.getDate() - 1);
    }
    const y = expected.getFullYear();
    const m = String(expected.getMonth() + 1).padStart(2, "0");
    const d = String(expected.getDate()).padStart(2, "0");
    const expectedStr = `${y}-${m}-${d}`;
    if (dates[i] === expectedStr) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

function getWeeklyCheckins(startDate, endDate) {
  const result = db.exec(
    `SELECT c.discord_id, m.display_name, c.date, c.status, c.confirmed_at
     FROM checkins c
     JOIN members m ON c.discord_id = m.discord_id
     WHERE c.date >= ? AND c.date <= ? AND m.active = 1
     ORDER BY c.date ASC, c.confirmed_at ASC`,
    [startDate, endDate],
  );
  return (
    result[0]?.values.map(([id, name, date, status, time]) => ({
      discordId: id,
      displayName: name,
      date,
      status,
      confirmedAt: time,
    })) || []
  );
}

function getWeeklyStats(startDate, endDate) {
  const members = getActiveMembers();
  const result = db.exec(
    `SELECT discord_id, status, COUNT(*) as cnt
     FROM checkins
     WHERE date >= ? AND date <= ?
     GROUP BY discord_id, status`,
    [startDate, endDate],
  );

  const statsMap = {};
  if (result[0]) {
    result[0].values.forEach(([id, status, cnt]) => {
      if (!statsMap[id]) statsMap[id] = { done: 0, skip: 0, missed: 0 };
      statsMap[id][status] = cnt;
    });
  }

  return members.map((m) => ({
    ...m,
    done: statsMap[m.discordId]?.done || 0,
    skip: statsMap[m.discordId]?.skip || 0,
    missed: statsMap[m.discordId]?.missed || 0,
  }));
}

// ── Broadcast message tracking ──

function setBroadcastMessage(date, messageId, channelId) {
  db.run(
    `INSERT OR REPLACE INTO broadcast_messages (date, message_id, channel_id) VALUES (?, ?, ?)`,
    [date, messageId, channelId],
  );
  save();
}

function getBroadcastMessage(date) {
  const result = db.exec(
    `SELECT message_id, channel_id FROM broadcast_messages WHERE date = ?`,
    [date],
  );
  if (!result[0]) return null;
  return {
    messageId: result[0].values[0][0],
    channelId: result[0].values[0][1],
  };
}

function resetToday(date) {
  // Clear check-ins + Q&A; keep broadcast_messages so the existing
  // broadcast's buttons remain valid for users to re-check-in.
  db.run(`DELETE FROM checkins WHERE date = ?`, [date]);
  db.run(`DELETE FROM checkin_qa WHERE date = ?`, [date]);
  save();
}

// ── Daily Q&A (fun question shown in Done confirmation modal) ──

function recordQA(discordId, date, questionIndex, answer) {
  db.run(
    `INSERT OR REPLACE INTO checkin_qa (discord_id, date, question_index, answer)
     VALUES (?, ?, ?, ?)`,
    [discordId, date, questionIndex, answer],
  );
  save();
}

function getQAForDate(date) {
  const result = db.exec(
    `SELECT q.discord_id, m.display_name, q.question_index, q.answer
     FROM checkin_qa q
     JOIN members m ON q.discord_id = m.discord_id
     WHERE q.date = ? AND m.active = 1
     ORDER BY q.discord_id`,
    [date],
  );
  return (
    result[0]?.values.map(([id, name, qi, ans]) => ({
      discordId: id,
      displayName: name,
      questionIndex: qi,
      answer: ans,
    })) || []
  );
}

function getMyQA(discordId, date) {
  const result = db.exec(
    `SELECT question_index, answer FROM checkin_qa
     WHERE discord_id = ? AND date = ?`,
    [discordId, date],
  );
  if (!result[0]) return null;
  const [qi, ans] = result[0].values[0];
  return { questionIndex: qi, answer: ans };
}

module.exports = {
  initDB,
  addMember,
  removeMember,
  getActiveMembers,
  getMemberCount,
  recordCheckin,
  getCheckins,
  getPendingMembers,
  getStreak,
  getWeeklyCheckins,
  getWeeklyStats,
  setBroadcastMessage,
  getBroadcastMessage,
  resetToday,
  recordQA,
  getQAForDate,
  getMyQA,
};
