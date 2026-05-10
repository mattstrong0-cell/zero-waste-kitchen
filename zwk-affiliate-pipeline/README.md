# ZWK Affiliate Pipeline — Part 1: Content Scraper

Scrapes trending eco-kitchen content from TikTok, Pinterest, and Instagram to surface
viral patterns for the zerowaste-kitchen.com Amazon Associates affiliate site.

## Quick start

```bash
cd zwk-affiliate-pipeline
cp .env.example .env       # fill in your keys (see Credentials section below)
npm install
node scraper/index.js      # run all 3 scrapers
```

Run a single scraper:
```bash
node scraper/tiktok.js
node scraper/pinterest.js
node scraper/instagram.js
```

Output lands in `data/scraped/` as timestamped JSON:
```
data/scraped/tiktok_2026-05-10.json
data/scraped/pinterest_2026-05-10.json
data/scraped/instagram_2026-05-10.json
```

---

## Credentials setup

### Firecrawl (required for TikTok + Instagram)

1. Sign up at [firecrawl.dev](https://firecrawl.dev)
2. Copy your API key → `FIRECRAWL_API_KEY` in `.env`

**Free tier note:** 500 credits. TikTok scrapes 5 hashtags (~5 credits). Instagram scrapes
3 hashtags (~9 credits, more with scroll actions). Running both daily uses ~14 credits/day,
so the free tier lasts ~35 days before needing an upgrade.

### Pinterest API (required for Pinterest)

1. Create a [Pinterest Business account](https://pinterest.com/business/create)
2. Go to [developers.pinterest.com/apps](https://developers.pinterest.com/apps/) → **Create app**
3. Request scopes: `boards:read`, `pins:read`
4. Generate an access token → `PINTEREST_ACCESS_TOKEN` in `.env`

Pinterest scraper uses the API directly — no Firecrawl credits consumed.

### Instagram session cookie (required for Instagram)

Instagram blocks unauthenticated scrapers. You need a session cookie from a logged-in browser:

1. Log into [instagram.com](https://instagram.com) in Chrome or Firefox
2. Open DevTools (`F12`) → **Application** → **Cookies** → `https://www.instagram.com`
3. Copy the value of the `sessionid` cookie → `INSTAGRAM_SESSION_ID` in `.env`

Cookies expire every ~90 days. If the Instagram scraper returns 0 results, refresh this value.

---

## Output schema

### TikTok (`tiktok_YYYY-MM-DD.json`)

```json
[
  {
    "platform": "tiktok",
    "url": "https://www.tiktok.com/@user/video/123",
    "caption": "Switch to these zero waste swaps! 🌿",
    "hashtags": ["zerowaste", "ecokitchen", "sustainableliving"],
    "viewCount": 1200000,
    "likeCount": 45000,
    "duration": "0:15",
    "datePosted": "2026-05-01",
    "sourceHashtag": "#zerowaste",
    "hashtagStats": { "postCount": 2800000, "totalViews": 14000000000 },
    "scrapedAt": "2026-05-10T12:00:00.000Z"
  }
]
```

### Pinterest (`pinterest_YYYY-MM-DD.json`)

```json
[
  {
    "platform": "pinterest",
    "url": "https://www.pinterest.com/pin/123456/",
    "title": "10 Zero Waste Kitchen Swaps",
    "description": "Easy swaps to reduce plastic in your kitchen...",
    "keywords": ["reusable", "beeswax", "compostable", "sustainable"],
    "pinType": "static",
    "repinCount": 3200,
    "datePosted": "2026-04-15T00:00:00.000Z",
    "imageUrl": "https://i.pinimg.com/600x/...",
    "sourceQuery": "zero waste kitchen",
    "scrapedAt": "2026-05-10T12:00:00.000Z"
  }
]
```

`pinType` values: `static`, `video`, `idea pin`

### Instagram (`instagram_YYYY-MM-DD.json`)

```json
[
  {
    "platform": "instagram",
    "url": "https://www.instagram.com/p/ABC123/",
    "caption": "My top 5 plastic-free kitchen essentials 🌱",
    "hashtags": ["zerowastekitchen", "sustainableliving", "ecofriendly"],
    "likeCount": 8400,
    "commentCount": 92,
    "format": "Reel",
    "datePosted": "2026-05-03",
    "sourceHashtag": "#zerowastekitchen",
    "scrapedAt": "2026-05-10T12:00:00.000Z"
  }
]
```

`format` values: `Reel`, `carousel`, `single`, `video`

---

## Deduplication

Each scraper reads all previous `platform_*.json` files on startup and skips any URL
already seen. Run as often as you like — you'll only get net-new content.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `FIRECRAWL_API_KEY` | required | Firecrawl API key |
| `INSTAGRAM_SESSION_ID` | required for IG | Browser session cookie |
| `PINTEREST_ACCESS_TOKEN` | required for Pinterest | Pinterest OAuth token |
| `SCRAPE_LIMIT` | `25` | Max items per hashtag/keyword per run |

---

## Project structure

```
zwk-affiliate-pipeline/
├── scraper/
│   ├── tiktok.js       — TikTok Creative Center (Firecrawl)
│   ├── pinterest.js    — Pinterest search (Pinterest API)
│   ├── instagram.js    — Instagram hashtags (Firecrawl + session cookie)
│   └── index.js        — runs all 3 sequentially
├── data/
│   └── scraped/        — timestamped JSON output
├── .env.example
├── package.json
└── README.md
```
