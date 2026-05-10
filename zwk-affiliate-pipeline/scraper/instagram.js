/**
 * Instagram hashtag scraper
 * Scrapes public hashtag pages using Firecrawl + a session cookie for auth.
 *
 * Requires: FIRECRAWL_API_KEY + INSTAGRAM_SESSION_ID in .env
 * Without a session ID, Instagram returns a login wall and results will be empty.
 *
 * How to get INSTAGRAM_SESSION_ID:
 *   1. Log into instagram.com in your browser
 *   2. DevTools → Application → Cookies → https://www.instagram.com
 *   3. Copy the value of the "sessionid" cookie
 *   Cookies expire roughly every 90 days — refresh when scraper returns 0 results.
 *
 * Run standalone: node scraper/instagram.js
 */

import FirecrawlApp from '@mendable/firecrawl-js';
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'data', 'scraped');

const HASHTAGS = ['zerowastekitchen', 'ecofriendlykitchen', 'sustainablekitchen'];
const LIMIT = parseInt(process.env.SCRAPE_LIMIT || '25', 10);

function loadExistingUrls() {
  const urls = new Set();
  if (!existsSync(OUTPUT_DIR)) return urls;
  for (const file of readdirSync(OUTPUT_DIR).filter(f => f.startsWith('instagram_'))) {
    try {
      const data = JSON.parse(readFileSync(join(OUTPUT_DIR, file), 'utf8'));
      if (Array.isArray(data)) data.forEach(item => item.url && urls.add(item.url));
    } catch { /* skip malformed files */ }
  }
  return urls;
}

async function scrapeHashtag(app, hashtag, existingUrls, sessionId) {
  const url = `https://www.instagram.com/explore/tags/${hashtag}/`;
  console.log(`  Scraping #${hashtag} …`);

  const options = {
    formats: ['extract'],
    waitFor: 5000,
    actions: [
      { type: 'wait', milliseconds: 4000 },
      { type: 'scroll', direction: 'down', amount: 1000 },
      { type: 'wait', milliseconds: 2000 },
      { type: 'scroll', direction: 'down', amount: 1000 },
      { type: 'wait', milliseconds: 1500 },
    ],
    extract: {
      prompt: `You are viewing an Instagram hashtag explore page for #${hashtag}.

Extract all visible posts from the grid. For each post, return:
- url: the full post URL (format: https://www.instagram.com/p/SHORTCODE/)
- caption: the post caption/description text (may be truncated in grid view)
- hashtags: array of hashtags found in the caption (strings without #)
- likeCount: number of likes as an integer (convert 1.2K → 1200, 45K → 45000)
- commentCount: number of comments as an integer if visible
- format: one of "Reel", "carousel", "single", or "video"
- datePosted: date posted if visible (ISO format preferred)

If the page shows a login wall instead of posts, return { loginRequired: true, posts: [] }.

Return JSON: { posts: [...] }`,
    },
  };

  // Pass the session cookie so Instagram shows the authenticated feed.
  if (sessionId) {
    options.headers = { Cookie: `sessionid=${sessionId}` };
  }

  const result = await app.scrapeUrl(url, options);

  if (!result.success) {
    throw new Error(result.error || 'Scrape returned no success flag');
  }

  const extracted = result.extract || {};

  if (extracted.loginRequired) {
    throw new Error(
      'Instagram returned a login wall. Check that INSTAGRAM_SESSION_ID is set and not expired.'
    );
  }

  const posts = Array.isArray(extracted.posts) ? extracted.posts : [];

  if (posts.length === 0 && !sessionId) {
    console.warn(
      `  Warning: no posts extracted for #${hashtag}.\n` +
      `  Instagram requires auth — set INSTAGRAM_SESSION_ID in .env to get results.`
    );
  }

  return posts
    .filter(p => p.url && !existingUrls.has(p.url))
    .map(p => ({
      platform: 'instagram',
      url: p.url,
      caption: p.caption || null,
      hashtags: Array.isArray(p.hashtags) ? p.hashtags : [hashtag],
      likeCount: Number.isFinite(p.likeCount) ? p.likeCount : null,
      commentCount: Number.isFinite(p.commentCount) ? p.commentCount : null,
      format: p.format || null,
      datePosted: p.datePosted || null,
      sourceHashtag: `#${hashtag}`,
      scrapedAt: new Date().toISOString(),
    }));
}

export async function main() {
  if (!process.env.FIRECRAWL_API_KEY) {
    console.error('Error: FIRECRAWL_API_KEY is not set. Copy .env.example → .env and add your key.');
    process.exit(1);
  }

  const sessionId = process.env.INSTAGRAM_SESSION_ID || null;
  if (!sessionId) {
    console.warn(
      'Warning: INSTAGRAM_SESSION_ID not set.\n' +
      'Instagram blocks unauthenticated access — results will likely be empty.\n' +
      'See .env.example for instructions.\n'
    );
  }

  const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
  const existingUrls = loadExistingUrls();
  console.log(`\nInstagram scraper — ${existingUrls.size} URLs already in history\n`);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const allResults = [];

  for (const hashtag of HASHTAGS) {
    try {
      const items = await scrapeHashtag(app, hashtag, existingUrls, sessionId);
      items.forEach(item => existingUrls.add(item.url));
      allResults.push(...items);
      console.log(`  ✓ #${hashtag}: ${items.length} new items`);
    } catch (err) {
      console.error(`  ✗ #${hashtag}: ${err.message}`);
    }
  }

  const date = new Date().toISOString().split('T')[0];
  const outPath = join(OUTPUT_DIR, `instagram_${date}.json`);
  const toSave = allResults.slice(0, LIMIT * HASHTAGS.length);
  writeFileSync(outPath, JSON.stringify(toSave, null, 2));
  console.log(`\n→ Saved ${toSave.length} items to ${outPath}\n`);

  return toSave;
}

// Run when invoked directly: node scraper/instagram.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
