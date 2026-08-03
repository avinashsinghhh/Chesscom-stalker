import {
  notifyPlayerOnline,
  notifyPlayerOffline,
  notifyGameStart,
  notifyGameFinish
} from './notifier.mjs';

const USER_AGENT = 'ChessPingerApp/1.0 (contact: chess-pinger@example.com)';
const NOTIFICATION_COOLDOWN_SECONDS = 180; // 3-minute cooldown between duplicate online/offline pings
const MAX_GAME_END_AGE_SECONDS = 180; // Only alert for games finished in the last 3 minutes

/**
 * Fetch player profile from Chess.com PubAPI with cache buster
 */
export async function fetchPlayerProfile(username) {
  const cleanUsername = username.trim().toLowerCase();
  const url = `https://api.chess.com/pub/player/${encodeURIComponent(cleanUsername)}?_cb=${Date.now()}`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`Player "${username}" not found on Chess.com.`);
      }
      throw new Error(`Chess.com API Error HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.error(`[PingerCore] Error fetching profile for ${username}:`, err.message);
    throw err;
  }
}

/**
 * Fetch player active games from Chess.com PubAPI
 */
export async function fetchPlayerActiveGames(username) {
  const cleanUsername = username.trim().toLowerCase();
  const url = `https://api.chess.com/pub/player/${encodeURIComponent(cleanUsername)}/games?_cb=${Date.now()}`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.games || [];
  } catch (err) {
    console.error(`[PingerCore] Error fetching active games for ${username}:`, err.message);
    return [];
  }
}

/**
 * Fetch player recent finished games for current month
 */
export async function fetchPlayerRecentFinishedGames(username) {
  const cleanUsername = username.trim().toLowerCase();
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const url = `https://api.chess.com/pub/player/${encodeURIComponent(cleanUsername)}/games/${year}/${month}?_cb=${Date.now()}`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.games || [];
  } catch (err) {
    console.error(`[PingerCore] Error fetching recent games for ${username}:`, err.message);
    return [];
  }
}

/**
 * Evaluates player status and triggers necessary notifications
 */
export async function processPlayerCheck(username, previousState = {}, config = {}) {
  const logs = [];
  let notificationsSent = 0;
  
  const onlineThresholdSeconds = config.onlineThresholdSeconds || 600;
  const nowSeconds = Math.floor(Date.now() / 1000);

  // Preserve state
  const lastNotifs = previousState.lastNotificationTimes || {};
  const sentGameStartUrls = new Set(previousState.sentGameStartUrls || []);
  const sentGameEndUrls = new Set(previousState.sentGameEndUrls || []);

  const state = {
    isOnline: false,
    lastOnline: 0,
    activeGames: [],
    profileData: null,
    lastChecked: nowSeconds,
    offlineConsecutiveCount: previousState.offlineConsecutiveCount || 0,
    lastNotificationTimes: lastNotifs,
    initializedGames: previousState.initializedGames || false,
    sentGameStartUrls: Array.from(sentGameStartUrls).slice(-1000),
    sentGameEndUrls: Array.from(sentGameEndUrls).slice(-1000),
    ...previousState
  };

  try {
    // 1. Fetch Profile & Active Games & Recent Monthly Games in parallel
    const [profile, activeGames, finishedGames] = await Promise.all([
      fetchPlayerProfile(username).catch(() => null),
      fetchPlayerActiveGames(username).catch(() => []),
      fetchPlayerRecentFinishedGames(username).catch(() => [])
    ]);

    if (!profile) {
      logs.push({
        type: 'ERROR',
        message: `Could not fetch profile for player "${username}".`,
        timestamp: new Date().toISOString()
      });
      return { newState: state, logs, notificationsSent };
    }

    state.profileData = profile;
    state.lastOnline = profile.last_online || 0;

    // Calculate time since last_online timestamp
    const timeSinceLastOnline = nowSeconds - state.lastOnline;

    // Check if player has recent finished games
    let timeSinceLastFinishedGame = Infinity;
    let latestFinishedGame = null;

    if (finishedGames.length > 0) {
      latestFinishedGame = finishedGames[finishedGames.length - 1];
      if (latestFinishedGame && latestFinishedGame.end_time) {
        timeSinceLastFinishedGame = nowSeconds - Number(latestFinishedGame.end_time);
      }
    }

    // Raw online status
    const rawIsOnline = (
      timeSinceLastOnline <= onlineThresholdSeconds ||
      activeGames.length > 0 ||
      timeSinceLastFinishedGame <= onlineThresholdSeconds
    );

    // Hysteresis & Smoothing: Require 2 consecutive offline checks before marking offline
    let effectiveOnlineState = previousState.isOnline;

    if (rawIsOnline) {
      state.offlineConsecutiveCount = 0;
      effectiveOnlineState = true;
    } else {
      state.offlineConsecutiveCount = (previousState.offlineConsecutiveCount || 0) + 1;
      if (state.offlineConsecutiveCount >= 2) {
        effectiveOnlineState = false;
      }
    }

    // Online / Offline State Transition Checks
    if (previousState.isOnline !== undefined) {
      // Offline -> Online
      if (!previousState.isOnline && effectiveOnlineState) {
        const timeSinceLastOnlineNotif = nowSeconds - (lastNotifs.ONLINE || 0);
        if (timeSinceLastOnlineNotif >= NOTIFICATION_COOLDOWN_SECONDS) {
          logs.push({
            type: 'ONLINE',
            message: `🟢 ${profile.username} came online on Chess.com!`,
            timestamp: new Date().toISOString()
          });
          if (config.notifyOnline && config.discordWebhookUrl) {
            await notifyPlayerOnline(config.discordWebhookUrl, config.pingUserId, profile).catch(e => {
              console.error(`[PingerCore] Webhook error (online):`, e.message);
            });
            notificationsSent++;
            lastNotifs.ONLINE = nowSeconds;
          }
        }
      }
      // Online -> Offline
      else if (previousState.isOnline && !effectiveOnlineState) {
        const timeSinceLastOfflineNotif = nowSeconds - (lastNotifs.OFFLINE || 0);
        if (timeSinceLastOfflineNotif >= NOTIFICATION_COOLDOWN_SECONDS) {
          logs.push({
            type: 'OFFLINE',
            message: `🔴 ${profile.username} went offline.`,
            timestamp: new Date().toISOString()
          });
          if (config.notifyOffline && config.discordWebhookUrl) {
            await notifyPlayerOffline(config.discordWebhookUrl, config.pingUserId, profile).catch(e => {
              console.error(`[PingerCore] Webhook error (offline):`, e.message);
            });
            notificationsSent++;
            lastNotifs.OFFLINE = nowSeconds;
          }
        }
      }
    } else {
      logs.push({
        type: 'INFO',
        message: `Tracking initialized for ${profile.username} (Status: ${effectiveOnlineState ? 'Online 🟢' : 'Offline 🔴'})`,
        timestamp: new Date().toISOString()
      });
    }

    state.isOnline = Boolean(effectiveOnlineState);
    state.lastNotificationTimes = lastNotifs;

    // 2. Active Game Tracking (Game Started)
    const activeGameUrls = activeGames.map(g => g.url).filter(Boolean);
    const isFirstCheck = !previousState.initializedGames;

    for (const game of activeGames) {
      if (game.url) {
        const isNewGame = !sentGameStartUrls.has(game.url);
        sentGameStartUrls.add(game.url);

        if (!isFirstCheck && isNewGame) {
          logs.push({
            type: 'GAME_START',
            message: `⚔️ ${profile.username} started a game vs ${game.white?.username === profile.username ? game.black?.username : game.white?.username}!`,
            timestamp: new Date().toISOString()
          });
          if (config.notifyGameStart && config.discordWebhookUrl) {
            await notifyGameStart(config.discordWebhookUrl, config.pingUserId, profile, game).catch(e => {
              console.error(`[PingerCore] Webhook error (game start):`, e.message);
            });
            notificationsSent++;
          }
        }
      }
    }
    state.activeGames = activeGameUrls;
    state.sentGameStartUrls = Array.from(sentGameStartUrls).slice(-1000);

    // 3. Finished Game Tracking (Game Finished) - Bulletproof Filtering
    for (const game of finishedGames) {
      if (!game.url) continue;

      const isNewGame = !sentGameEndUrls.has(game.url);
      // Mark as seen immediately so it is NEVER re-evaluated
      sentGameEndUrls.add(game.url);

      if (!isFirstCheck && isNewGame) {
        const gameEndTime = Number(game.end_time) || 0;
        const secondsSinceEnd = nowSeconds - gameEndTime;

        // ONLY notify if the game actually ended within the last 3 minutes (180 seconds)
        if (gameEndTime > 0 && secondsSinceEnd >= 0 && secondsSinceEnd <= MAX_GAME_END_AGE_SECONDS) {
          logs.push({
            type: 'GAME_END',
            message: `🏆 ${profile.username} finished a game!`,
            timestamp: new Date().toISOString()
          });
          if (config.notifyGameEnd && config.discordWebhookUrl) {
            await notifyGameFinish(config.discordWebhookUrl, config.pingUserId, profile, game).catch(e => {
              console.error(`[PingerCore] Webhook error (game end):`, e.message);
            });
            notificationsSent++;
          }
        }
      }
    }

    state.initializedGames = true;
    state.sentGameEndUrls = Array.from(sentGameEndUrls).slice(-1000);

  } catch (err) {
    logs.push({
      type: 'ERROR',
      message: `Failed to check ${username}: ${err.message}`,
      timestamp: new Date().toISOString()
    });
  }

  return { newState: state, logs, notificationsSent };
}
