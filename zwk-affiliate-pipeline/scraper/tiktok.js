/**
 * TikTok Creative Center scraper
 * Scrapes trending hashtag data from https://ads.tiktok.com/business/creativecenter/
 * for eco-kitchen hashtags. No auth required — the Creative Center is public.
 *
 * Run standalone: node scraper/tiktok.js
 */

import FirecrawlApp from '@mendable/firecrawl-js';
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'data', 'scraped');

const HASHTAGS = ['zerowaste', 'ecokitchen', 'sustainableswaps', 'kitchenhacks', 'plasticfree'];
const LIMIT = parseInt(process.env.SCRAPE_LIMIT || '25', 10);

// Build a Set of all post URLs already saved in previous tiktok_*.json files.
function loadExistingUrls() {
  const urls = new Set();
  if (!existsSync(OUTPUT_DIR)) return urls;
  for (const file of readdirSync(OUTPUT_DIR).filter(f => f.startsWith('tiktok_'))) {
    try {
      const data = JSON.parse(readFileSync(join(OUTPUT_DIR, file), 'utf8'));
      if (Array.isArray(data)) data.forEach(item => item.url && urls.add(item.url));
    } catch { /* skip malformed files */ }
  }
  return urls;
}

async function scrapeHashtag(app, hashtag, existingUrls) {
  const url = `https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en?hashtag=${hashtag}`;
  console.log(`  Scraping #${hashtag} …`);

  const result = await app.scrapeUrl(url, {
    formats: ['extract'],
    waitFor: 5000,
    actions: [
      { type: 'wait', milliseconds: 4000 },
      { type: 'scroll', direction: 'down', amount: 800 },
      { type: 'wait', milliseconds: 2000 },
      { type: 'scroll', direction: 'down', amount: 800 },
      { type: 'wait', milliseconds: 1500 },
    ],
    extract: {
      prompt: `You are viewing a TikTok Creative Center page for the hashtag #${hashtag}.

Extract all visible video content. For each video shown, return:
- url: direct video link or creator profile link
- caption: video caption/description text
- hashtags: array of hashtags in the caption (strings without #)
- viewCount: view count as an integer (convert 1.2M → 1200000, 45K → 45000)
- likeCount: like count as an integer if shown
- duration: video duration string (e.g. "0:15")
- datePosted: date posted if visible (ISO format preferred)

Also extract hashtag-level stats if shown:
- postCount: total posts using this hashtag
- totalViews: total views across all posts with this hashtag

Return JSON: { hashtagStats: { postCount, totalViews }, videos: [...] }`,
    },
  });

  if (!result.success) {
    throw new Error(result.error || 'Scrape returned no success flag');
  }

  const extracted = result.extract || {};
  const videos = Array.isArray(extracted.videos) ? extracted.videos : [];

  return videos
    .filter(v => v.url && !existingUrls.has(v.url))
    .map(v => ({
      platform: 'tiktok',
      url: v.url,
      caption: v.caption || null,
      hashtags: Array.isArray(v.hashtags) ? v.hashtags : [hashtag],
      viewCount: Number.isFinite(v.viewCount) ? v.viewCount : null,
      likeCount: Number.isFinite(v.likeCount) ? v.likeCount : null,
      duration: v.duration || null,
      datePosted: v.datePosted || null,
      sourceHashtag: `#${hashtag}`,
      hashtagStats: extracted.hashtagStats || null,
      scrapedAt: new Date().toISOString(),
    }));
}

export async function main() {
  if (!process.env.FIRECRAWL_API_KEY) {
    console.error('Error: FIRECRAWL_API_KEY is not set. Copy .env.example → .env and add your key.');
    process.exit(1);
  }

  const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
  const existingUrls = loadExistingUrls();
  console.log(`\nTikTok scraper — ${existingUrls.size} URLs already in history\n`);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const allResults = [];

  for (const hashtag of HASHTAGS) {
    try {
      const items = await scrapeHashtag(app, hashtag, existingUrls);
      items.forEach(item => existingUrls.add(item.url));
      allResults.push(...items);
      console.log(`  ✓ #${hashtag}: ${items.length} new items`);
    } catch (err) {
      console.error(`  ✗ #${hashtag}: ${err.message}`);
    }
  }

  const date = new Date().toISOString().split('T')[0];
  const outPath = join(OUTPUT_DIR, `tiktok_${date}.json`);
  const toSave = allResults.slice(0, LIMIT * HASHTAGS.length);
  writeFileSync(outPath, JSON.stringify(toSave, null, 2));
  console.log(`\n→ Saved ${toSave.length} items to ${outPath}\n`);

  return toSave;
}

// Run when invoked directly: node scraper/tiktok.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
