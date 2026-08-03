import { loadConfig, loadState, saveState, addLogs } from '../../lib/storage.mjs';
import { processPlayerCheck } from '../../lib/pingerCore.mjs';

/**
 * Netlify Scheduled Function (Runs on cron schedule, e.g. every minute)
 */
export default async function handler(req, context) {
  console.log('[Netlify Scheduled Pinger] Executing check cycle...');
  
  const config = loadConfig();
  const state = loadState();
  const playersState = state.players || {};

  let totalNotificationsSent = 0;
  const cycleLogs = [];

  for (const username of config.trackedPlayers) {
    const prevPlayerState = playersState[username] || {};
    const { newState, logs, notificationsSent } = await processPlayerCheck(username, prevPlayerState, config);
    
    playersState[username] = newState;
    totalNotificationsSent += notificationsSent;
    cycleLogs.push(...logs);
  }

  addLogs(cycleLogs);
  saveState({ players: playersState, logs: cycleLogs, lastRun: new Date().toISOString() });

  return new Response(JSON.stringify({
    success: true,
    timestamp: new Date().toISOString(),
    trackedPlayers: config.trackedPlayers,
    notificationsSent: totalNotificationsSent,
    logs: cycleLogs
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
