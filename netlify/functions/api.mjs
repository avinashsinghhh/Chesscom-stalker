import { loadConfig, saveConfig, loadState, saveState, getLogs, addLogs } from '../../lib/storage.mjs';
import { processPlayerCheck } from '../../lib/pingerCore.mjs';
import { sendTestPing } from '../../lib/notifier.mjs';

function maskWebhook(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.length < 25) return '****************';
  return url.substring(0, 30) + '...' + url.substring(url.length - 6);
}

export const handler = async (event, context) => {
  const rawPath = event.path || '';
  const path = rawPath.replace(/^\/\.netlify\/functions\/api/, '').replace(/^\/api/, '');
  const httpMethod = (event.httpMethod || 'GET').toUpperCase();

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  try {
    // GET /status
    if ((path === '/status' || path === '' || path === '/') && httpMethod === 'GET') {
      const config = loadConfig();
      const state = loadState();
      const logs = getLogs();

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          config: {
            ...config,
            discordWebhookUrlMasked: maskWebhook(config.discordWebhookUrl),
            hasWebhook: Boolean(config.discordWebhookUrl)
          },
          playersState: state.players || {},
          logs
        })
      };
    }

    // POST /config
    if (path === '/config' && httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const updated = saveConfig(body);

      addLogs([{
        type: 'CONFIG',
        message: 'Settings updated from dashboard.',
        timestamp: new Date().toISOString()
      }]);

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'Configuration saved successfully.',
          config: {
            ...updated,
            discordWebhookUrlMasked: maskWebhook(updated.discordWebhookUrl),
            hasWebhook: Boolean(updated.discordWebhookUrl)
          }
        })
      };
    }

    // POST /test-ping
    if (path === '/test-ping' && httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const config = loadConfig();
      const webhookUrl = body.webhookUrl || config.discordWebhookUrl;
      const pingUserId = body.pingUserId !== undefined ? body.pingUserId : config.pingUserId;

      if (!webhookUrl) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            error: 'Missing Discord Webhook URL. Please paste your Discord Webhook URL first.'
          })
        };
      }

      await sendTestPing(webhookUrl, pingUserId);

      addLogs([{
        type: 'TEST_PING',
        message: 'Sent test ping to Discord Webhook.',
        timestamp: new Date().toISOString()
      }]);

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'Test ping sent to Discord successfully!'
        })
      };
    }

    // POST /check-now
    if (path === '/check-now' && httpMethod === 'POST') {
      const config = loadConfig();
      const state = loadState();
      const playersState = state.players || {};
      const cycleLogs = [];
      let totalNotifications = 0;

      for (const username of config.trackedPlayers) {
        const prevPlayerState = playersState[username] || {};
        const { newState, logs, notificationsSent } = await processPlayerCheck(username, prevPlayerState, config);
        playersState[username] = newState;
        totalNotifications += notificationsSent;
        cycleLogs.push(...logs);
      }

      addLogs(cycleLogs);
      saveState({ players: playersState, logs: cycleLogs, lastRun: new Date().toISOString() });

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'Status check complete.',
          playersState,
          logs: cycleLogs,
          notificationsSent: totalNotifications
        })
      };
    }

    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Endpoint not found' })
    };

  } catch (err) {
    console.error('[Netlify API Error]:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: err.message || 'Internal Server Error'
      })
    };
  }
};
