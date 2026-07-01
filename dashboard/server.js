const express = require('express');
const { pool } = require('../database/db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware für JSON und Formulardaten
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// System-Referenzen (werden vom Hauptbot übergeben)
let lockdownSystem = null;
let restoreManager = null;

app.setLockdownSystem = (system) => {
  lockdownSystem = system;
};

app.setRestoreManager = (manager) => {
  restoreManager = manager;
};

// Die Hauptseite leitet direkt aufs Dashboard weiter
app.get('/', async (req, res) => {
  res.redirect('/dashboard');
});

// Dashboard-Ansicht
app.get('/dashboard', async (req, res) => {
  // Holt den Status vom Bot
  const botStatus = lockdownSystem ? lockdownSystem.getLockdownStatus() : null;
  let lockdownStatus = null;

  try {
    // Vorfälle aus DB holen
    const incidentsResult = await pool.query(
      'SELECT * FROM incidents ORDER BY created_at DESC LIMIT 10'
    );
    
    // Logs aus DB holen
  // Wir vertrauen primär dem Bot. Nur wenn der Bot ACTIVE meldet, 
    // oder die Daten vollständig sind, zeigen wir es an.
    if (botStatus && botStatus.id) {
      lockdownStatus = {
        incidentId: botStatus.id,
        level: botStatus.level,
        reason: botStatus.reason,
        initiator: botStatus.initiator
      };
    } else {
      // Wenn der Bot sagt, es gibt keinen Lockdown, ist das Dashboard NORMAL.
      lockdownStatus = null;
    }
        reason: activeDbIncident.reason,
        initiator: activeDbIncident.initiator
      };
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Security Dashboard</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #1a1a2e;
            color: #eee;
            margin: 0;
            padding: 20px;
          }
          .container { max-width: 1200px; margin: 0 auto; }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
          }
          .status-box {
            background: #16213e;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
          }
          .status-active { border-left: 5px solid #e94560; }
          .status-inactive { border-left: 5px solid #00ff88; }
          .panic-btn {
            background: #ff0000;
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 18px;
            font-weight: bold;
          }
          .panic-btn:hover { background: #cc0000; }
          .unlock-btn {
            background: #00ff88;
            color: #1a1a2e;
            border: none;
            padding: 15px 30px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 18px;
            font-weight: bold;
          }
          .unlock-btn:hover { background: #00cc6a; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #0f3460;
          }
          th { background: #0f3460; }
          .level-1 { color: #ffff00; }
          .level-2 { color: #ffa500; }
          .level-3 { color: #ff0000; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔒 Security Dashboard (Public Test Mode)</h1>
          </div>

          <div class="status-box ${lockdownStatus ? 'status-active' : 'status-inactive'}">
            <h2>Lockdown Status</h2>
            ${lockdownStatus ? `
              <p><strong>Status:</strong> ACTIVE</p>
              <p><strong>Incident ID:</strong> ${lockdownStatus.incidentId}</p>
              <p><strong>Level:</strong> <span class="level-${lockdownStatus.level}">${lockdownStatus.level}</span></p>
              <p><strong>Reason:</strong> ${lockdownStatus.reason}</p>
              <p><strong>Initiator:</strong> ${lockdownStatus.initiator}</p>
              <br>
              <button class="unlock-btn" onclick="unlockServer()">🔓 UNLOCK SERVER</button>
            ` : `
              <p><strong>Status:</strong> NORMAL</p>
              <p>No active lockdown</p>
              <br>
              <button class="panic-btn" onclick="panicMode()">🚨 PANIC MODE</button>
            `}
          </div>

          <div class="status-box">
            <h2>Recent Incidents</h2>
            <table>
              <tr>
                <th>ID</th>
                <th>Status</th>
                <th>Level</th>
                <th>Reason</th>
                <th>Created</th>
              </tr>
              ${incidentsResult.rows.map(inc => `
                <tr>
                  <td><a href="/incident/${inc.incident_id}" style="color: #00ff88;">${inc.incident_id}</a></td>
                  <td>${inc.status}</td>
                  <td class="level-${inc.level}">${inc.level}</td>
                  <td>${inc.reason}</td>
                  <td>${new Date(inc.created_at).toLocaleString()}</td>
                </tr>
              `).join('')}
            </table>
          </div>

          <div class="status-box">
            <h2>Security Logs</h2>
            <table>
              <tr>
                <th>Event Type</th>
                <th>User ID</th>
                <th>Timestamp</th>
              </tr>
              ${logsResult.rows.map(log => `
                <tr>
                  <td>${log.event_type}</td>
                  <td>${log.user_id || 'N/A'}</td>
                  <td>${new Date(log.created_at).toLocaleString()}</td>
                </tr>
              `).join('')}
            </table>
          </div>
        </div>

        <script>
          function panicMode() {
            if (confirm('Are you sure you want to trigger PANIC MODE? This will immediately activate Level 3 Lockdown!')) {
              fetch('/panic', { method: 'POST' })
                .then(() => location.reload());
            }
          }

          function unlockServer() {
            if (confirm('Are you sure you want to UNLOCK the server? This will restore all permissions and end the lockdown.')) {
              fetch('/unlock', { method: 'POST' })
                .then(res => res.json())
                .then(data => {
                  alert(data.message || 'Signal gesendet!');
                  location.reload();
                })
                .catch(err => alert('Fehler: ' + err));
            }
          }
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Dashboard Render Error:', err.message);
    res.status(500).send('Internal Server Error: ' + err.message);
  }
});

// Einzelner Vorfall
app.get('/incident/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM incidents WHERE incident_id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.send('Incident not found');
    }

    const incident = result.rows[0];

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Incident ${id}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #1a1a2e;
            color: #eee;
            margin: 0;
            padding: 20px;
          }
          .container { max-width: 1200px; margin: 0 auto; }
          .back-link { color: #e94560; text-decoration: none; margin-bottom: 20px; display: block; font-weight: bold; }
          .incident-box {
            background: #16213e;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <a href="/dashboard" class="back-link">← Back to Dashboard</a>
          
          <div class="incident-box">
            <h1>Incident ${incident.incident_id}</h1>
            <p><strong>Status:</strong> ${incident.status}</p>
            <p><strong>Level:</strong> ${incident.level}</p>
            <p><strong>Reason:</strong> ${incident.reason}</p>
            <p><strong>Initiator:</strong> ${incident.initiator}</p>
            <p><strong>Created:</strong> ${new Date(incident.created_at).toLocaleString()}</p>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Fehler beim Laden des Vorfalls: ' + err.message);
  }
});

// Panic-Knopf Route
app.post('/panic', async (req, res) => {
  if (!lockdownSystem) {
    return res.status(500).json({ error: 'Lockdown-System steht nicht zur Verfügung' });
  }

  const incidentId = await lockdownSystem.initiateLockdown(3, 'PANIC MODE triggered from Dashboard', 'DASHBOARD');
  res.json({ success: true, incidentId });
});

// Entsperren-Knopf Route
app.post('/unlock', async (req, res) => {
  if (!lockdownSystem) {
    return res.status(500).json({ error: 'Lockdown-System steht nicht zur Verfügung' });
  }

  try {
    const status = lockdownSystem.getLockdownStatus();
    let incidentId = status ? (status.id || status.incidentId) : null;
    
    // Fallback: In der DB nachsehen
    if (!incidentId) {
      const activeInc = await pool.query("SELECT incident_id FROM incidents WHERE status = 'ACTIVE' LIMIT 1");
      if (activeInc.rows.length > 0) {
        incidentId = activeInc.rows[0].incident_id;
      }
    }

    console.log(`[Dashboard] Starte Entsperrung für Incident-ID: ${incidentId}`);

    process.env.UNLOCK_SERVER = 'true';

    if (typeof lockdownSystem.checkUnlockSignal === 'function') {
      await lockdownSystem.checkUnlockSignal();
    } else if (typeof lockdownSystem.endLockdown === 'function') {
      await lockdownSystem.endLockdown();
    }

    res.json({ success: true, message: 'Unlock-Signal erfolgreich an Bot übermittelt!', incidentId });
  } catch (err) {
    console.error('[Dashboard] Fehler beim Ausführen des Unlocks:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
