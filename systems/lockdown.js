const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { pool } = require('../database/db');
const incidentPanel = require('./incidentPanel');
const snapshot = require('./snapshot');
const permissions = require('./permissions');

class LockdownSystem {
  constructor(client) {
    this.client = client;
    this.activeLockdown = null;
    this.lockdownLevel = 0;

    // Starte die Überprüfung aus der Datenbank asynchron beim Booten
    this.checkActiveLockdownFromDatabase();
  }

  // NEU: Lädt einen aktiven Lockdown nach einem Bot-Neustart automatisch aus der DB
  async checkActiveLockdownFromDatabase() {
    try {
      // Warte kurz, bis der Client eingeloggt ist
      if (!this.client.readyAt) {
        await new Promise(resolve => this.client.once('ready', resolve));
      }

      const result = await pool.query(
        "SELECT * FROM incidents WHERE status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1"
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        this.activeLockdown = {
          id: row.incident_id,
          level: parseInt(row.level),
          reason: row.reason,
          initiator: row.initiator,
          mode: row.mode,
          startTime: row.created_at
        };
        this.lockdownLevel = parseInt(row.level);
        console.log(`[LockdownSystem] Aktiven Lockdown aus DB wiederhergestellt: ${row.incident_id}`);
      } else {
        console.log('[LockdownSystem] Kein aktiver Lockdown in der Datenbank gefunden.');
      }
    } catch (error) {
      console.error('[LockdownSystem] Fehler beim Laden des DB-Status:', error.message);
    }
  }

  async initiateLockdown(level, reason, initiator = 'AUTO', mode = 'AUTO') {
    if (this.activeLockdown) {
      console.log('Lockdown already active');
      return this.activeLockdown.id; // ID zurückgeben, falls bereits aktiv
    }

    const guild = await this.client.guilds.fetch(process.env.GUILD_ID);
    const incidentId = `INC-${Date.now()}`;

    // Create snapshot before lockdown
    await snapshot.createSnapshot(guild, incidentId);

    this.activeLockdown = {
      id: incidentId,
      level,
      reason,
      initiator,
      mode,
      startTime: Date.now()
    };

    this.lockdownLevel = level;

    // Apply lockdown measures based on level
    await this.applyLockdownLevel(guild, level);

    // Create incident panel
    try {
      await incidentPanel.create(guild, incidentId, level, reason, initiator, mode);
    } catch (panelError) {
      console.warn('Could not create incident panel:', panelError.message);
    }

    // Log to database
    await pool.query(
      `INSERT INTO incidents (incident_id, status, mode, level, reason, initiator, timeline, system_status)
       VALUES ($1, 'ACTIVE', $2, $3, $4, $5, $6, $7)`,
      [incidentId, mode, level, reason, initiator, JSON.stringify([]), JSON.stringify({ lockdown: true, level })]
    );

    console.log(`Lockdown ${incidentId} erfolgreich eingeleitet und in DB gespeichert.`);
    return incidentId;
  }

  async applyLockdownLevel(guild, level) {
    switch (level) {
      case 1:
        await this.applyLevel1(guild);
        break;
      case 2:
        await this.applyLevel1(guild);
        await this.applyLevel2(guild);
        break;
      case 3:
        await this.applyLevel1(guild);
        await this.applyLevel2(guild);
        await this.applyLevel3(guild);
        break;
    }
  }

  async applyLevel1(guild) {
    const channels = guild.channels.cache.filter(c => c.isTextBased());
    const allowedChannels = ['mod', 'ticket', 'admin', 'staff', 'log'];

    for (const [_, ch] of channels) {
      if (!allowedChannels.some(name => ch.name.toLowerCase().includes(name))) {
        try {
          await ch.permissionOverwrites.edit(guild.roles.everyone, {
            [PermissionFlagsBits.SendMessages]: false
          });
        } catch (err) {
          console.error(`Fehler bei Kanalsperrung (${ch.name}):`, err.message);
        }
      }
    }
  }

  async applyLevel2(guild) {
    const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());

    for (const [_, ch] of voiceChannels) {
      try {
        await ch.permissionOverwrites.edit(guild.roles.everyone, {
          [PermissionFlagsBits.Connect]: false,
          [PermissionFlagsBits.Stream]: false
        });
      } catch (err) {
        console.error(`Fehler bei Voice-Sperrung (${ch.name}):`, err.message);
      }
    }
  }

  async applyLevel3(guild) {
    try {
      const invites = await guild.invites.fetch();
      for (const invite of invites.values()) {
        await invite.delete('Lockdown Level 3');
      }
    } catch (err) {
      console.warn('Einladungen konnten nicht gelöscht werden:', err.message);
    }

    if (permissions && typeof permissions.freezePermissions === 'function') {
      await permissions.freezePermissions(guild);
    }
  }

  async getLockdownStatus() {
    return this.activeLockdown;
  }

  isActive() {
    return this.activeLockdown !== null;
  }

  async endLockdown() {
    if (!this.activeLockdown) {
      console.log('No active lockdown to end');
      return false;
    }

    const incidentId = this.activeLockdown.id;
    this.activeLockdown = null;
    this.lockdownLevel = 0;

    // Update database
    await pool.query(
      "UPDATE incidents SET status = 'RESOLVED' WHERE incident_id = $1",
      [incidentId]
    );

    console.log(`Lockdown ${incidentId} ended`);
    return true;
  }
}

module.exports = LockdownSystem;
