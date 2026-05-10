/**
 * Pinterest scraper — uses Pinterest v5 API (no Firecrawl credits consumed)
 * Searches for eco-kitchen keywords across Home & Garden / Food categories.
 *
 * Requires: PINTEREST_ACCESS_TOKEN in .env
 * Setup: https://developers.pinterest.com/apps/ — needs Business account + pins:read scope
 *
 * Run standalone: node scraper/pinterest.js
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'data', 'scraped');

const QUERIES = [
  'zero waste kitchen',
  'eco friendly kitchen',
  'sustainable kitchen swaps',
  'plastic free kitchen',
  'zero waste cooking',
];

const LIMIT = parseInt(process.env.SCRAPE_LIMIT || '25', 10);
const PINTEREST_API = 'https://api.pinterest.com/v5';

// Common English stop words to skip when extracting keywords from pin text.
const STOP_WORDS = new Set([
  'with', 'your', 'that', 'this', 'have', 'from', 'they', 'will', 'been',
  'what', 'when', 'here', 'more', 'also', 'than', 'into', 'over', 'just',
  'some', 'them', 'make', 'like', 'time', 'know', 'take', 'most', 'only',
  'come', 'then', 'does', 'many', 'need', 'even', 'about', 'their', 'would',
]);

function loadExistingUrls() {
  const urls = new Set();
  if (!existsSync(OUTPUT_DIR)) return urls;
  for (const file of readdirSync(OUTPUT_DIR).filter(f => f.startsWith('pinterest_'))) {
    try {
      const data = JSON.parse(readFileSync(join(OUTPUT_DIR, file), 'utf8'));
      if (Array.isArray(data)) data.forEach(item => item.url && urls.add(item.url));
    } catch { /* skip malformed files */ }
  }
  return urls;
}

function extractKeywords(title = '', description = '') {
  const text = `${title} ${description}`.toLowerCase();
  const words = text.match(/\b[a-z]{4,}\b/g) || [];
  return [...new Set(words.filter(w => !STOP_WORDS.has(w)))].slice(0, 10);
}

async function searchPins(query, token, existingUrls) {
  console.log(`  Searching "${query}" …`);

  const params = new URLSearchParams({
    query,
    page_size: Math.min(LIMIT, 25).toString(), // Pinterest max per page is 25
  });

  const response = await fetch(`${PINTEREST_API}/search/pins?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 401) {
    throw new Error('Pinterest 401 Unauthorized — check PINTEREST_ACCESS_TOKEN in .env');
  }
  if (response.status === 403) {
    throw new Error('Pinterest 403 Forbidden — token may be missing the "pins:read" scope');
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Pinterest API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  const pins = Array.isArray(data.items) ? data.items : [];

  return pins
    .filter(pin => {
      const pinUrl = `https://www.pinterest.com/pin/${pin.id}/`;
      return !existingUrls.has(pinUrl);
    })
    .map(pin => {
      const mediaType = pin.media?.media_type || 'image';
      // Map Pinterest media types to human-readable pin types
      const pinType = mediaType === 'video' ? 'video' : mediaType === 'idea' ? 'idea pin' : 'static';

      return {
        platform: 'pinterest',
        url: `https://www.pinterest.com/pin/${pin.id}/`,
        title: pin.title || null,
        description: pin.description || null,
        keywords: extractKeywords(pin.title, pin.description),
        pinType,
        repinCount: pin.save_count ?? null,
        datePosted: pin.created_at || null,
        imageUrl: pin.media?.images?.['600x']?.url || null,
        sourceQuery: query,
        scrapedAt: new Date().toISOString(),
      };
    });
}

export async function main() {
  if (!process.env.PINTEREST_ACCESS_TOKEN) {
    console.error('Error: PINTEREST_ACCESS_TOKEN is not set.');
    console.error('Get one at https://developers.pinterest.com/apps/');
    console.error('Requires: Business account + app with pins:read scope\n');
    process.exit(1);
  }

  const token = process.env.PINTEREST_ACCESS_TOKEN;
  const existingUrls = loadExistingUrls();
  console.log(`\nPinterest scraper — ${existingUrls.size} URLs already in history\n`);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const allResults = [];

  for (const query of QUERIES) {
    try {
      const items = await searchPins(query, token, existingUrls);
      items.forEach(item => existingUrls.add(item.url));
      allResults.push(...items);
      console.log(`  ✓ "${query}": ${items.length} new pins`);
    } catch (err) {
      console.error(`  ✗ "${query}": ${err.message}`);
    }
  }

  const date = new Date().toISOString().split('T')[0];
  const outPath = join(OUTPUT_DIR, `pinterest_${date}.json`);
  const toSave = allResults.slice(0, LIMIT * QUERIES.length);
  writeFileSync(outPath, JSON.stringify(toSave, null, 2));
  console.log(`\n→ Saved ${toSave.length} pins to ${outPath}\n`);

  return toSave;
}

// Run when invoked directly: node scraper/pinterest.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
