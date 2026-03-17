# AXONS Pulse Bot

Discord bot สำหรับแจ้งเตือนและ track การ check-in AXONS Pulse ประจำวัน

## Features

- **17:00 Daily Broadcast** — ส่ง reminder พร้อมปุ่ม Done / Skip
- **18:00 Daily Summary** — สรุปผลประจำวัน พร้อม mention คนที่ missed
- **Streak Tracking** — นับวันติดต่อกัน + emoji ตาม streak
- **Slash Commands** — `/pulse status`, `/pulse leaderboard`, `/pulse mystats`
- **Admin Commands** — `/pulse-admin add/remove/list/add-role/broadcast/summary`
- **Skip Weekends** — ไม่แจ้งเตือนวันเสาร์-อาทิตย์

---

## Step-by-Step Deployment Guide

### Step 1: สร้าง Discord Bot

1. ไปที่ https://discord.com/developers/applications
2. คลิก **"New Application"** → ตั้งชื่อ `PulseBot` → Create
3. ไปแท็บ **"Bot"**:
   - คลิก **"Reset Token"** → **Copy token** (เก็บไว้ ห้ามแชร์!)
   - เปิด **"Message Content Intent"** → Save
   - เปิด **"Server Members Intent"** → Save
4. ไปแท็บ **"OAuth2"**:
   - เลือก scopes: `bot`, `applications.commands`
   - เลือก permissions: `Send Messages`, `Use Slash Commands`, `Embed Links`, `Mention Everyone`, `Read Message History`
   - Copy URL → เปิดในเบราว์เซอร์ → เลือก server → Authorize

### Step 2: เตรียม Discord IDs

1. เปิด Discord → Settings → Advanced → เปิด **Developer Mode**
2. คลิกขวาที่ **server name** → Copy Server ID → นี่คือ `GUILD_ID`
3. คลิกขวาที่ **#pulse-checkin channel** → Copy Channel ID → นี่คือ `CHANNEL_ID`

### Step 3: Push โค้ดขึ้น GitHub

```bash
# Clone หรือสร้าง repo ใหม่
git init
git add .
git commit -m "Initial commit: AXONS Pulse Bot"
git remote add origin https://github.com/YOUR_USERNAME/axons-pulse-bot.git
git push -u origin main
```

### Step 4: Deploy บน Railway

1. ไปที่ https://railway.com → Sign in ด้วย GitHub
2. คลิก **"New Project"** → **"Deploy from GitHub Repo"**
3. เลือก repo `axons-pulse-bot`
4. Railway จะ detect Dockerfile อัตโนมัติ

### Step 5: ตั้ง Environment Variables บน Railway

1. ในหน้า project → คลิก service ที่สร้าง
2. ไปแท็บ **"Variables"** → เพิ่มทีละตัว:

| Variable | Value |
|---|---|
| `DISCORD_TOKEN` | Token จาก Step 1 |
| `GUILD_ID` | Server ID จาก Step 2 |
| `CHANNEL_ID` | Channel ID จาก Step 2 |
| `TZ` | `Asia/Bangkok` |
| `DB_PATH` | `/data/pulse.db` |

### Step 6: เพิ่ม Volume (เก็บข้อมูลถาวร)

1. ในหน้า project → คลิก **"+ New"** → **"Volume"**
2. ตั้งชื่อ: `pulse-data`
3. Mount path: `/data`
4. เชื่อมกับ service ของ bot

### Step 7: Deploy!

1. Railway จะ auto-deploy ทันที
2. ดู logs ในแท็บ **"Deployments"** → ควรเห็น:
   ```
   [BOT] Logged in as PulseBot#1234
   [DB] Initialized successfully
   [CMD] Registered 2 slash commands
   [CRON] Scheduled: 17:00 broadcast, 18:00 summary (Asia/Bangkok)
   [BOT] Ready and scheduled!
   ```

### Step 8: เพิ่มสมาชิก

ใน Discord พิมพ์:

```
/pulse-admin add-role @Developer    ← เพิ่มทั้ง role
/pulse-admin add @username          ← เพิ่มทีละคน
/pulse-admin list                   ← ดูรายชื่อทั้งหมด
```

### Step 9: ทดสอบ

```
/pulse-admin broadcast   ← ทดสอบส่ง reminder ตอนนี้เลย
/pulse-admin summary     ← ทดสอบส่ง summary ตอนนี้เลย
/pulse status            ← ดูสถานะวันนี้
```

---

## Local Development

```bash
# Clone repo
git clone https://github.com/YOUR_USERNAME/axons-pulse-bot.git
cd axons-pulse-bot

# Install dependencies
npm install

# Copy env template
cp .env.example .env
# แก้ .env ใส่ค่าจริง

# Run
npm run dev
```

---

## Project Structure

```
axons-pulse-bot/
├── src/
│   ├── index.js          # Entry point + cron setup
│   ├── db.js             # SQLite database layer
│   ├── commands.js       # Slash command definitions
│   ├── reminder.js       # Embed builders + send functions
│   └── interactions.js   # Button & command handlers
├── Dockerfile
├── railway.json
├── .env.example
└── package.json
```

---

## Commands Reference

### User Commands
| Command | Description |
|---|---|
| `/pulse status` | ดูสถานะ check-in วันนี้ |
| `/pulse mystats` | ดู streak ส่วนตัว |
| `/pulse leaderboard` | ดู streak leaderboard |

### Admin Commands (ต้องมี Manage Server permission)
| Command | Description |
|---|---|
| `/pulse-admin add @user` | เพิ่มสมาชิก |
| `/pulse-admin remove @user` | ลบสมาชิก |
| `/pulse-admin list` | ดูรายชื่อทั้งหมด |
| `/pulse-admin add-role @role` | เพิ่มทั้ง role |
| `/pulse-admin broadcast` | ส่ง reminder ทันที |
| `/pulse-admin summary` | ส่ง summary ทันที |
