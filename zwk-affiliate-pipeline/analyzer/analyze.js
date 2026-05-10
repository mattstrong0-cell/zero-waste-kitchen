/**
 * Pattern Analyzer — Part 2 of the ZWK affiliate pipeline
 * Reads all scraped JSON from data/scraped/, selects top-50 per platform by
 * engagement, sends to Claude in one combined call, saves structured analysis
 * to data/analysis/.
 *
 * Requires: ANTHROPIC_API_KEY in .env
 *
 * Run standalone: node analyzer/analyze.js
 */

import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRAPED_DIR = join(__dirname, '..', 'data', 'scraped');
const ANALYSIS_DIR = join(__dirname, '..', 'data', 'analysis');
const TOP_N = parseInt(process.env.ANALYZE_LIMIT || '50', 10);
const MODEL = 'claude-sonnet-4-6';

// Stable system prompt — cached on first request so subsequent runs skip
// re-tokenizing these ~700 tokens.
const SYSTEM_PROMPT = `You are a content strategist and viral marketing analyst specializing in eco-friendly and zero-waste lifestyle content for Amazon Associates affiliate marketing.

You will receive a curated set of top-performing posts from TikTok, Pinterest, and Instagram, all in the zero-waste kitchen / sustainable living niche. Your job is to identify actionable viral content patterns that the zerowaste-kitchen.com site can use to create affiliate content.

Analyze the content for:
1. Viral formats — what content structures get the most engagement (listicles, before/after, product demos, tutorials, etc.)
2. Hook patterns — how do high-performing posts open (questions, bold claims, "stop doing X", numbers, etc.)
3. CTA patterns — what calls-to-action appear in high-engagement content
4. Engagement themes — which zero-waste/eco topics generate the most response
5. Cross-platform insights — patterns that appear across TikTok, Pinterest, AND Instagram (highest-confidence signals)
6. Top keywords — recurring words and phrases in high-engagement content

Return ONLY valid JSON with exactly this structure — no markdown fences, no prose outside the JSON:
{
  "patterns": {
    "viralFormats": [
      { "format": "string", "description": "string", "exampleCount": number, "platforms": ["tiktok"|"pinterest"|"instagram"], "confidence": "high"|"medium"|"low" }
    ],
    "hookPatterns": [
      { "pattern": "string", "example": "string", "platforms": ["tiktok"|"pinterest"|"instagram"], "confidence": "high"|"medium"|"low" }
    ],
    "ctaPatterns": [
      { "pattern": "string", "example": "string", "platforms": ["tiktok"|"pinterest"|"instagram"] }
    ],
    "engagementThemes": [
      { "theme": "string", "description": "string", "relatedKeywords": ["string"], "platforms": ["tiktok"|"pinterest"|"instagram"], "avgEngagement": "high"|"medium"|"low" }
    ],
    "crossPlatformInsights": [
      { "insight": "string", "evidence": "string" }
    ],
    "topKeywords": ["string"]
  },
  "topPerformers": {
    "tiktok": [{ "url": "string", "metric": "string", "value": number, "noteworthy": "string" }],
    "pinterest": [{ "url": "string", "metric": "string", "value": number, "noteworthy": "string" }],
    "instagram": [{ "url": "string", "metric": "string", "value": number, "noteworthy": "string" }]
  },
  "actionableRecommendations": [
    { "recommendation": "string", "rationale": "string", "priority": "high"|"medium"|"low" }
  ]
}`;

function engagementScore(item) {
  switch (item.platform) {
    case 'tiktok':
      // Views are high-volume; weight likes more heavily for quality signal
      return (item.viewCount || 0) * 0.1 + (item.likeCount || 0);
    case 'pinterest':
      // Repins are high-intent saves — 10× weight vs raw likes
      return (item.repinCount || 0) * 10;
    case 'instagram':
      // Comments signal deeper engagement than likes
      return (item.likeCount || 0) + (item.commentCount || 0) * 5;
    default:
      return 0;
  }
}

function loadAndRankContent() {
  if (!existsSync(SCRAPED_DIR)) return null;

  const files = readdirSync(SCRAPED_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) return null;

  const byPlatform = { tiktok: [], pinterest: [], instagram: [] };
  const seenUrls = new Set();

  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(SCRAPED_DIR, file), 'utf8'));
      if (!Array.isArray(data)) continue;
      for (const item of data) {
        if (!item.url || !item.platform || seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);
        if (byPlatform[item.platform]) byPlatform[item.platform].push(item);
      }
    } catch { /* skip malformed files */ }
  }

  if (!Object.values(byPlatform).some(arr => arr.length > 0)) return null;

  for (const platform of Object.keys(byPlatform)) {
    byPlatform[platform] = byPlatform[platform]
      .sort((a, b) => engagementScore(b) - engagementScore(a))
      .slice(0, TOP_N);
  }

  return byPlatform;
}

function buildContentBlock(byPlatform) {
  const parts = [];
  let total = 0;

  for (const [platform, items] of Object.entries(byPlatform)) {
    if (items.length === 0) continue;
    total += items.length;
    parts.push(`## ${platform.charAt(0).toUpperCase() + platform.slice(1)} — top ${items.length} by engagement\n`);

    for (const item of items) {
      const fields = [`URL: ${item.url}`];
      if (item.caption)        fields.push(`Caption: ${item.caption}`);
      if (item.title)          fields.push(`Title: ${item.title}`);
      if (item.description)    fields.push(`Description: ${item.description}`);
      if (item.hashtags?.length)  fields.push(`Hashtags: ${item.hashtags.join(' ')}`);
      if (item.keywords?.length)  fields.push(`Keywords: ${item.keywords.join(', ')}`);
      if (item.viewCount != null)    fields.push(`Views: ${item.viewCount.toLocaleString()}`);
      if (item.likeCount != null)    fields.push(`Likes: ${item.likeCount.toLocaleString()}`);
      if (item.commentCount != null) fields.push(`Comments: ${item.commentCount.toLocaleString()}`);
      if (item.repinCount != null)   fields.push(`Repins: ${item.repinCount.toLocaleString()}`);
      if (item.format)         fields.push(`Format: ${item.format}`);
      if (item.pinType)        fields.push(`Pin type: ${item.pinType}`);
      if (item.duration)       fields.push(`Duration: ${item.duration}`);
      if (item.datePosted)     fields.push(`Posted: ${item.datePosted}`);
      if (item.sourceHashtag)  fields.push(`Source: ${item.sourceHashtag}`);
      if (item.sourceQuery)    fields.push(`Source query: "${item.sourceQuery}"`);
      parts.push(fields.join('\n'));
      parts.push('');
    }
  }

  return { text: parts.join('\n'), total };
}

export async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set. Add it to .env (see .env.example).');
    process.exit(1);
  }

  const byPlatform = loadAndRankContent();
  if (!byPlatform) {
    console.error(
      'Error: No scraped data found in data/scraped/.\n' +
      'Run the scrapers first:  node scraper/index.js'
    );
    process.exit(1);
  }

  const counts = Object.fromEntries(
    Object.entries(byPlatform).map(([p, items]) => [p, items.length])
  );
  console.log('\nZero Waste Kitchen — Pattern Analyzer');
  console.log(`Loaded:  TikTok=${counts.tiktok}  Pinterest=${counts.pinterest}  Instagram=${counts.instagram} items`);
  console.log(`Sending to ${MODEL} for analysis…\n`);

  const { text: contentBlock, total } = buildContentBlock(byPlatform);
  const client = new Anthropic();

  const stream = await client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content:
          'Analyze the following top-performing zero-waste kitchen content and return the JSON analysis.\n\n' +
          contentBlock,
      },
    ],
  });

  const message = await stream.finalMessage();
  const rawText = message.content[0]?.text || '';

  // Strip markdown code fences if present
  const jsonText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  let analysis;
  try {
    analysis = JSON.parse(jsonText);
  } catch (err) {
    console.error('Failed to parse Claude response as JSON:', err.message);
    console.error('Raw response:\n', rawText);
    process.exit(1);
  }

  const output = {
    analyzedAt: new Date().toISOString(),
    model: MODEL,
    totalItemsAnalyzed: total,
    byPlatform: counts,
    ...analysis,
  };

  mkdirSync(ANALYSIS_DIR, { recursive: true });
  const date = new Date().toISOString().split('T')[0];
  const outPath = join(ANALYSIS_DIR, `analysis_${date}.json`);
  writeFileSync(outPath, JSON.stringify(output, null, 2));

  const p = output.patterns ?? {};
  console.log('✓ Analysis complete');
  console.log(`  Viral formats found:      ${p.viralFormats?.length ?? 0}`);
  console.log(`  Hook patterns found:      ${p.hookPatterns?.length ?? 0}`);
  console.log(`  Engagement themes:        ${p.engagementThemes?.length ?? 0}`);
  console.log(`  Cross-platform insights:  ${p.crossPlatformInsights?.length ?? 0}`);
  console.log(`  Recommendations:          ${output.actionableRecommendations?.length ?? 0}`);
  console.log(`\n→ Saved to ${outPath}\n`);

  return output;
}

// Run when invoked directly: node analyzer/analyze.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
