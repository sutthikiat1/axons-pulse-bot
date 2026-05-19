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
        .setDescription("Clear all check-ins for today")
    ),
];

async function registerCommands(client) {
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) {
    console.error("[CMD] Guild not found:", process.env.GUILD_ID);
    return;
  }

  try {
    // Force clear existing commands first so Discord drops cached version
    console.log("[CMD] Clearing existing guild commands...");
    await guild.commands.set([]);
    await new Promise((r) => setTimeout(r, 1500));

    const payload = commands.map((c) => c.toJSON());
    console.log(`[CMD] Sending ${payload.length} commands to Discord:`);
    payload.forEach((c) => {
      console.log(`[CMD]   ${c.name} (${c.options?.length || 0} subs)`);
      c.options?.forEach((s) => console.log(`[CMD]     • ${s.name}`));
    });

    const result = await guild.commands.set(payload);
    console.log(`[CMD] ✅ Registered ${result.size} commands successfully`);
  } catch (err) {
    console.error("[CMD] ❌ Registration failed:", err);
  }
}

module.exports = { registerCommands };
