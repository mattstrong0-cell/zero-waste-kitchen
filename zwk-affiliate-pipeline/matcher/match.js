/**
 * Product Matcher — Part 3 of the ZWK affiliate pipeline
 * Reads the latest pattern analysis from data/analysis/ and the product
 * inventory from data/products.json, then uses Claude to score every
 * product × format × platform combination and return a ranked production queue.
 *
 * Requires: ANTHROPIC_API_KEY in .env
 *
 * Run standalone: node matcher/match.js
 */

import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANALYSIS_DIR  = join(__dirname, '..', 'data', 'analysis');
const PRODUCTS_FILE = join(__dirname, '..', 'data', 'products.json');
const MATCHED_DIR   = join(__dirname, '..', 'data', 'matched');
const MODEL = 'claude-sonnet-4-6';

// Stable instructions — cached so repeat runs don't re-tokenize them.
const SYSTEM_PROMPT = `You are an affiliate content strategist for zerowaste-kitchen.com, an Amazon Associates site in the eco-kitchen niche.

Your task: score product-format-platform combinations and return a ranked production queue.

Scoring dimensions (each 1–10):
- commissionPotential: commission_rate × price midpoint, normalized. Higher-priced items with higher rates score higher. Max score ~10 = $100 item at 8% commission.
- viralFormatMatch: how naturally does this product demonstrate or benefit from this content format? Weight the product's visual appeal score. Consider demonstrability and "wow factor" for the format type.
- platformFit: how well does this product+format combo suit this specific platform's audience and content norms? (TikTok = short punchy video; Pinterest = static/idea pins with high save intent; Instagram = Reels + carousels)

totalScore: average of the three dimensions, rounded to 1 decimal place.

suggestedHook: platform-native opening line or opening shot description, specific to the product+format+platform combo.
suggestedCta: platform-appropriate call-to-action.

Return ONLY valid JSON (no markdown fences, no prose), with exactly this structure:
{
  "topOverall": [<exactly 15 entries, sorted by totalScore descending>],
  "topByPlatform": {
    "tiktok":    [<exactly 5 entries, sorted by totalScore descending>],
    "pinterest": [<exactly 5 entries, sorted by totalScore descending>],
    "instagram": [<exactly 5 entries, sorted by totalScore descending>]
  }
}

Each entry must have exactly these fields:
{
  "productCategory": "string",
  "productExample": "string — the most photogenic or demonstrable product from the category's examples list",
  "format": "string — the viral format name from the patterns",
  "platform": "tiktok" | "pinterest" | "instagram",
  "commissionPotential": number,
  "viralFormatMatch": number,
  "platformFit": number,
  "totalScore": number,
  "suggestedHook": "string",
  "suggestedCta": "string"
}`;

function findLatestAnalysis() {
  if (!existsSync(ANALYSIS_DIR)) return null;
  const files = readdirSync(ANALYSIS_DIR)
    .filter(f => f.startsWith('analysis_') && f.endsWith('.json'))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  return join(ANALYSIS_DIR, files[0]);
}

function loadProducts() {
  if (!existsSync(PRODUCTS_FILE)) return null;
  try {
    return JSON.parse(readFileSync(PRODUCTS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function extractPatternSummary(analysis) {
  const p = analysis.patterns ?? {};
  return {
    viralFormats:        p.viralFormats        ?? [],
    hookPatterns:        p.hookPatterns        ?? [],
    ctaPatterns:         p.ctaPatterns         ?? [],
    engagementThemes:    p.engagementThemes    ?? [],
    crossPlatformInsights: p.crossPlatformInsights ?? [],
    topKeywords:         p.topKeywords         ?? [],
  };
}

export async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set. Add it to .env (see .env.example).');
    process.exit(1);
  }

  const analysisPath = findLatestAnalysis();
  if (!analysisPath) {
    console.error(
      'Error: No analysis files found in data/analysis/.\n' +
      'Run the analyzer first:  node analyzer/analyze.js'
    );
    process.exit(1);
  }

  const products = loadProducts();
  if (!products || products.length === 0) {
    console.error('Error: data/products.json is missing or empty.');
    process.exit(1);
  }

  let analysis;
  try {
    analysis = JSON.parse(readFileSync(analysisPath, 'utf8'));
  } catch {
    console.error(`Error: Could not parse analysis file: ${analysisPath}`);
    process.exit(1);
  }

  const patterns = extractPatternSummary(analysis);
  if (patterns.viralFormats.length === 0) {
    console.error('Error: Analysis file contains no viral formats. Re-run the analyzer with more scraped data.');
    process.exit(1);
  }

  console.log('\nZero Waste Kitchen — Product Matcher');
  console.log(`Analysis:  ${analysisPath.split('/').pop()}`);
  console.log(`  ${patterns.viralFormats.length} viral formats  ·  ${patterns.engagementThemes.length} themes`);
  console.log(`Products:  ${products.length} categories`);
  const combos = products.length * patterns.viralFormats.length * 3;
  console.log(`Scoring:   ${combos} product × format × platform combinations\n`);
  console.log(`Sending to ${MODEL}…\n`);

  const userContent = [
    '## Viral patterns from latest analysis\n',
    JSON.stringify(patterns, null, 2),
    '\n\n## Product inventory\n',
    JSON.stringify(products, null, 2),
    '\n\nScore ALL combinations of the 13 product categories × viral formats × 3 platforms.',
    'Return the top 15 overall and top 5 per platform as specified in your instructions.',
  ].join('\n');

  const client = new Anthropic();

  const stream = await client.messages.stream({
    model: MODEL,
    max_tokens: 6000,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      { role: 'user', content: userContent },
    ],
  });

  const message = await stream.finalMessage();
  const rawText = message.content[0]?.text || '';
  const jsonText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  let matched;
  try {
    matched = JSON.parse(jsonText);
  } catch (err) {
    console.error('Failed to parse Claude response as JSON:', err.message);
    console.error('Raw response:\n', rawText);
    process.exit(1);
  }

  const output = {
    matchedAt: new Date().toISOString(),
    model: MODEL,
    sourceAnalysis: analysisPath.split('/').pop(),
    productCount: products.length,
    formatsEvaluated: patterns.viralFormats.length,
    combinationsScored: combos,
    ...matched,
  };

  mkdirSync(MATCHED_DIR, { recursive: true });
  const date = new Date().toISOString().split('T')[0];
  const outPath = join(MATCHED_DIR, `matched_${date}.json`);
  writeFileSync(outPath, JSON.stringify(output, null, 2));

  const top = output.topOverall ?? [];
  const byPlatform = output.topByPlatform ?? {};
  console.log('✓ Matching complete');
  console.log(`  Top 15 overall:`);
  top.slice(0, 5).forEach((c, i) =>
    console.log(`    ${i + 1}. [${c.totalScore}] ${c.productCategory} × ${c.format} (${c.platform})`)
  );
  if (top.length > 5) console.log(`    … and ${top.length - 5} more`);
  console.log(`  Top 5 per platform: TikTok=${byPlatform.tiktok?.length ?? 0}  Pinterest=${byPlatform.pinterest?.length ?? 0}  Instagram=${byPlatform.instagram?.length ?? 0}`);
  console.log(`\n→ Saved to ${outPath}\n`);

  return output;
}

// Run when invoked directly: node matcher/match.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
