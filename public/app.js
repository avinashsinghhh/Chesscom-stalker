// Chess.com Discord Pinger - Dashboard Frontend Logic

let appState = {
  config: {},
  playersState: {},
  logs: []
};

// DOM Elements
const playersGrid = document.getElementById('playersGrid');
const playerCountBadge = document.getElementById('playerCountBadge');
const activityLogs = document.getElementById('activityLogs');
const addPlayerForm = document.getElementById('addPlayerForm');
const inputUsername = document.getElementById('inputUsername');
const settingsForm = document.getElementById('settingsForm');
const webhookUrlInput = document.getElementById('webhookUrl');
const webhookStatusBadge = document.getElementById('webhookStatusBadge');
const pingUserIdInput = document.getElementById('pingUserId');
const btnCheckNow = document.getElementById('btnCheckNow');
const btnTestPing = document.getElementById('btnTestPing');
const btnClearLogs = document.getElementById('btnClearLogs');

// Toast Notification Helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Fetch Application Status from API
async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error('API server returned error');
    const data = await res.json();
    if (data.success) {
      appState.config = data.config || {};
      appState.playersState = data.playersState || {};
      appState.logs = data.logs || [];
      renderUI();
    }
  } catch (err) {
    console.error('Error loading dashboard status:', err);
  }
}

// Render UI Components
function renderUI() {
  renderSettings();
  renderPlayers();
  renderLogs();
}

// Render Settings Form
function renderSettings() {
  const config = appState.config;
  if (!webhookUrlInput.dataset.modified) {
    webhookUrlInput.placeholder = config.discordWebhookUrlMasked || 'https://discord.com/api/webhooks/...';
  }

  pingUserIdInput.value = config.pingUserId || '';
  const onlineThresholdSelect = document.getElementById('onlineThreshold');
  if (onlineThresholdSelect) {
    onlineThresholdSelect.value = String(config.onlineThresholdSeconds || 600);
  }

  document.getElementById('notifyOnline').checked = Boolean(config.notifyOnline);
  document.getElementById('notifyGameStart').checked = Boolean(config.notifyGameStart);
  document.getElementById('notifyGameEnd').checked = Boolean(config.notifyGameEnd);
  document.getElementById('notifyOffline').checked = Boolean(config.notifyOffline);

  if (config.hasWebhook) {
    webhookStatusBadge.textContent = 'Configured';
    webhookStatusBadge.className = 'badge-status badge-configured';
  } else {
    webhookStatusBadge.textContent = 'Not Configured';
    webhookStatusBadge.className = 'badge-status badge-unconfigured';
  }
}


// Render Tracked Player Cards
function renderPlayers() {
  const tracked = appState.config.trackedPlayers || [];
  playerCountBadge.textContent = `${tracked.length} Player${tracked.length === 1 ? '' : 's'}`;

  if (tracked.length === 0) {
    playersGrid.innerHTML = `
      <div class="empty-logs" style="grid-column: 1/-1;">
        No players currently tracked. Add a Chess.com username above to start monitoring!
      </div>
    `;
    return;
  }

  playersGrid.innerHTML = tracked.map(username => {
    const pState = appState.playersState[username] || {};
    const profile = pState.profileData || { username };
    const isOnline = Boolean(pState.isOnline);
    const title = profile.title ? `<span class="player-title-badge">${profile.title}</span>` : '';
    const avatar = profile.avatar || 'https://www.chess.com/bundles/web/images/user-image.svg';
    const profileUrl = profile.url || `https://www.chess.com/member/${username}`;

    const statusBadge = isOnline
      ? `<span class="status-pill status-online"><span class="status-pulse-dot"></span> Online</span>`
      : `<span class="status-pill status-offline"><span class="status-pulse-dot"></span> Offline</span>`;

    const activeGamesCount = (pState.activeGames || []).length;
    const gameNotice = activeGamesCount > 0
      ? `<span style="color: #60a5fa; font-weight: 600;">⚔️ Playing Game (${activeGamesCount})</span>`
      : `<span>Idle</span>`;

    return `
      <div class="player-card">
        <button class="btn-remove-player" onclick="removePlayer('${username}')" title="Remove Player">✕</button>
        <div class="player-card-header">
          <img src="${avatar}" alt="${username}" class="player-avatar" onerror="this.src='https://www.chess.com/bundles/web/images/user-image.svg'">
          <div class="player-info">
            <div class="player-name">${profile.name || username} ${title}</div>
            <div class="player-username">@${username}</div>
          </div>
        </div>
        <div>
          ${statusBadge}
        </div>
        <div class="player-footer">
          <div>Game Status: ${gameNotice}</div>
          <a href="${profileUrl}" target="_blank" rel="noopener">Profile ↗</a>
        </div>
      </div>
    `;
  }).join('');
}

// Render Activity Log Stream
function renderLogs() {
  const logs = appState.logs || [];
  if (logs.length === 0) {
    activityLogs.innerHTML = `<div class="empty-logs">No recent activity logged yet.</div>`;
    return;
  }

  activityLogs.innerHTML = logs.map(log => {
    const timeStr = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '';
    return `
      <div class="log-entry">
        <span>${log.message}</span>
        <span class="log-time">${timeStr}</span>
      </div>
    `;
  }).join('');
}

// Add Player Handler
addPlayerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = inputUsername.value.trim().toLowerCase();
  if (!username) return;

  const currentTracked = appState.config.trackedPlayers || [];
  if (currentTracked.includes(username)) {
    showToast(`Player "${username}" is already tracked!`, 'info');
    inputUsername.value = '';
    return;
  }

  const updatedTracked = [...currentTracked, username];

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackedPlayers: updatedTracked })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Added player "${username}"`, 'success');
      inputUsername.value = '';
      fetchStatus();
      // Trigger instant check for new player
      fetch('/api/check-now', { method: 'POST' }).then(() => fetchStatus());
    } else {
      showToast(data.error || 'Failed to add player', 'error');
    }
  } catch (err) {
    showToast('Network error adding player', 'error');
  }
});

// Remove Player Handler
async function removePlayer(username) {
  const currentTracked = appState.config.trackedPlayers || [];
  const updatedTracked = currentTracked.filter(p => p !== username);

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackedPlayers: updatedTracked })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Removed player "${username}"`, 'info');
      fetchStatus();
    }
  } catch (err) {
    showToast('Failed to remove player', 'error');
  }
}

// Settings Save Handler
webhookUrlInput.addEventListener('input', () => {
  webhookUrlInput.dataset.modified = 'true';
});

settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const onlineThresholdSelect = document.getElementById('onlineThreshold');
  const updatedConfig = {
    pingUserId: pingUserIdInput.value.trim(),
    onlineThresholdSeconds: onlineThresholdSelect ? parseInt(onlineThresholdSelect.value, 10) : 600,
    notifyOnline: document.getElementById('notifyOnline').checked,
    notifyGameStart: document.getElementById('notifyGameStart').checked,
    notifyGameEnd: document.getElementById('notifyGameEnd').checked,
    notifyOffline: document.getElementById('notifyOffline').checked
  };


  if (webhookUrlInput.dataset.modified && webhookUrlInput.value.trim()) {
    updatedConfig.discordWebhookUrl = webhookUrlInput.value.trim();
  }

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedConfig)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Settings saved successfully!', 'success');
      webhookUrlInput.dataset.modified = '';
      webhookUrlInput.value = '';
      fetchStatus();
    } else {
      showToast(data.error || 'Failed to save settings', 'error');
    }
  } catch (err) {
    showToast('Error saving settings', 'error');
  }
});

// Manual Check Button
btnCheckNow.addEventListener('click', async () => {
  btnCheckNow.disabled = true;
  btnCheckNow.innerHTML = `<span class="spinner" style="width: 14px; height: 14px; margin: 0; display: inline-block;"></span> Checking...`;
  
  try {
    const res = await fetch('/api/check-now', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Manual check complete!', 'success');
      fetchStatus();
    }
  } catch (err) {
    showToast('Check failed', 'error');
  } finally {
    btnCheckNow.disabled = false;
    btnCheckNow.innerHTML = `<span class="btn-icon">🔄</span> Check Now`;
  }
});

// Test Ping Button
btnTestPing.addEventListener('click', async () => {
  btnTestPing.disabled = true;
  btnTestPing.innerHTML = `Sending...`;

  const webhookOverride = webhookUrlInput.dataset.modified && webhookUrlInput.value.trim()
    ? webhookUrlInput.value.trim()
    : undefined;

  try {
    const res = await fetch('/api/test-ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhookUrl: webhookOverride,
        pingUserId: pingUserIdInput.value.trim()
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Test ping sent to Discord!', 'success');
    } else {
      showToast(data.error || 'Failed to send test ping', 'error');
    }
  } catch (err) {
    showToast('Error sending test ping', 'error');
  } finally {
    btnTestPing.disabled = false;
    btnTestPing.innerHTML = `<span class="btn-icon">🔔</span> Send Test Ping`;
  }
});

// Clear Logs View Button
btnClearLogs.addEventListener('click', () => {
  appState.logs = [];
  renderLogs();
  showToast('Logs view cleared', 'info');
});

// Initial load & periodic poll
fetchStatus();
setInterval(fetchStatus, 10000); // Poll dashboard status every 10s
