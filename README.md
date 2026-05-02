# nyaacli-proxy

<p align="center">
  <img src="https://img.shields.io/github/stars/Compromisee/nyaacli-proxy?style=for-the-badge&color=yellow" alt="Stars">
  <img src="https://img.shields.io/github/downloads/Compromisee/nyaacli-proxy/total?style=for-the-badge&color=green" alt="Downloads">
  <img src="https://img.shields.io/github/v/release/Compromisee/nyaacli-proxy?style=for-the-badge&color=blue" alt="Release">
  <img src="https://hitscounter.dev/api/hit?url=https%3A%2F%2Fgithub.com%2FCompromisee%2Fnyaacli-proxy&label=Views&icon=github&color=%230d6efd&message=&style=for-the-badge&tz=UTC">
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen?style=for-the-badge" alt="Dependencies">
  <img src="https://img.shields.io/badge/node-%3E%3D16-green?style=for-the-badge&logo=nodedotjs" alt="Node">
  <img src="https://img.shields.io/github/license/Compromisee/nyaacli-proxy?style=for-the-badge" alt="License">
</p>

<p align="center">
  <strong>A local CORS proxy + GUI dashboard for <a href="https://nyaa.si">nyaa.si</a></strong>
</p>

---

The dashboard (`dashboard.html`) runs in your browser and fetches **real** magnet links from nyaa.si via a tiny Node.js proxy (`server.js`) running on your machine. No external services, no API keys, no npm packages required.

```
Browser (dashboard.html)
    │  fetch http://localhost:3030/search?q=…
    ▼
server.js  (Node.js, port 3030)
    │  HTTPS request with proper User-Agent
    ▼
nyaa.si  (RSS feed → real magnet links)
```

---

## Requirements

| Thing | Version |
|---|---|
| Node.js | ≥ 16 (uses built-in `https` — **zero npm packages needed**) |
| OS | Windows / macOS / Linux |
| Browser | Any modern browser (Chrome, Firefox, Edge, Safari) |

```bash
node --version
# should print v16.x.x or higher
```

> [!NOTE]
> Don't have Node? Download from **[nodejs.org](https://nodejs.org)** — choose the LTS version.

> [!IMPORTANT]
> This project has **zero dependencies**. No `npm install` needed. Just `node server.js` and go.

---

## File Layout

```
nyaacli-proxy/
├── server.js        ← the proxy server  (run this first)
├── dashboard.html   ← open this in your browser
├── package.json     ← project metadata (no dependencies)
├── LICENSE          ← MIT license
└── README.md        ← you are here
```

---

## Quick Start

### 1 — Clone the repo

```bash
git clone https://github.com/Compromisee/nyaacli-proxy.git
cd nyaacli-proxy
```

### 2 — Start the proxy

```bash
node server.js
```

You should see:

```
  ╔══════════════════════════════════════╗
  ║   nyaacli-proxy  →  http://localhost:3030  ║
  ╚══════════════════════════════════════╝

  Endpoints:
    GET http://localhost:3030/health
    GET http://localhost:3030/search?q=Frieren&cat=1_0&filter=0&sort=seeders&order=desc

  Open dashboard.html in your browser, then search!
```

> [!WARNING]
> **Leave this terminal open.** The proxy must keep running while you use the dashboard. Closing the terminal kills the proxy.

### 3 — Open the dashboard

Double-click `dashboard.html`, drag it into your browser, or run:

```bash
# macOS
open dashboard.html

# Linux
xdg-open dashboard.html

# Windows (PowerShell)
start dashboard.html
```

### 4 — Search

Type an anime name (e.g. `Frieren`, `Solo Leveling`, `One Piece`) and press **Enter** or click **Search**.

> [!TIP]
> Results come from the live nyaa.si RSS feed with real magnet links. Use specific search terms for better results — e.g. `Frieren 1080p` instead of just `Frieren`.

---

## Using the Dashboard

### Filter Bar

| Control | What it does |
|---|---|
| **All / Trusted / No Remake / Batch** | Maps to nyaa's `f=` filter. "Trusted" and "No Remake" trigger a new server request; "Batch" is filtered client-side. |
| **Quality: S / A / B / C+** | Client-side tier filter based on the computed quality score. |
| **Res: 4K / 1080p / 720p / 480p** | Client-side resolution filter parsed from the torrent title. |
| **Category dropdown** | Maps to nyaa's `c=` category parameter (e.g. `1_0` = Anime). |
| **Sort dropdown** | Quality ★ and Resolution sort client-side. Seeders / Date / Size / Downloads use nyaa's server-side sort. |

### Quality Score (★)

Each result gets a score out of 100 based on six factors:

| Factor | Max pts | Notes |
|---|---|---|
| Resolution | 30 | 4K=30 · 1080p=25 · 720p=15 · 480p=5 |
| Encoding | 25 | AV1=25 · HEVC/x265=20–22 · x264=12 |
| Group reputation | 20 | S-tier groups (Ember, Kaleido, Judas…) score highest |
| Trust status | 15 | Trusted uploads get full 15; remakes get 0 |
| Seed health | 10 | Log scale — highly seeded = higher score |
| Recency | 10 | Releases older than ~400 days score 0 |

> [!TIP]
> Hover over any score badge in the results table to see the full breakdown tooltip.

**Tiers:** `S` ≥ 85 · `A` ≥ 70 · `B` ≥ 55 · `C` ≥ 40 · `D` < 40

### Magnet Links

| Button | Action |
|---|---|
| **⬇ Open** | Fires `magnet:?xt=...` — hands the link to your registered torrent client (qBittorrent, Transmission, Deluge, etc.) |
| **Copy** | Copies the raw magnet URI to your clipboard |
| **+ Queue** | Adds the entry to the in-page download queue panel |

### Download Queue

The queue panel at the bottom tracks what you've queued. Click **▶** on any item to re-open its magnet link in your torrent client.

---

## Proxy API Reference

### `GET /health`

Returns `{"ok": true, "ts": "..."}`. The dashboard pings this on load to verify the proxy is running.

### `GET /search`

| Parameter | Default | Description |
|---|---|---|
| `q` | *(required)* | Search query, e.g. `Frieren` |
| `cat` | `1_0` | Category code (see table below) |
| `filter` | `0` | `0` = all · `1` = no-remake · `2` = trusted-only |
| `sort` | `seeders` | `id` \| `seeders` \| `size` \| `downloads` |
| `order` | `desc` | `desc` \| `asc` |
| `p` | `1` | Page number (nyaa returns 75 results per page) |

<details>
<summary><strong>Category codes</strong></summary>

| Code | Category |
|---|---|
| `0_0` | All categories |
| `1_0` | Anime |
| `1_2` | Anime — English-translated |
| `1_4` | Anime — Non-English-translated |
| `1_1` | Anime — AMV |
| `2_0` | Audio |
| `2_1` | Audio — Lossless |
| `3_0` | Literature |
| `4_0` | Live Action |
| `5_0` | Pictures |
| `6_0` | Software |

</details>

<details>
<summary><strong>Example response</strong></summary>

```json
{
  "ok": true,
  "query": "Frieren",
  "cat": "1_0",
  "total": 75,
  "count": 75,
  "items": [
    {
      "title": "[SubsPlease] Sousou no Frieren - 01 (1080p) [F7B27C22].mkv",
      "link": "https://nyaa.si/view/1723444",
      "pubDate": "Fri, 29 Sep 2023 17:23:50 +0000",
      "seeders": 4821,
      "leechers": 183,
      "downloads": 92847,
      "size": "1.4 GiB",
      "infoHash": "F7B27C22EABC1234...",
      "categoryId": "1_2",
      "category": "Anime - English-translated",
      "status": "trusted",
      "magnetLink": "magnet:?xt=urn:btih:F7B27C22...&dn=...&tr=...",
      "resolution": "1080P",
      "encodings": ["AAC"],
      "group": "SubsPlease",
      "quality": {
        "total": 82,
        "pct": 75,
        "tier": "A",
        "breakdown": {
          "res": 25,
          "enc": 8,
          "grp": 15,
          "trust": 15,
          "seed": 10,
          "recency": 9
        }
      }
    }
  ]
}
```

</details>

---

## Changing the Port

The proxy defaults to **3030**. To use a different port:

```bash
PORT=8080 node server.js
```

> [!IMPORTANT]
> If you change the port, you **must** also update the `PROXY` constant at the top of `dashboard.html`:
> ```js
> const PROXY = 'http://localhost:8080';
> ```

---

## Running in the Background

<details>
<summary><strong>macOS / Linux — nohup</strong></summary>

```bash
nohup node server.js > proxy.log 2>&1 &
echo "Proxy PID: $!"
```

To stop it later:

```bash
lsof -i :3030        # find the process
kill <PID>           # stop it
```

</details>

<details>
<summary><strong>macOS — launchd (auto-start on login)</strong></summary>

Create `~/Library/LaunchAgents/com.nyaacli.proxy.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>             <string>com.nyaacli.proxy</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/path/to/nyaacli-proxy/server.js</string>
  </array>
  <key>RunAtLoad</key>         <true/>
  <key>KeepAlive</key>         <true/>
  <key>StandardOutPath</key>   <string>/tmp/nyaacli-proxy.log</string>
  <key>StandardErrorPath</key> <string>/tmp/nyaacli-proxy-err.log</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.nyaacli.proxy.plist
```

</details>

<details>
<summary><strong>Windows — pm2</strong></summary>

```powershell
npm install -g pm2
pm2 start server.js --name nyaacli-proxy
pm2 save
pm2 startup   # follow the printed instruction to auto-start on boot
```

</details>

<details>
<summary><strong>Linux — systemd</strong></summary>

Create `/etc/systemd/system/nyaacli-proxy.service`:

```ini
[Unit]
Description=nyaacli CORS proxy
After=network.target

[Service]
ExecStart=/usr/bin/node /path/to/nyaacli-proxy/server.js
Restart=always
User=youruser
Environment=PORT=3030

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable nyaacli-proxy
sudo systemctl start nyaacli-proxy
sudo systemctl status nyaacli-proxy
```

</details>

---

## Troubleshooting

<details>
<summary><strong>❌ "Proxy offline" banner in the dashboard</strong></summary>

The sidebar dot turns red and search does nothing.

> [!CAUTION]
> Make sure you:
> 1. Ran `node server.js` and it printed the startup banner.
> 2. Didn't close that terminal window.
> 3. Don't have another app using port 3030 — try `PORT=3031 node server.js` and update `PROXY` in `dashboard.html`.

</details>

<details>
<summary><strong>❌ <code>EADDRINUSE</code> error on startup</strong></summary>

Port 3030 is already taken.

> [!TIP]
> Either kill the occupying process or use a different port:
> ```bash
> # macOS / Linux — kill the occupying process
> lsof -ti:3030 | xargs kill
>
> # or just use a different port
> PORT=3031 node server.js
> ```

</details>

<details>
<summary><strong>❌ Magnet links don't open the torrent client</strong></summary>

Your OS doesn't have `magnet:` links associated with a torrent client.

> [!NOTE]
> Fix by registering your client as the magnet handler:
> - **qBittorrent** → Preferences → BitTorrent → enable "Register as magnet handler"
> - **Transmission** → registers automatically on install
> - **Windows** → right-click a `.torrent` file → Open With → set default
>
> Until then, use **Copy** to paste the magnet URI directly into your client's "Add torrent by magnet" dialog.

</details>

<details>
<summary><strong>❌ "Failed to fetch nyaa.si: Request timed out"</strong></summary>

> [!WARNING]
> nyaa.si may be rate-limiting you or temporarily slow. Wait a few seconds and try again. The proxy has a 15-second timeout.

</details>

<details>
<summary><strong>❌ Node.js version error</strong></summary>

> [!CAUTION]
> If you see `SyntaxError: Unexpected token` or `AbortSignal is not defined`, your Node.js is too old. Update to **Node 18 LTS** from [nodejs.org](https://nodejs.org).

</details>

---

## Notes

> [!NOTE]
> - nyaa.si returns a maximum of **75 results per RSS page** — use the page controls in the dashboard to fetch more.
> - The quality score, resolution filter, and tier filter all run **client-side** on already-fetched data and don't trigger new requests.
> - The proxy does **not** cache results — every search hits nyaa.si directly.

> [!CAUTION]
> This tool is for **personal use only**. Respect nyaa.si's ToS and don't hammer the server with rapid automated searches.

---

## License

This project is licensed under the **[MIT License](LICENSE)**.

```
MIT License

Copyright (c) 2025 Compromisee

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Credits

| | |
|---|---|
| **Author** | [@Compromisee](https://github.com/Compromisee) |
| **Data source** | [nyaa.si](https://nyaa.si) — public BitTorrent tracker for anime, manga, and related media |
| **Built with** | [Node.js](https://nodejs.org) — uses only built-in modules (`http`, `https`, `url`), zero external dependencies |
| **Inspired by** | The anime community's need for a simple, private, local-first torrent search tool |

### Special Thanks

- The **nyaa.si** team for maintaining a reliable public RSS feed
- The **fansub community** — groups like SubsPlease, Erai-raws, Ember, Kaleido, Judas, and many others who make anime accessible worldwide
- Everyone who stars ⭐ and shares this project

---

<p align="center">
  <strong>If this project helped you, consider giving it a ⭐ on <a href="https://github.com/Compromisee/nyaacli-proxy">GitHub</a>!</strong>
</p>

<p align="center">
  <a href="https://github.com/Compromisee/nyaacli-proxy/issues">Report a Bug</a> · 
  <a href="https://github.com/Compromisee/nyaacli-proxy/issues">Request a Feature</a> · 
  <a href="https://github.com/Compromisee/nyaacli-proxy/fork">Fork</a>
</p>
