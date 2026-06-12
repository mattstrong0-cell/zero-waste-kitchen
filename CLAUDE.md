# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Zero Waste Kitchen is a **static affiliate product review site** with no build system. Files are vanilla HTML/CSS/JS served directly — edit and push to deploy via Netlify. There is no npm, no bundler, no transpilation step.

## Deployment

- Hosted on Netlify (site ID: `a60c0c68-e9a5-40dd-8703-dfa6d7b071f3`)
- All 404s redirect to `index.html` via `_redirects` (Netlify SPA fallback)
- `sitemap.xml` and `robots.txt` are manually maintained — update `sitemap.xml` when adding new product pages
- Large product videos (`videos/product_vid_*.mp4`) are gitignored; they will be served via CDN

## Architecture

### Data Flow

```
js/product-data.js  →  js/recommendations.js  →  DOM (recommendation cards)
       ↓                                                    ↓
  (ZWK_PRODUCTS)                                    js/tracker.js
                                                           ↓
                                                    localStorage
                                                    (eco_luxury_metrics)
                                                           ↓
                                                    js/dashboard.js
```

### JavaScript Modules

| File | Role |
|------|------|
| `js/product-data.js` | Single source of truth — the `ZWK_PRODUCTS` array |
| `js/recommendations.js` | Filters products, runs A/B test, renders recommendation cards |
| `js/tracker.js` | Writes analytics events to `localStorage` under key `eco_luxury_metrics` |
| `js/dashboard.js` | Reads `eco_luxury_metrics`, renders Canvas-based charts |
| `js/main.js` | Global behaviors: mobile hamburger menu, image gallery tabs, smooth scroll |

### Product Data Schema (`ZWK_PRODUCTS` entry)

```js
{
  id: "swedish-dishcloths",        // matches HTML filename (e.g. swedish-dishcloths.html)
  name, slug, category, tagline, description,
  priceRange, rating, reviewCount,
  material, aestheticTier,         // "luxury" | "everyday-essential" | etc.
  sustainabilityProfile,
  amazonUrl,                       // affiliate tag: zerowasteki07-20
  image,                           // hero image path (images/)
  aiImage,                         // AI-generated product image (images/ai_*.jpg)
  tags                             // string[]
}
```

### A/B Testing

`recommendations.js` assigns variants via `sessionStorage`. Variant A sorts recommendations by `rating`; Variant B sorts by `reviewCount`. The assignment event is logged to `tracker.js` as `ab_variant_assigned`.

### Analytics (client-side only)

No external analytics services. All events are stored in `localStorage['eco_luxury_metrics']` and read only by `dashboard.html` (which is marked `noindex, nofollow`). Event types: `recommendation_impression`, `affiliate_click`, `product_page_view`, `journey_step`, `ab_variant_assigned`.

## Adding a New Product

1. Add an entry to `ZWK_PRODUCTS` in `js/product-data.js`
2. Create a new `<slug>.html` page (copy an existing product page as a template)
3. Set `data-product-id="<id>"` on the `<body>` tag of the new page
4. Add images to `images/` following existing naming conventions
5. Add the new URL to `sitemap.xml`

## CSS Conventions

Design tokens are defined in `:root` at the top of `css/style.css`:

```css
--green-dark: #2c5e3b
--green-mid:  #4a7c59
--green-light: #7aad8a
--orange:     #e67e22
--earth-tan:  #c4a882
```

Typography uses Google Fonts: **Playfair Display** (headings) and **Inter** (body). Fluid type scaling uses `clamp()`. Layout is mobile-first with CSS Grid and Flexbox.
