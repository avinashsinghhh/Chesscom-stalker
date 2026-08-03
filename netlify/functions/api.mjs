import { loadConfig, saveConfig, loadState, saveState, getLogs, addLogs } from '../../lib/storage.mjs';
import { processPlayerCheck } from '../../lib/pingerCore.mjs';
import { sendTestPing } from '../../lib/notifier.mjs';

function maskWebhook(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.length < 25) return '****************';
  return url.substring(0, 30) + '...' + url.substring(url.length - 6);
}

export default async function handler(req, context) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/\.netlify\/functions\/api/, '').replace(/^\/api/, '');
  const method = req.method.toUpperCase();

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // GET /status
    if ((path === '/status' || path === '' || path === '/') && method === 'GET') {
      const config = loadConfig();
      const state = loadState();
      const logs = getLogs();

      // Mask webhook for security response
      const safeConfig = {
        ...config,
        discordWebhookUrlMasked: maskWebhook(config.discordWebhookUrl),
        hasWebhook: Boolean(config.discordWebhookUrl)
      };

      return new Response(JSON.stringify({
        success: true,
        config: safeConfig,
        playersState: state.players || {},
        logs
      }), { status: 200, headers: corsHeaders });
    }

    // POST /config
    if (path === '/config' && method === 'POST') {
      const body = await req.json();
      const updated = saveConfig(body);

      addLogs([{
        type: 'CONFIG',
        message: 'Settings updated from dashboard.',
        timestamp: new Date().toISOString()
      }]);

      return new Response(JSON.stringify({
        success: true,
        message: 'Configuration saved successfully.',
        config: {
          ...updated,
          discordWebhookUrlMasked: maskWebhook(updated.discordWebhookUrl),
          hasWebhook: Boolean(updated.discordWebhookUrl)
        }
      }), { status: 200, headers: corsHeaders });
    }

    // POST /test-ping
    if (path === '/test-ping' && method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const config = loadConfig();
      const webhookUrl = body.webhookUrl || config.discordWebhookUrl;
      const pingUserId = body.pingUserId !== undefined ? body.pingUserId : config.pingUserId;

      if (!webhookUrl) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Missing Discord Webhook URL. Please paste your Discord Webhook URL first.'
        }), { status: 400, headers: corsHeaders });
      }

      await sendTestPing(webhookUrl, pingUserId);

      addLogs([{
        type: 'TEST_PING',
        message: 'Sent test ping to Discord Webhook.',
        timestamp: new Date().toISOString()
      }]);

      return new Response(JSON.stringify({
        success: true,
        message: 'Test ping sent to Discord successfully!'
      }), { status: 200, headers: corsHeaders });
    }

    // POST /check-now
    if (path === '/check-now' && method === 'POST') {
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

      return new Response(JSON.stringify({
        success: true,
        message: 'Status check complete.',
        playersState,
        logs: cycleLogs,
        notificationsSent: totalNotifications
      }), { status: 200, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: 'Endpoint not found' }), { status: 404, headers: corsHeaders });

  } catch (err) {
    console.error('[API Error]:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message || 'Internal Server Error'
    }), { status: 500, headers: corsHeaders });
  }
}
