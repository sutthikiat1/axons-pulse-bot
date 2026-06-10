# AXONS Pulse Bot — Claude Code Playbook

Discord bot ที่ track daily Pulse check-in ของทีม
Production รันบน Railway, auto-deploy เมื่อ push เข้า `main`

---

## โครงสร้างไฟล์ (อ้างอิงได้เลย)

- [src/index.js](src/index.js) — entry point, cron schedules, interaction router
- [src/db.js](src/db.js) — sql.js layer: members, checkins, broadcast_messages, checkin_qa
- [src/commands.js](src/commands.js) — Discord slash command definitions (`/pulse`, `/pulse-admin`)
- [src/questions.config.js](src/questions.config.js) — **คำถาม + คำตอบ + โหมด (open/fixed)** — แก้ที่นี่ที่เดียวจบ
- [src/reminder.js](src/reminder.js) — embeds, buttons, scoring, question helpers (อ่าน pool จาก config)
- [src/interactions.js](src/interactions.js) — button/modal/command handlers, **time gate**, validation logic (อ่าน mode/answer จาก config)

---

## Recipes ที่ user มักขอบ่อย

### 🎯 เปลี่ยนคำถามและโหมดการตอบ

แก้ที่ [src/questions.config.js](src/questions.config.js) ที่เดียว — โค้ดอื่นไม่ต้องแตะ

**Open mode — คำถามสุ่ม + ตอบอะไรก็ได้** (default)
```js
const config = {
  mode: "open",
  randomQuestions: ["คำถาม 1", "คำถาม 2", ...],
  // fixedQuestion/fixedAnswer ปล่อยไว้ก็ได้ ไม่ถูกใช้ตอน open
};
```

**Fixed mode — คำถามเดียว + คำตอบเป๊ะ** (quiz)
```js
const config = {
  mode: "fixed",
  fixedQuestion: "น้ำเปล่าใส่ตู้เย็นแล้วจะเย็นหรือร้อน?",
  fixedAnswer: "เย็น",
};
```

**คำถามเดียว + ตอบอะไรก็ได้** (เคยเรียก Mode C)
```js
const config = {
  mode: "open",
  randomQuestions: ["คำถามเดียวที่ต้องการ"],  // ใส่แค่ตัวเดียว
};
```

Logic ใน [src/interactions.js](src/interactions.js) จะ auto-detect:
- mode `fixed` → modal input style = Short, max 50 chars, validate exact match
- mode `open` → modal style = Paragraph, min 3 chars, max 500, รับทุกคำตอบ

### ⏰ เปลี่ยนเวลา Broadcast / Summary

ต้องแก้ **3 จุดให้สอดคล้องกัน**:

1. **Cron** ใน [src/index.js](src/index.js):
   ```js
   cron.schedule("0 17 * * 1-5", ...)   // broadcast: 17:00 Mon-Fri
   cron.schedule("1 19 * * 1-5", ...)   // summary:  19:01 Mon-Fri
   ```
   Format: `"minute hour DOM month DOW"` — DOW 1-5 = Mon-Fri

2. **Time gate window** ใน [src/interactions.js](src/interactions.js):
   ```js
   const CHECKIN_WINDOW_START_MIN = 17 * 60;  // = broadcast time
   const CHECKIN_WINDOW_END_MIN   = 19 * 60;  // = summary time - 1 min
   ```
   อย่าลืมแก้ข้อความ error ให้ตรงด้วย

3. **Deadline label** ใน [src/reminder.js](src/reminder.js):
   ```js
   `⏰ Deadline: **19:00** today`,
   ```

### 🚪 เปิด / ปิด Time Gate

ใน `handleButton` ของ [src/interactions.js](src/interactions.js):
- **เปิด:** uncomment block `if (!isWithinCheckinWindow()) { return reject... }`
- **ปิด:** comment block นั้น (constant `CHECKIN_WINDOW_START_MIN/END_MIN` + helper `isWithinCheckinWindow` ปล่อยไว้ได้ ไม่ลบ — ง่ายต่อการ revert)

### 🗑️ ล้าง check-in วันนี้ (สำหรับ admin)

ใช้ slash command:
```
/pulse-admin reset-today
```
ลบ `checkins` + `checkin_qa` ของวันนี้ — แต่เก็บ `broadcast_messages` ไว้ → ปุ่ม broadcast เดิมยังกดได้, ทุกคน check-in ใหม่ได้

---

## Deployment

- `git push origin main` → Railway auto-deploy (~1 นาที)
- ดูที่ Railway dashboard → Deployments → ACTIVE ต้องเป็น commit hash ล่าสุด
- **Webhook ค้างบ้าง** — บางครั้ง Railway ไม่รับ push:
  ```bash
  git commit --allow-empty -m "trigger railway redeploy (webhook stuck)"
  git push origin main
  ```
- **Discord client cache** — slash command ใหม่ไม่ขึ้น:
  - **Force quit Discord** (Task Manager → End Task) ไม่ใช่แค่ Ctrl+R
  - หรือลองเครื่อง/account อื่นก่อนว่า server side มีจริงไหม

---

## Key invariants ของระบบ

- **Database:** SQLite via sql.js, ไฟล์เดียวที่ `DB_PATH` (Railway volume `/data/pulse.db`)
- **Tables:**
  - `members` — discord_id, display_name, active
  - `checkins` — discord_id + date (unique), status (done/skip/missed), confirmed_at (ms precision)
  - `broadcast_messages` — date (PK), message_id, channel_id
  - `checkin_qa` — discord_id + date (PK), question_index, answer

- **Scoring (per day):**
  - Done rank 1: 10 pts, rank 2: 8, rank 3: 6, rank 4-5: 4, rank 6+: 2
  - Skip: 1 pt, Missed: 0 pt
  - แก้ formula ที่ `pointsForRank()` ใน [src/reminder.js](src/reminder.js)

- **Weekly scoreboard:** คำนวณ dynamic จาก range `Monday → today` — **"reset" คือผลข้างเคียงของ date range** ไม่มี cron clear, ข้อมูลเก่าไม่ลบ

- **Time precision:** `confirmed_at` ใช้ `strftime('%Y-%m-%d %H:%M:%f','now','localtime')` (ms) สำหรับ rank tie-breaking

---

## Buttons ใน broadcast (3 ปุ่ม, shuffle random ทุก broadcast)

- ✅ **Done** (Success/green) — เปิด modal ถาม question → ตอบถูก/ผ่าน validation = record check-in
- ⏭️ **Skip (ลา/WFH)** (Secondary/grey) — record skip ทันที ไม่ต้อง confirm
- ⏳ **Wait** (Primary/blurple) — fake button, แค่ส่ง ephemeral "อย่าลืมบันทึกข้อมูลในระบบนะ" ไม่ record

แก้ button logic ที่ `buildBroadcastButtons()` ใน [src/reminder.js](src/reminder.js)
แก้ handler ที่ `handleButton()` ใน [src/interactions.js](src/interactions.js)

---

## Defense layers เมื่อกดปุ่ม

ลำดับการเช็คใน `handleButton`:
1. **Time gate** — นอก window → reject
2. **Message ID match** — ต้องเป็น broadcast ล่าสุดของวันนี้ → กันคลิกบนปุ่มเก่า/วันก่อน
3. **Wait button shortcut** → ephemeral reminder, return
4. **Done** → showModal (validate ใน `handleModalSubmit`)
5. **Skip** → `processCheckin(interaction, "skip")`

ใน `processCheckin` (ใช้ร่วมระหว่าง Skip + Done modal):
- เช็ค member tracked
- เช็ค already-checked-in
- record check-in + record QA (ถ้ามี)
- reply ephemeral + refresh broadcast embed

---

## Slash commands ที่มี

**User:**
- `/pulse status` — สถานะวันนี้
- `/pulse mystats` — streak ส่วนตัว
- `/pulse leaderboard` — Top 10 streak

**Admin (ManageGuild only):**
- `/pulse-admin add @user`
- `/pulse-admin remove @user`
- `/pulse-admin list`
- `/pulse-admin add-role @role`
- `/pulse-admin broadcast` — ส่ง reminder ทันที (ไม่รอ cron)
- `/pulse-admin summary` — ส่ง summary ทันที
- `/pulse-admin reset-today` — ล้าง check-in วันนี้

แก้ commands list ที่ [src/commands.js](src/commands.js)
แก้ handler ที่ `handleCommand()` ใน [src/interactions.js](src/interactions.js)

---

## Tips สำหรับ Claude

- **Description ของ slash command** เคยเจอปัญหาเมื่อใช้ภาษาไทย + วงเล็บ → register ไม่ขึ้น → ใช้ ASCII ปลอดภัยกว่า
- **ก่อน push** ทุกครั้ง รัน `node --check src/<file>.js` เช็ค syntax
- **อย่า amend commit ที่ push แล้ว** — สร้าง commit ใหม่
- **User ชอบ commit message สั้นกระชับ** ที่อธิบาย *why* ไม่ใช่ *what*
- **Push to main** ต้อง confirm จาก user ก่อน (auto mode classifier เคยบล็อก)
- **ไม่ใช้ emoji** ในโค้ดหรือ commit message ยกเว้น user ขอเอง / มี emoji ใน Thai UI text อยู่แล้ว
