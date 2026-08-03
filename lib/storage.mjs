import fs from 'fs';
import path from 'path';

const CONFIG_FILE = path.resolve(process.cwd(), 'config.json');
const STATE_FILE = path.resolve(process.cwd(), 'state.json');

const defaultConfig = {
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
  pingUserId: process.env.PING_USER_ID || '',
  trackedPlayers: process.env.TRACKED_PLAYERS ? process.env.TRACKED_PLAYERS.split(',').map(s => s.trim()) : ['hikaru'],
  notifyOnline: true,
  notifyOffline: true,
  notifyGameStart: true,
  notifyGameEnd: true,
  onlineThresholdSeconds: 180,
  pollIntervalSeconds: 30
};

let memoryLogs = [];

export function loadConfig() {
  let fileConfig = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      fileConfig = JSON.parse(raw);
    }
  } catch (err) {
    console.error('[Storage] Could not read config.json:', err.message);
  }

  return {
    ...defaultConfig,
    ...fileConfig,
    // Allow environment variables to override if set
    discordWebhookUrl: fileConfig.discordWebhookUrl || process.env.DISCORD_WEBHOOK_URL || '',
    pingUserId: fileConfig.pingUserId || process.env.PING_USER_ID || '',
    trackedPlayers: (fileConfig.trackedPlayers && fileConfig.trackedPlayers.length > 0)
      ? fileConfig.trackedPlayers
      : (process.env.TRACKED_PLAYERS ? process.env.TRACKED_PLAYERS.split(',').map(s => s.trim()) : ['hikaru'])
  };
}

export function saveConfig(newConfig) {
  const current = loadConfig();
  const merged = { ...current, ...newConfig };
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Storage] Notice: config.json write skipped (read-only filesystem or Netlify serverless environment):', err.message);
  }
  return merged;
}

export function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[Storage] Could not read state.json:', err.message);
  }
  return { players: {}, logs: [] };
}

export function saveState(stateObj) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(stateObj, null, 2), 'utf8');
  } catch (err) {
    // Expected on Netlify serverless environment
  }
}

export function addLogs(newLogs) {
  if (!Array.isArray(newLogs) || newLogs.length === 0) return;
  memoryLogs = [...newLogs, ...memoryLogs].slice(0, 100);
}

export function getLogs() {
  const state = loadState();
  const fileLogs = state.logs || [];
  const combined = [...memoryLogs, ...fileLogs];
  // Deduplicate by timestamp and message
  const seen = new Set();
  return combined.filter(item => {
    const key = `${item.timestamp}-${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 50);
}
