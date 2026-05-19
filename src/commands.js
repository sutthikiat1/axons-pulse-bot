const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const commands = [
  // ── User commands ──
  new SlashCommandBuilder()
    .setName("pulse")
    .setDescription("AXONS Pulse check-in commands")
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Check today's check-in status")
    )
    .addSubcommand((sub) =>
      sub.setName("mystats").setDescription("View your personal streak and stats")
    )
    .addSubcommand((sub) =>
      sub
        .setName("leaderboard")
        .setDescription("View streak leaderboard")
    ),

  // ── Admin commands ──
  new SlashCommandBuilder()
    .setName("pulse-admin")
    .setDescription("Admin commands for Pulse bot")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a member to tracking list")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User to add").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a member from tracking list")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User to remove").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List all tracked members")
    )
    .addSubcommand((sub) =>
      sub
        .setName("add-role")
        .setDescription("Add all members with a specific role")
        .addRoleOption((opt) =>
          opt.setName("role").setDescription("Role to add").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("broadcast")
        .setDescription("Manually trigger the daily reminder now")
    )
    .addSubcommand((sub) =>
      sub
        .setName("summary")
        .setDescription("Manually trigger the daily summary now")
    )
    .addSubcommand((sub) =>
      sub
        .setName("reset-today")
        .setDescription("ลบ check-in ทั้งหมดของวันนี้ (broadcast เดิมยังกดได้)")
    ),
];

async function registerCommands(client) {
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) {
    console.error("[CMD] Guild not found:", process.env.GUILD_ID);
    return;
  }

  await guild.commands.set(commands.map((c) => c.toJSON()));
  console.log(`[CMD] Registered ${commands.length} slash commands`);
}

module.exports = { registerCommands };
