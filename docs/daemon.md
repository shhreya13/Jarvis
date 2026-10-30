# Running the Jarvis daemon

`jarvis start` runs the gateway (REST + websocket on 127.0.0.1:4820 by default),
the Telegram bot (if enabled in config), and the cron scheduler — one process.

Environment it needs:

- The provider key env var named in `~/.jarvis/config.json` (e.g. `ANTHROPIC_API_KEY`)
- `TELEGRAM_BOT_TOKEN` (or the env var you configured) if Telegram is enabled
- `BRAVE_API_KEY` (or configured name) for web_search

## pm2

```bash
npm install -g pm2
pm2 start "jarvis start" --name jarvis \
  --restart-delay 5000 --max-restarts 20
pm2 save          # persist across reboots (with `pm2 startup`)
pm2 logs jarvis
```

Environment variables: pm2 inherits your shell env at `pm2 start` time. For a
clean setup, put them in an ecosystem file instead:

```js
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: "jarvis",
    script: "jarvis",
    args: "start",
    restart_delay: 5000,
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
      BRAVE_API_KEY: process.env.BRAVE_API_KEY,
    },
  }],
};
```

```bash
pm2 start ecosystem.config.cjs
```

## launchd (macOS)

Create `~/Library/LaunchAgents/com.jarvis.daemon.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.jarvis.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/jarvis</string>
    <string>start</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ANTHROPIC_API_KEY</key><string>REPLACE_ME</string>
    <key>TELEGRAM_BOT_TOKEN</key><string>REPLACE_ME</string>
    <key>BRAVE_API_KEY</key><string>REPLACE_ME</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/jarvis.log</string>
  <key>StandardErrorPath</key><string>/tmp/jarvis.err.log</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.jarvis.daemon.plist
launchctl list | grep jarvis
```

Note the plist stores secrets in plaintext — `chmod 600` it, or prefer pm2 with
env inheritance if that bothers you (it should).

## systemd (Linux)

```ini
# /etc/systemd/system/jarvis.service
[Unit]
Description=Jarvis personal AI agent
After=network-online.target

[Service]
ExecStart=/usr/local/bin/jarvis start
Restart=on-failure
RestartSec=5
User=%i
EnvironmentFile=/etc/jarvis.env   # KEY=value lines, chmod 600

[Install]
WantedBy=default.target
```
