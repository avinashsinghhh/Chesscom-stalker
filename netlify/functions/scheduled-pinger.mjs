import { schedule } from '@netlify/functions';
import { loadConfig, loadState, saveState, addLogs } from '../../lib/storage.mjs';
import { processPlayerCheck } from '../../lib/pingerCore.mjs';

const pingerHandler = async (event, context) => {
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

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      trackedPlayers: config.trackedPlayers,
      notificationsSent: totalNotificationsSent,
      logs: cycleLogs
    })
  };
};

export const handler = schedule('* * * * *', pingerHandler);
