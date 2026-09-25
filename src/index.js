require("dotenv").config();

const { Client, GatewayIntentBits, Events } = require("discord.js");
const cron = require("node-cron");
const db = require("./db");
const { registerCommands } = require("./commands");
const {
  handleButton,
  handleCommand,
  handleModalSubmit,
} = require("./interactions");
const { sendBroadcast, sendSummary } = require("./reminder");

// ── Validate env ──
const required = ["DISCORD_TOKEN", "GUILD_ID", "CHANNEL_ID"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[ERROR] Missing env var: ${key}`);
    process.exit(1);
  }
}

// ── Create client ──
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

// ── Bot ready ──
client.once(Events.ClientReady, async (c) => {
  console.log(`[BOT] Logged in as ${c.user.tag}`);

  // Init database
  await db.initDB();

  // Register slash commands
  await registerCommands(client);

  // Setup cron jobs (Asia/Bangkok timezone)
  setupCronJobs();

  console.log("[BOT] Ready and scheduled!");
});

// ── Interaction handler ──
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    }
  } catch (error) {
    console.error("[ERROR] Interaction failed:", error);
    const reply = {
      content: "❌ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

// ── Cron jobs ──
function setupCronJobs() {
  const channelId = process.env.CHANNEL_ID;
  const tz = process.env.TZ || "Asia/Bangkok";
  const BROADCAST_JITTER_MIN = 30; // broadcast lands anywhere in 16:30-17:00

  // 16:30 Mon-Fri — Broadcast reminder at a random time within 16:30-17:00
  // so people can't pre-position on the button before it appears.
  cron.schedule(
    "30 16 * * 1-5",
    () => {
      const delayMin = Math.floor(Math.random() * (BROADCAST_JITTER_MIN + 1));
      console.log(`[CRON] Broadcast scheduled in ${delayMin} min`);
      setTimeout(async () => {
        console.log("[CRON] Running broadcast...");
        try {
          const channel = await client.channels.fetch(channelId);
          if (channel) await sendBroadcast(channel);
        } catch (err) {
          console.error("[CRON] Broadcast failed:", err);
        }
      }, delayMin * 60 * 1000);
    },
    { timezone: tz }
  );

  // 19:01 Mon-Fri — Daily summary (runs 1 min after the 19:00 deadline)
  cron.schedule(
    "1 19 * * 1-5",
    async () => {
      console.log("[CRON] Running 19:01 summary...");
      try {
        const channel = await client.channels.fetch(channelId);
        if (channel) await sendSummary(channel);
      } catch (err) {
        console.error("[CRON] Summary failed:", err);
      }
    },
    { timezone: tz }
  );

  console.log(`[CRON] Scheduled: 16:30-17:00 random broadcast, 19:01 summary (${tz})`);
}

// ── Login ──
client.login(process.env.DISCORD_TOKEN);

// ── Graceful shutdown ──
process.on("SIGINT", () => {
  console.log("[BOT] Shutting down...");
  client.destroy();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[BOT] Shutting down...");
  client.destroy();
  process.exit(0);
});
