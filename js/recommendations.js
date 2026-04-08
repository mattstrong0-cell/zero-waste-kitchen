/**
 * recommendations.js
 * Zero Waste Kitchen — Product Recommendation Engine
 *
 * Renders contextual product recommendations on each product page.
 * Supports three recommendation categories:
 *   - "Complete Your Luxury Kitchen"
 *   - "Sustainable Essentials"
 *   - "Premium Eco-Conscious Pairings"
 *
 * Integrates with ZWKTracker for impression and click tracking.
 * A/B tests recommendation ordering (variant A = by rating, variant B = by review count).
 */

(function () {
  'use strict';

  // ─── A/B Variant Assignment ─────────────────────────────────────────────────
  // Assign variant once per session; persist in sessionStorage
  function getABVariant() {
    try {
      const stored = sessionStorage.getItem('zwk_ab_variant');
      if (stored) return stored;
      const variant = Math.random() < 0.5 ? 'A' : 'B';
      sessionStorage.setItem('zwk_ab_variant', variant);
      // Track variant assignment
      if (window.ZWKTracker) {
        ZWKTracker.trackEvent(ZWKTracker.EVENT_TYPES.AB_VARIANT, { variant });
      }
      return variant;
    } catch (e) {
      return 'A';
    }
  }

  // ─── Recommendation Categories ──────────────────────────────────────────────
  const CATEGORIES = {
    LUXURY: 'Complete Your Luxury Kitchen',
    ESSENTIALS: 'Sustainable Essentials',
    PAIRINGS: 'Premium Eco-Conscious Pairings'
  };

  // Category assignment rules based on product attributes
  function assignCategory(product) {
    if (product.aestheticTier === 'luxury') return CATEGORIES.LUXURY;
    if (product.aestheticTier === 'premium') return CATEGORIES.PAIRINGS;
    return CATEGORIES.ESSENTIALS;
  }

  // ─── Recommendation Logic ───────────────────────────────────────────────────

  /**
   * Gets recommended products for a given product page.
   * Excludes the current product and returns 4 recommendations.
   * @param {string} currentProductId
   * @param {string} variant - A/B variant ('A' or 'B')
   * @returns {Array} recommended products with category assigned
   */
  function getRecommendations(currentProductId, variant) {
    if (!window.ZWK_PRODUCTS || !Array.isArray(ZWK_PRODUCTS)) {
      console.warn('[ZWK Recommendations] ZWK_PRODUCTS not loaded.');
      return [];
    }

    let pool = ZWK_PRODUCTS.filter(p => p.id !== currentProductId);

    // A/B variant: sort by rating (A) or review count (B)
    if (variant === 'B') {
      pool = pool.sort((a, b) => {
        const aCount = parseInt((a.reviewCount || '0').replace(/[^0-9]/g, ''), 10);
        const bCount = parseInt((b.reviewCount || '0').replace(/[^0-9]/g, ''), 10);
        return bCount - aCount;
      });
    } else {
      pool = pool.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    // Take top 4 and assign recommendation categories
    return pool.slice(0, 4).map(product => ({
      ...product,
      recommendationCategory: assignCategory(product)
    }));
  }

  // ─── DOM Rendering ──────────────────────────────────────────────────────────

  /**
   * Renders a recommendation tile card.
   * @param {Object} product
   * @returns {HTMLElement}
   */
  function renderTile(product) {
    const card = document.createElement('div');
    card.className = 'rec-card';
    card.setAttribute('data-product-id', product.id);
    card.setAttribute('data-rec-category', product.recommendationCategory);

    card.innerHTML = `
      <div class="rec-card-badge">${product.recommendationCategory}</div>
      <img
        src="${product.aiImage || product.image}"
        alt="${product.name} — eco-friendly zero waste kitchen product"
        class="rec-card-img"
        loading="lazy"
        width="220"
        height="160"
      />
      <div class="rec-card-body">
        <span class="rec-card-category">${product.category}</span>
        <h3 class="rec-card-name">${product.name}</h3>
        <p class="rec-card-price">${product.priceRange}</p>
        <a
          href="${product.amazonUrl}"
          class="rec-card-btn btn-amazon"
          target="_blank"
          rel="noopener noreferrer sponsored"
          data-product-id="${product.id}"
          data-link-type="amazon"
          data-rec-category="${product.recommendationCategory}"
          aria-label="Check price for ${product.name} on Amazon"
        >
          🛒 Check Price on Amazon
        </a>
        <a
          href="${product.slug}.html"
          class="rec-card-review"
          data-product-id="${product.id}"
          aria-label="Read full review of ${product.name}"
        >
          Read Review →
        </a>
      </div>
    `;

    return card;
  }

  /**
   * Renders the full recommendations section into a target container.
   * @param {string} containerId - ID of the DOM element to render into
   * @param {string} currentProductId - ID of the current product page
   */
  function renderRecommendations(containerId, currentProductId) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn('[ZWK Recommendations] Container not found:', containerId);
      return;
    }

    const variant = getABVariant();
    const recommendations = getRecommendations(currentProductId, variant);

    if (recommendations.length === 0) {
      container.style.display = 'none';
      return;
    }

    // Build section wrapper
    const section = document.createElement('section');
    section.className = 'recommendations-section';
    section.setAttribute('aria-label', 'Recommended eco-friendly products');

    const heading = document.createElement('h2');
    heading.className = 'rec-heading';
    heading.textContent = 'You Might Also Love';
    section.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'rec-grid';
    section.appendChild(grid);

    recommendations.forEach(product => {
      const tile = renderTile(product);
      grid.appendChild(tile);

      // ── TRACKER INTEGRATION: Track impression ──────────────────────────────
      if (window.ZWKTracker) {
        ZWKTracker.trackEvent(ZWKTracker.EVENT_TYPES.IMPRESSION, {
          productId: product.id,
          category: product.recommendationCategory
        });
      }
      // ──────────────────────────────────────────────────────────────────────
    });

    container.appendChild(section);

    // ── TRACKER INTEGRATION: Track affiliate clicks ─────────────────────────
    section.querySelectorAll('a[data-link-type]').forEach(link => {
      link.addEventListener('click', function () {
        const pid = this.getAttribute('data-product-id');
        const linkType = this.getAttribute('data-link-type');
        const recCategory = this.getAttribute('data-rec-category');
        const product = (window.ZWK_PRODUCTS || []).find(p => p.id === pid);

        if (window.ZWKTracker && product) {
          ZWKTracker.trackEvent(ZWKTracker.EVENT_TYPES.CLICK, {
            productId: pid,
            linkType: linkType,
            category: recCategory,
            material: product.material,
            aestheticTier: product.aestheticTier,
            sustainabilityProfile: product.sustainabilityProfile
          });
        }

        // Web Audio API click feedback (subtle eco-chime)
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.2);
        } catch (e) { /* Audio not available — silent fail */ }
      });
    });
    // ──────────────────────────────────────────────────────────────────────────

    // ── TRACKER INTEGRATION: Track review link clicks as journey steps ───────
    section.querySelectorAll('a.rec-card-review').forEach(link => {
      link.addEventListener('click', function () {
        const pid = this.getAttribute('data-product-id');
        if (window.ZWKTracker) {
          ZWKTracker.trackEvent(ZWKTracker.EVENT_TYPES.JOURNEY_STEP, {
            productId: pid,
            stepIndex: (JSON.parse(sessionStorage.getItem('eco_luxury_session') || '{}').journey || []).length
          });
        }
      });
    });
    // ──────────────────────────────────────────────────────────────────────────
  }

  // ─── Auto-Initialize ────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    // Read current product ID from body data attribute
    const productId = document.body.getAttribute('data-product-id');
    if (productId) {
      renderRecommendations('recommendations-container', productId);
    }
  });

  // Expose for manual initialization
  window.ZWKRecommendations = { renderRecommendations, getRecommendations, CATEGORIES };

}());
