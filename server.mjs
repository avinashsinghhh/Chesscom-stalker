import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadConfig, saveConfig, loadState, saveState, getLogs, addLogs } from './lib/storage.mjs';
import { processPlayerCheck } from './lib/pingerCore.mjs';
import { sendTestPing } from './lib/notifier.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');

const PORT = process.env.PORT || 3000;

function maskWebhook(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.length < 25) return '****************';
  return url.substring(0, 30) + '...' + url.substring(url.length - 6);
}

// Background polling loop for local server execution
let isChecking = false;

async function runCheckCycle() {
  if (isChecking) return;
  isChecking = true;

  try {
    const config = loadConfig();
    const state = loadState();
    const playersState = state.players || {};
    const cycleLogs = [];

    for (const username of config.trackedPlayers) {
      const prevPlayerState = playersState[username] || {};
      const { newState, logs } = await processPlayerCheck(username, prevPlayerState, config);
      playersState[username] = newState;
      cycleLogs.push(...logs);
    }

    addLogs(cycleLogs);
    saveState({ players: playersState, logs: cycleLogs, lastRun: new Date().toISOString() });
  } catch (err) {
    console.error('[Server Check Cycle Error]:', err.message);
  } finally {
    isChecking = false;
  }
}

// Helper to serve static files
function serveStaticFile(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
}

// Create native HTTP Server
const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = reqUrl.pathname;
  const method = req.method.toUpperCase();

  // CORS headers for API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Endpoints
  if (pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');

    // GET /api/status
    if (pathname === '/api/status' && method === 'GET') {
      const config = loadConfig();
      const state = loadState();
      const logs = getLogs();

      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        config: {
          ...config,
          discordWebhookUrlMasked: maskWebhook(config.discordWebhookUrl),
          hasWebhook: Boolean(config.discordWebhookUrl)
        },
        playersState: state.players || {},
        logs
      }));
      return;
    }

    // POST /api/config
    if (pathname === '/api/config' && method === 'POST') {
      let bodyStr = '';
      req.on('data', chunk => bodyStr += chunk);
      req.on('end', () => {
        try {
          const body = JSON.parse(bodyStr);
          const updated = saveConfig(body);

          addLogs([{
            type: 'CONFIG',
            message: 'Settings updated from dashboard.',
            timestamp: new Date().toISOString()
          }]);

          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            message: 'Configuration saved successfully.',
            config: {
              ...updated,
              discordWebhookUrlMasked: maskWebhook(updated.discordWebhookUrl),
              hasWebhook: Boolean(updated.discordWebhookUrl)
            }
          }));
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // POST /api/test-ping
    if (pathname === '/api/test-ping' && method === 'POST') {
      let bodyStr = '';
      req.on('data', chunk => bodyStr += chunk);
      req.on('end', async () => {
        try {
          const body = bodyStr ? JSON.parse(bodyStr) : {};
          const config = loadConfig();
          const webhookUrl = body.webhookUrl || config.discordWebhookUrl;
          const pingUserId = body.pingUserId !== undefined ? body.pingUserId : config.pingUserId;

          if (!webhookUrl) {
            res.writeHead(400);
            res.end(JSON.stringify({
              success: false,
              error: 'Missing Discord Webhook URL. Please set your Discord Webhook URL in settings.'
            }));
            return;
          }

          await sendTestPing(webhookUrl, pingUserId);

          addLogs([{
            type: 'TEST_PING',
            message: 'Sent test ping to Discord Webhook.',
            timestamp: new Date().toISOString()
          }]);

          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            message: 'Test ping sent to Discord successfully!'
          }));
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // POST /api/check-now
    if (pathname === '/api/check-now' && method === 'POST') {
      await runCheckCycle();
      const state = loadState();
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        message: 'Manual check completed.',
        playersState: state.players || {},
        logs: getLogs()
      }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'API route not found' }));
    return;
  }

  // Static File Serving
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, safePath);
  serveStaticFile(req, res, filePath);
});

function getFreePort(startPort) {

  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(startPort, () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
    s.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(getFreePort(startPort + 1));
      } else {
        reject(err);
      }
    });
  });
}

const DEFAULT_PORT = process.env.PORT || 3000;

getFreePort(DEFAULT_PORT).then(portToUse => {
  server.listen(portToUse, () => {
    console.log(`\n==================================================`);
    console.log(`♟️  Chess.com Discord Pinger Dashboard Running!`);
    console.log(`🔗 Local URL: http://localhost:${portToUse}`);
    console.log(`==================================================\n`);

    // Initial check on server start
    runCheckCycle();

    // Start background interval
    const config = loadConfig();
    const intervalMs = (config.pollIntervalSeconds || 30) * 1000;
    setInterval(runCheckCycle, intervalMs);
  });
}).catch(err => {
  console.error('[Server Start Error]:', err);
});

