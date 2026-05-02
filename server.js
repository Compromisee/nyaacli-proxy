/**
 * nyaacli-proxy — Node.js CORS proxy for nyaa.si
 *
 * Fetches nyaa.si search/RSS results server-side (no CORS issues),
 * parses the XML feed, extracts real magnet links, and returns JSON
 * to the dashboard running in your browser.
 *
 * Endpoints:
 *   GET /search?q=QUERY&cat=1_0&filter=0&sort=seeders&order=desc&p=1
 *   GET /health
 */

const http  = require('http');
const https = require('https');
const url   = require('url');

// ── Config ────────────────────────────────────────────────────────────────────
const PORT        = process.env.PORT || 3030;
const NYAA_BASE   = 'https://nyaa.si';
const NYAA_RSS    = `${NYAA_BASE}/?page=rss`;
const USER_AGENT  = 'Mozilla/5.0 (nyaacli-proxy/1.0; +https://github.com/ej-agas/nyaacli)';
const TIMEOUT_MS  = 15000;

// ── CORS headers ──────────────────────────────────────────────────────────────
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

// ── Tiny fetch helper (no dependencies) ──────────────────────────────────────
function fetch(targetUrl) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(targetUrl);
    const driver  = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      headers:  {
        'User-Agent': USER_AGENT,
        'Accept':     'application/rss+xml, text/xml, */*',
      },
      timeout: TIMEOUT_MS,
    };

    const req = driver.request(options, (res) => {
      // follow one redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`nyaa.si returned HTTP ${res.statusCode}`));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end',  ()    => resolve(body));
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.on('error',   reject);
    req.end();
  });
}

// ── XML helpers (no external parser needed) ───────────────────────────────────
function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m  = xml.match(re);
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
}

function extractAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'i');
  const m  = xml.match(re);
  return m ? m[1] : '';
}

function parseItems(rssXml) {
  // split on <item> boundaries
  const raw   = rssXml.split('<item>').slice(1);
  const items = [];

  for (const block of raw) {
    const closeIdx = block.indexOf('</item>');
    const chunk    = closeIdx === -1 ? block : block.slice(0, closeIdx);

    // ── Core fields ──
    const title    = extractTag(chunk, 'title');
    const link     = extractTag(chunk, 'link') || extractTag(chunk, 'guid');
    const pubDate  = extractTag(chunk, 'pubDate');
    const desc     = extractTag(chunk, 'description');

    // ── nyaa namespace extensions ──
    // <nyaa:seeders>, <nyaa:leechers>, <nyaa:downloads>, <nyaa:size>,
    // <nyaa:infoHash>, <nyaa:categoryId>, <nyaa:category>, <nyaa:trusted>, <nyaa:remake>
    const seeders   = parseInt(extractTag(chunk, 'nyaa:seeders'),   10) || 0;
    const leechers  = parseInt(extractTag(chunk, 'nyaa:leechers'),  10) || 0;
    const downloads = parseInt(extractTag(chunk, 'nyaa:downloads'), 10) || 0;
    const size      = extractTag(chunk, 'nyaa:size');
    const infoHash  = extractTag(chunk, 'nyaa:infoHash').toUpperCase();
    const catId     = extractTag(chunk, 'nyaa:categoryId');   // e.g. "1_2"
    const category  = extractTag(chunk, 'nyaa:category');     // e.g. "Anime - English-translated"
    const trusted   = extractTag(chunk, 'nyaa:trusted');      // "Yes" / "No"
    const remake    = extractTag(chunk, 'nyaa:remake');       // "Yes" / "No"

    // ── Derive status badge ──
    let status = 'normal';
    if (trusted === 'Yes') status = 'trusted';
    if (remake  === 'Yes') status = 'remake';

    // ── Build real magnet from infoHash (trackers = standard nyaa set) ──
    const trackers = [
      'udp://open.stealth.si:80/announce',
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://tracker.torrent.eu.org:451/announce',
      'http://nyaa.tracker.wf:7777/announce',
    ];
    const magnetLink = infoHash
      ? `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}&` +
        trackers.map(t => `tr=${encodeURIComponent(t)}`).join('&')
      : '';

    // ── Parse resolution / encoding from title ──
    const resMatch  = title.match(/\b(2160p|4K|1080p|720p|480p|360p)\b/i);
    const encMatch  = title.match(/\b(AV1|HEVC|x265|x264|h264|BluRay|BDRip|WEB-DL|WEBRip|FLAC|AAC|AC3)\b/gi);
    const resolution = resMatch  ? resMatch[1].toUpperCase()  : 'Unknown';
    const encodings  = encMatch  ? [...new Set(encMatch.map(e => e.toUpperCase()))] : [];

    // ── Extract group tag [Group] ──
    const grpMatch = title.match(/^\[([^\]]+)\]/);
    const group    = grpMatch ? grpMatch[1] : 'Unknown';

    // ── Computed quality score ──
    const quality = scoreQuality({ resolution, encodings, group, status, seeders, pubDate });

    if (!title) continue; // skip malformed items

    items.push({
      title,
      link,
      pubDate,
      description: desc,
      seeders,
      leechers,
      downloads,
      size,
      infoHash,
      categoryId: catId,
      category,
      status,
      magnetLink,
      resolution,
      encodings,
      group,
      quality,
    });
  }

  return items;
}

// ── Quality scoring (mirrors dashboard logic) ─────────────────────────────────
const GROUP_TIER = {
  // S-tier — consistently high quality encodes
  'SubsPlease': 'A', 'Erai-raws': 'A', 'Judas': 'S', 'Ember': 'S',
  'Kaleido': 'S', 'Yameii': 'A', 'LostYears': 'B', 'NC-Raws': 'B',
  'AniDL': 'C', 'Tsundere': 'C', 'MTBB': 'S', 'NanDesuKa': 'S',
  'ZR': 'A', 'Commie': 'A', 'Underwater': 'A',
};

function scoreQuality({ resolution, encodings, group, status, seeders, pubDate }) {
  // Resolution (0–30)
  const resScore = { '2160P': 30, '4K': 30, '1080P': 25, '720P': 15, '480P': 5, '360P': 2 }[resolution.toUpperCase()] || 10;

  // Encoding (0–25) — pick highest-scoring codec present
  const encScores = { 'AV1': 25, 'HEVC': 22, 'X265': 20, 'BLURAY': 18, 'BDRIP': 17, 'WEB-DL': 15, 'X264': 12, 'H264': 10, 'WEBRIP': 11 };
  const encScore  = encodings.reduce((best, e) => Math.max(best, encScores[e] || 0), 8);

  // Group reputation (0–20)
  const tier     = GROUP_TIER[group] || 'C';
  const grpScore = { S: 20, A: 15, B: 10, C: 5 }[tier] || 5;

  // Trust status (0–15)
  const trustScore = { trusted: 15, normal: 7, remake: 0 }[status] || 5;

  // Seed health (0–10)
  const seedScore = Math.min(10, Math.round(Math.log10(seeders + 1) * 3.3));

  // Recency (0–10)
  const days        = pubDate ? Math.floor((Date.now() - new Date(pubDate).getTime()) / 86400000) : 200;
  const recencyScore = Math.max(0, 10 - Math.floor(days / 40));

  const total = resScore + encScore + grpScore + trustScore + seedScore + recencyScore;
  const pct   = Math.round((total / 110) * 100);
  const qtier = pct >= 85 ? 'S' : pct >= 70 ? 'A' : pct >= 55 ? 'B' : pct >= 40 ? 'C' : 'D';

  return {
    total, pct, tier: qtier,
    breakdown: {
      res: resScore, enc: encScore, grp: grpScore,
      trust: trustScore, seed: seedScore, recency: recencyScore,
    },
  };
}

// ── Request handler ───────────────────────────────────────────────────────────
async function handle(req, res) {
  const { pathname, query } = url.parse(req.url, true);

  setCORS(res);

  // preflight
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // ── /health ──
  if (pathname === '/health') {
    res.writeHead(200);
    return res.end(JSON.stringify({ ok: true, ts: new Date().toISOString() }));
  }

  // ── /search ──
  if (pathname === '/search') {
    const q      = (query.q      || '').trim();
    const cat    = (query.cat    || '1_0').trim();
    const filter = (query.filter || '0').trim();   // 0=all 1=no-remake 2=trusted
    const sort   = (query.sort   || 'seeders').trim();
    const order  = (query.order  || 'desc').trim();
    const page   = parseInt(query.p || '1', 10);

    if (!q) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'Missing query parameter ?q=' }));
    }

    // Build nyaa.si RSS URL
    // nyaa.si RSS: /?page=rss&q=QUERY&c=CAT&f=FILTER&s=SORT&o=ORDER&p=PAGE
    const rssUrl = `${NYAA_RSS}` +
      `&q=${encodeURIComponent(q)}` +
      `&c=${encodeURIComponent(cat)}` +
      `&f=${encodeURIComponent(filter)}` +
      `&s=${encodeURIComponent(sort)}` +
      `&o=${encodeURIComponent(order)}` +
      `&p=${page}`;

    console.log(`[${new Date().toISOString()}] Fetching: ${rssUrl}`);

    try {
      const xml   = await fetch(rssUrl);
      const items = parseItems(xml);

      // Extract total from <nyaa:totalItems> or fall back to items count
      const totalMatch = xml.match(/<nyaa:totalItems>(\d+)<\/nyaa:totalItems>/i);
      const total      = totalMatch ? parseInt(totalMatch[1], 10) : items.length;

      res.writeHead(200);
      res.end(JSON.stringify({
        ok: true,
        query: q, cat, filter, sort, order, page,
        total,
        count: items.length,
        items,
      }));
    } catch (err) {
      console.error(`[ERROR] ${err.message}`);
      res.writeHead(502);
      res.end(JSON.stringify({ error: `Failed to fetch nyaa.si: ${err.message}` }));
    }
    return;
  }

  // ── fallback ──
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found. Use GET /search?q=... or GET /health' }));
}

// ── Start ─────────────────────────────────────────────────────────────────────
const server = http.createServer(handle);
server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log(`  ║   nyaacli-proxy  →  http://localhost:${PORT}  ║`);
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
  console.log('  Endpoints:');
  console.log(`    GET http://localhost:${PORT}/health`);
  console.log(`    GET http://localhost:${PORT}/search?q=Frieren&cat=1_0&filter=0&sort=seeders&order=desc`);
  console.log('');
  console.log('  Open dashboard.html in your browser, then search!');
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ✗ Port ${PORT} is already in use.`);
    console.error(`  Try: PORT=3031 node server.js\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
