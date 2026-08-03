import fs from 'fs';

/**
 * Formats user mention string for Discord payload
 * @param {string} rawUserId - raw user ID, e.g. "123456789" or "<@123456789>" or "everyone" or "here"
 */
export function formatMention(rawUserId) {
  if (!rawUserId || typeof rawUserId !== 'string') return '';
  const trimmed = rawUserId.trim();
  if (!trimmed) return '';
  if (trimmed === 'everyone' || trimmed === '@everyone') return '@everyone';
  if (trimmed === 'here' || trimmed === '@here') return '@here';
  if (trimmed.startsWith('<@') && trimmed.endsWith('>')) return trimmed;
  // If it's pure numbers or username ID
  const cleanId = trimmed.replace(/[^0-9]/g, '');
  if (cleanId) return `<@${cleanId}>`;
  return trimmed;
}

/**
 * Sends a raw payload to a Discord Webhook URL using native fetch
 */
export async function sendDiscordWebhook(webhookUrl, payload) {
  if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('http')) {
    throw new Error('Invalid or missing Discord Webhook URL.');
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'ChessPingerApp/1.0'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Discord Webhook HTTP ${response.status}: ${errorText || response.statusText}`);
  }

  return true;
}

/**
 * Send an Online Alert Notification
 */
export async function notifyPlayerOnline(webhookUrl, pingUserId, playerData) {
  const mention = formatMention(pingUserId);
  const content = mention ? `${mention} 🟢 **${playerData.name || playerData.username}** is now **ONLINE** on Chess.com!` : `🟢 **${playerData.name || playerData.username}** is now **ONLINE** on Chess.com!`;

  const embed = {
    title: `🟢 Player Online: ${playerData.username}`,
    url: playerData.url || `https://www.chess.com/member/${playerData.username}`,
    color: 0x2ecc71, // Green
    thumbnail: playerData.avatar ? { url: playerData.avatar } : undefined,
    fields: [
      { name: 'Username', value: `[${playerData.username}](${playerData.url})`, inline: true },
      { name: 'Status', value: '🟢 Online Now', inline: true },
      { name: 'Title', value: playerData.title || 'Player', inline: true }
    ],
    footer: {
      text: 'Chess.com Discord Pinger',
      icon_url: 'https://www.chess.com/favicon.ico'
    },
    timestamp: new Date().toISOString()
  };

  if (playerData.twitch_url) {
    embed.fields.push({ name: 'Twitch Stream', value: `[Watch Live](${playerData.twitch_url})`, inline: false });
  }

  return sendDiscordWebhook(webhookUrl, {
    content,
    embeds: [embed]
  });
}

/**
 * Send an Offline Alert Notification
 */
export async function notifyPlayerOffline(webhookUrl, pingUserId, playerData) {
  const mention = formatMention(pingUserId);
  const content = mention ? `${mention} 🔴 **${playerData.name || playerData.username}** is now **OFFLINE**.` : `🔴 **${playerData.name || playerData.username}** is now **OFFLINE**.`;

  const embed = {
    title: `🔴 Player Offline: ${playerData.username}`,
    url: playerData.url || `https://www.chess.com/member/${playerData.username}`,
    color: 0xe74c3c, // Red
    thumbnail: playerData.avatar ? { url: playerData.avatar } : undefined,
    fields: [
      { name: 'Username', value: `[${playerData.username}](${playerData.url})`, inline: true },
      { name: 'Status', value: '🔴 Offline', inline: true }
    ],
    footer: {
      text: 'Chess.com Discord Pinger',
      icon_url: 'https://www.chess.com/favicon.ico'
    },
    timestamp: new Date().toISOString()
  };

  return sendDiscordWebhook(webhookUrl, {
    content,
    embeds: [embed]
  });
}

/**
 * Send a Game Started Notification
 */
export async function notifyGameStart(webhookUrl, pingUserId, playerData, gameData) {
  const mention = formatMention(pingUserId);
  const gameUrl = gameData.url || gameData.link || `https://www.chess.com/member/${playerData.username}`;
  const content = mention ? `${mention} ⚔️ **${playerData.username}** started a new chess game!` : `⚔️ **${playerData.username}** started a new chess game!`;

  const whitePlayer = gameData.white ? (gameData.white.username || 'White') : 'White';
  const blackPlayer = gameData.black ? (gameData.black.username || 'Black') : 'Black';
  const timeClass = gameData.time_class || gameData.time_control || 'Live Game';

  const embed = {
    title: `⚔️ Game Started: ${whitePlayer} vs ${blackPlayer}`,
    url: gameUrl,
    color: 0x3498db, // Blue
    thumbnail: playerData.avatar ? { url: playerData.avatar } : undefined,
    fields: [
      { name: '⚪ White', value: whitePlayer, inline: true },
      { name: '⚫ Black', value: blackPlayer, inline: true },
      { name: '⏱️ Time Control', value: String(timeClass).toUpperCase(), inline: true },
      { name: '🔗 Watch Live Game', value: `[Click to Watch Game](${gameUrl})`, inline: false }
    ],
    footer: {
      text: 'Chess.com Discord Pinger',
      icon_url: 'https://www.chess.com/favicon.ico'
    },
    timestamp: new Date().toISOString()
  };

  return sendDiscordWebhook(webhookUrl, {
    content,
    embeds: [embed]
  });
}

/**
 * Send a Game Finished Notification
 */
export async function notifyGameFinish(webhookUrl, pingUserId, playerData, gameData) {
  const mention = formatMention(pingUserId);
  const gameUrl = gameData.url || `https://www.chess.com/member/${playerData.username}`;
  const content = mention ? `${mention} 🏆 **${playerData.username}** finished a game!` : `🏆 **${playerData.username}** finished a game!`;

  const white = gameData.white || {};
  const black = gameData.black || {};
  const whiteName = white.username || 'White';
  const blackName = black.username || 'Black';
  const whiteRes = white.result ? `(${white.result})` : '';
  const blackRes = black.result ? `(${black.result})` : '';

  const embed = {
    title: `🏆 Game Finished: ${whiteName} vs ${blackName}`,
    url: gameUrl,
    color: 0xf1c40f, // Gold / Yellow
    thumbnail: playerData.avatar ? { url: playerData.avatar } : undefined,
    fields: [
      { name: '⚪ White', value: `${whiteName} ${whiteRes}\nRating: ${white.rating || 'N/A'}`, inline: true },
      { name: '⚫ Black', value: `${blackName} ${blackRes}\nRating: ${black.rating || 'N/A'}`, inline: true },
      { name: '⏱️ Format', value: `${(gameData.time_class || 'game').toUpperCase()} (${gameData.time_control || ''})`, inline: true },
      { name: '🔗 Game Link', value: `[View Full Game & PGN](${gameUrl})`, inline: false }
    ],
    footer: {
      text: 'Chess.com Discord Pinger',
      icon_url: 'https://www.chess.com/favicon.ico'
    },
    timestamp: new Date().toISOString()
  };

  return sendDiscordWebhook(webhookUrl, {
    content,
    embeds: [embed]
  });
}

/**
 * Send a Test Ping to verify Webhook configuration
 */
export async function sendTestPing(webhookUrl, pingUserId) {
  const mention = formatMention(pingUserId);
  const content = mention ? `${mention} 👋 **Test Ping Successful!**` : `👋 **Test Ping Successful!**`;

  const embed = {
    title: '✅ Chess.com Discord Pinger Connected!',
    description: 'Your Discord Webhook is working perfectly! You will receive pings whenever your tracked players come online, start a game, or go offline.',
    color: 0x9b59b6, // Purple
    fields: [
      { name: 'Status', value: '🟢 Active & Ready', inline: true },
      { name: 'Mention Mode', value: mention || 'None', inline: true }
    ],
    footer: {
      text: 'Chess.com Discord Pinger • Test Ping',
      icon_url: 'https://www.chess.com/favicon.ico'
    },
    timestamp: new Date().toISOString()
  };

  return sendDiscordWebhook(webhookUrl, {
    content,
    embeds: [embed]
  });
}
