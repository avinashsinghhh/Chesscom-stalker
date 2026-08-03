# ♟️ Chess.com Discord Pinger

An ultra-lightweight, zero-dependency Chess.com tracker and Discord pinger application designed to run on **Netlify** (via Netlify Scheduled Functions + Static Web Dashboard) or locally on Node.js.

## 🌟 Features
- **🟢 Online Notifications**: Pings you on Discord when a tracked Chess.com player comes online.
- **⚔️ Game Started Notifications**: Pings you when a player starts a live or daily game with link and ratings.
- **🏆 Game Finished Notifications**: Pings you when a player finishes a game with results, ratings, and PGN link.
- **🔴 Offline Notifications**: Notifies you when a player goes offline.
- **🔔 Discord Mentions**: Supports pinging your Discord User ID (`<@1234567890>`), `@everyone`, or `@here`.
- **💻 Modern Web Dashboard**: Responsive dark glassmorphic UI to add/remove players, configure Discord Webhooks, view real-time player status, and trigger test pings.
- **⚡ Netlify Ready**: Built-in `netlify.toml` and Netlify Scheduled Function (`* * * * *` cron) for free serverless 24/7 monitoring!

---

## 🚀 Quickstart - Local Setup

### 1. Install & Run
No heavy dependencies required! Requires Node.js 18+.

```bash
# Start local server and background pinger daemon
npm start
```

Open your browser at `http://localhost:3000` to access the Web Dashboard.

---

## ☁️ How to Deploy on Netlify (24/7 Serverless Pinger)

1. Push this project repository to **GitHub**.
2. Log in to [Netlify](https://www.netlify.com/) and click **Add new site** -> **Import an existing project**.
3. Select your GitHub repository.
4. Netlify will automatically detect `netlify.toml` (Publish directory: `public`, Functions: `netlify/functions`).
5. Go to **Site Settings** -> **Environment variables** and add:
   - `DISCORD_WEBHOOK_URL`: Your Discord Webhook URL.
   - `PING_USER_ID`: Your Discord User ID (e.g. `123456789012345678` or `everyone`).
   - `TRACKED_PLAYERS`: Comma-separated list of usernames (e.g. `hikaru,magnuscarlsen`).
6. Deploy site! Netlify's scheduled cron function will automatically run every minute to check player status and send Discord pings!

---

## 🛠️ How to Get Discord Webhook URL & User ID

### Discord Webhook URL
1. Open Discord and go to your server channel settings (**Edit Channel** ⚙️).
2. Click **Integrations** -> **Webhooks** -> **New Webhook**.
3. Click **Copy Webhook URL** and paste it into the Web Dashboard or set `DISCORD_WEBHOOK_URL`.

### Discord User ID (For Pings)
1. Enable Developer Mode in Discord (**User Settings** ⚙️ -> **Advanced** -> **Developer Mode** -> ON).
2. Right-click your name in Discord and click **Copy User ID**.
3. Paste the ID (e.g. `987654321012345678`) into the Web Dashboard settings.

---

## 📂 Project Structure

```
chesscom-pinger/
├── public/                 # Static Web Dashboard
│   ├── index.html          # Dashboard HTML
│   ├── styles.css          # Glassmorphic dark styling
│   └── app.js              # Frontend logic & API fetchers
├── lib/                    # Core Modules
│   ├── pingerCore.mjs      # Chess.com status & game tracker logic
│   ├── notifier.mjs        # Discord webhook notification engine
│   └── storage.mjs         # Storage & environment manager
├── netlify/
│   └── functions/
│       ├── scheduled-pinger.mjs  # Netlify Scheduled Cron function (1 min)
│       └── api.mjs               # Netlify API serverless function
├── server.mjs              # Standalone Node.js server & daemon
├── netlify.toml            # Netlify build & schedule configuration
├── config.json             # Local configuration file
├── package.json
└── README.md
```

## 📄 License
MIT License.
