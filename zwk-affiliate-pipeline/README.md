# ZWK Affiliate Pipeline

Four-step automation that turns trending social content into a ready-to-film production queue for zerowaste-kitchen.com Amazon Associates affiliate content.

```
Scraper → Analyzer → Matcher → Production queue
(Part 1)   (Part 2)   (Part 3)   (Part 4 ties it together)
```

---

## Quick start — run the full pipeline

```bash
cd zwk-affiliate-pipeline
cp .env.example .env       # fill in your keys (see Credentials below)
npm install
node run-pipeline.js       # scrape → analyze → match in one shot
```

The production queue lands in `data/matched/matched_YYYY-MM-DD.json`.

---

## Project structure

```
zwk-affiliate-pipeline/
├── scraper/
│   ├── tiktok.js          Part 1 — TikTok Creative Center (Firecrawl)
│   ├── pinterest.js       Part 1 — Pinterest API
│   ├── instagram.js       Part 1 — Instagram hashtags (Firecrawl + session cookie)
│   └── index.js           Part 1 — runs all 3 scrapers sequentially
├── analyzer/
│   └── analyze.js         Part 2 — Claude API pattern analysis
├── matcher/
│   └── match.js           Part 3 — Claude API product × format scoring
├── data/
│   ├── scraped/           Part 1 output — timestamped JSON per platform
│   ├── analysis/          Part 2 output — timestamped analysis JSON
│   ├── matched/           Part 3 output — timestamped production queue JSON
│   └── products.json      Product inventory — edit to add/update products
├── automation/
│   ├── n8n-workflow.json  Importable n8n workflow (weekly cron)
│   └── airtable-schema.json  Airtable base schema + sample data
├── run-pipeline.js        Part 4 — full pipeline runner
├── .env.example
├── package.json
└── README.md
```

---

## Part 1: Content Scraper

Scrapes trending eco-kitchen content from TikTok, Pinterest, and Instagram. Output lands in `data/scraped/` as timestamped JSON files.

### Run

```bash
node scraper/index.js          # all 3 platforms
node scraper/tiktok.js         # TikTok only
node scraper/pinterest.js      # Pinterest only
node scraper/instagram.js      # Instagram only
```

### How it works

| Platform  | Source | Method |
|---|---|---|
| TikTok | TikTok Creative Center (public) | Firecrawl + LLM extraction |
| Pinterest | Pinterest v5 API | Direct API call (no Firecrawl credits) |
| Instagram | Hashtag explore pages | Firecrawl + session cookie auth |

Each scraper reads all previous `platform_*.json` files on startup and skips already-seen URLs. Run as often as you like — you'll only get net-new content.

### Output files

```
data/scraped/tiktok_YYYY-MM-DD.json
data/scraped/pinterest_YYYY-MM-DD.json
data/scraped/instagram_YYYY-MM-DD.json
```

### Hashtags and queries scraped

| Platform | Targets |
|---|---|
| TikTok | `#zerowaste`, `#ecokitchen`, `#sustainableswaps`, `#kitchenhacks`, `#plasticfree` |
| Pinterest | `zero waste kitchen`, `eco friendly kitchen`, `sustainable kitchen swaps`, `plastic free kitchen`, `zero waste cooking` |
| Instagram | `#zerowastekitchen`, `#ecofriendlykitchen`, `#sustainablekitchen` |

### TikTok output schema

```json
{
  "platform": "tiktok",
  "url": "https://www.tiktok.com/@user/video/123",
  "caption": "Switch to these zero waste swaps! 🌿",
  "hashtags": ["zerowaste", "ecokitchen"],
  "viewCount": 1200000,
  "likeCount": 45000,
  "duration": "0:15",
  "datePosted": "2026-05-01",
  "sourceHashtag": "#zerowaste",
  "hashtagStats": { "postCount": 2800000, "totalViews": 14000000000 },
  "scrapedAt": "2026-05-10T12:00:00.000Z"
}
```

### Pinterest output schema

```json
{
  "platform": "pinterest",
  "url": "https://www.pinterest.com/pin/123456/",
  "title": "10 Zero Waste Kitchen Swaps",
  "description": "Easy swaps to reduce plastic in your kitchen...",
  "keywords": ["reusable", "beeswax", "compostable"],
  "pinType": "static",
  "repinCount": 3200,
  "datePosted": "2026-04-15T00:00:00.000Z",
  "imageUrl": "https://i.pinimg.com/600x/...",
  "sourceQuery": "zero waste kitchen",
  "scrapedAt": "2026-05-10T12:00:00.000Z"
}
```

`pinType`: `static`, `video`, `idea pin`

### Instagram output schema

```json
{
  "platform": "instagram",
  "url": "https://www.instagram.com/p/ABC123/",
  "caption": "My top 5 plastic-free kitchen essentials 🌱",
  "hashtags": ["zerowastekitchen", "sustainableliving"],
  "likeCount": 8400,
  "commentCount": 92,
  "format": "Reel",
  "datePosted": "2026-05-03",
  "sourceHashtag": "#zerowastekitchen",
  "scrapedAt": "2026-05-10T12:00:00.000Z"
}
```

`format`: `Reel`, `carousel`, `single`, `video`

---

## Part 2: Pattern Analyzer

Reads the scraped JSON, selects the top 50 items per platform by engagement, and sends them to Claude in a single cached API call to extract viral content patterns.

### Run

```bash
node analyzer/analyze.js
```

### How it works

1. Loads all `data/scraped/*.json`, deduplicates by URL
2. Ranks by weighted engagement score:
   - TikTok: `views × 0.1 + likes`
   - Pinterest: `repins × 10`
   - Instagram: `likes + comments × 5`
3. Takes the top 50 per platform, sends to `claude-sonnet-4-6`
4. System prompt is cached — repeat runs on the same day cost fewer tokens

### Output

```
data/analysis/analysis_YYYY-MM-DD.json
```

Key fields in the output:
- `patterns.viralFormats` — top content structures with confidence ratings
- `patterns.hookPatterns` — opening lines/shots for high-performing posts
- `patterns.ctaPatterns` — call-to-action styles
- `patterns.engagementThemes` — eco topics with the most engagement
- `patterns.crossPlatformInsights` — signals appearing on 2+ platforms (highest confidence)
- `patterns.topKeywords` — recurring words in high-engagement content
- `actionableRecommendations` — prioritized list of what to create next

---

## Part 3: Product Matcher

Reads the latest analysis and the product inventory, scores every product × viral format × platform combination with Claude, and returns a ranked production queue.

### Run

```bash
node matcher/match.js
```

### How it works

1. Finds the most recent `data/analysis/analysis_*.json`
2. Loads `data/products.json` (13 categories)
3. Sends products + patterns to `claude-sonnet-4-6`
4. Claude scores all ~195 combinations on three 1–10 dimensions:
   - `commissionPotential` — commission rate × price midpoint
   - `viralFormatMatch` — how naturally the product demonstrates this format
   - `platformFit` — how well the combo suits the platform's audience
5. Returns the top 15 overall + top 5 per platform, each with a suggested hook and CTA

### Output

```
data/matched/matched_YYYY-MM-DD.json
```

Each entry in the production queue:

```json
{
  "productCategory": "Beeswax Wraps",
  "productExample": "Bee's Wrap Assorted 3-Pack (S/M/L)",
  "format": "ASMR wrapping",
  "platform": "tiktok",
  "commissionPotential": 7,
  "viralFormatMatch": 10,
  "platformFit": 10,
  "totalScore": 9.0,
  "suggestedHook": "The most satisfying plastic-free kitchen swap 🌿 [close-up ASMR wrap shot]",
  "suggestedCta": "Link in bio — grab the set I use!"
}
```

### Updating the product inventory

Edit `data/products.json`. Each entry:

| Field | Description |
|---|---|
| `category` | Display name |
| `examples` | 3–5 specific product names (Amazon search-ready) |
| `priceRange` | `{ "min": N, "max": N }` in USD |
| `commissionRate` | Amazon Associates rate as a decimal (`0.04` = 4%) |
| `visualAppealScore` | 1–5 — how photogenic/demonstrable this category is |
| `bestFormats` | Hints to guide the matcher (freeform strings) |

---

## Part 4: Pipeline Runner

### Run the full pipeline

```bash
node run-pipeline.js
```

Runs scraper → analyzer → matcher in sequence. If a step fails, downstream steps are skipped (they depend on the previous output). Prints a summary table at the end.

### Run individual steps

```bash
npm run scrape     # Part 1 only
npm run analyze    # Part 2 only
npm run match      # Part 3 only
```

---

## Automation with n8n

### Import the workflow

1. Open your n8n instance
2. **Settings → Workflows → Import from file**
3. Select `automation/n8n-workflow.json`
4. Set the required environment variables in n8n's settings (see below)
5. Activate the workflow

### Required n8n environment variables

| Variable | Description |
|---|---|
| `PIPELINE_DIR` | Absolute path to `zwk-affiliate-pipeline/` on the n8n server. Example: `/home/ubuntu/zero-waste-kitchen/zwk-affiliate-pipeline` |
| `WEBHOOK_SUCCESS_URL` | (Optional) Slack/Discord incoming webhook URL for success notifications |
| `WEBHOOK_FAILURE_URL` | (Optional) Slack/Discord incoming webhook URL for failure alerts |

The workflow runs `node run-pipeline.js` from `PIPELINE_DIR` every Monday at 9am.

### First-time server setup

```bash
# On your n8n server:
cd $PIPELINE_DIR
npm install
cp .env.example .env
# Edit .env with your API keys, then activate the n8n workflow
```

### Workflow structure

```
Every Monday 9am → Run Pipeline → Check exit code
                                       ├── 0 (success) → Notify Success
                                       └── non-0 (fail) → Notify Failure
```

---

## Airtable integration

`automation/airtable-schema.json` describes three tables for tracking the pipeline in Airtable:

| Table | Purpose |
|---|---|
| **Scraped Content** | Log raw scraped posts |
| **Analysis** | One row per viral pattern extracted by the analyzer |
| **Production Queue** | One row per content combo — track status from `queued` → `published` |

Create the base manually in Airtable using the field definitions in the schema file. Paste rows from `matched_*.json` into the Production Queue table and update `Status` as you film and publish each piece.

---

## Credentials setup

### Firecrawl (required for TikTok + Instagram)

1. Sign up at [firecrawl.dev](https://firecrawl.dev)
2. Copy your API key → `FIRECRAWL_API_KEY` in `.env`

**Free tier:** 500 credits. TikTok scrapes ~5 credits/run, Instagram ~9 credits/run. Running both daily uses ~14 credits/day (~35 days on the free tier).

### Pinterest API (required for Pinterest)

1. Create a [Pinterest Business account](https://pinterest.com/business/create)
2. Go to [developers.pinterest.com/apps](https://developers.pinterest.com/apps/) → **Create app**
3. Request scopes: `boards:read`, `pins:read`
4. Generate an access token → `PINTEREST_ACCESS_TOKEN` in `.env`

No Firecrawl credits consumed.

### Instagram session cookie (required for Instagram)

1. Log into [instagram.com](https://instagram.com) in Chrome or Firefox
2. Open DevTools (`F12`) → **Application** → **Cookies** → `https://www.instagram.com`
3. Copy the value of the `sessionid` cookie → `INSTAGRAM_SESSION_ID` in `.env`

Cookies expire every ~90 days. Refresh when the scraper returns 0 results.

### Anthropic API (required for Parts 2 and 3)

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Create an API key → `ANTHROPIC_API_KEY` in `.env`

Both the analyzer and matcher use prompt caching — repeat runs on the same day cost fewer tokens than the first run.

---

## Configuration reference

| Variable | Default | Description |
|---|---|---|
| `FIRECRAWL_API_KEY` | required | Firecrawl API key |
| `INSTAGRAM_SESSION_ID` | required for IG | Browser session cookie |
| `PINTEREST_ACCESS_TOKEN` | required for Pinterest | Pinterest OAuth token |
| `ANTHROPIC_API_KEY` | required for Parts 2 & 3 | Anthropic API key |
| `SCRAPE_LIMIT` | `25` | Max items per hashtag/keyword per scraper run |
| `ANALYZE_LIMIT` | `50` | Top-N items per platform sent to the analyzer |

---

## What to do with the production queue

1. Open `data/matched/matched_YYYY-MM-DD.json` (or the Airtable Production Queue)
2. Sort by `totalScore` descending — the top entries are your highest-ROI content to film
3. For each combo, take `suggestedHook` + `suggestedCta` to Claude.ai and ask it to write a full platform-native script
4. Film the video using the hook as your opening shot or first line
5. For TikTok/Instagram Reels: use Higgsfield AI to generate or enhance the video with the script
6. Add your Amazon Associates tracking link in the caption or bio
7. Update `Status` in Airtable: `queued → in-progress → done → published`
