/**
 * dashboard.js
 * Zero Waste Kitchen — Analytics Dashboard
 *
 * Reads from localStorage (eco_luxury_metrics), aggregates data,
 * and renders all charts and panels using Canvas (no external libraries).
 *
 * Charts:
 *   1. Conversion rate by recommendation category (bar chart)
 *   2. Most-clicked products (horizontal bar chart)
 *   3. User journey visualization (sequential path flow)
 *   4. Attribute combination performance (grouped breakdown)
 *   5. A/B test insights panel (side-by-side comparison)
 */

(function () {
  'use strict';

  // ─── Design Tokens (match CSS variables) ───────────────────────────────────
  const COLORS = {
    primary: '#2D5016',
    primaryLight: '#4a7c2f',
    accent: '#FF9900',
    accentLight: '#ffb84d',
    earth1: '#8B6914',
    earth2: '#C4956A',
    earth3: '#E8D5B7',
    bg: '#FAFAF7',
    surface: '#FFFFFF',
    text: '#1a1a1a',
    textMuted: '#666',
    border: '#E0D8CC',
    green1: '#3d7a1f',
    green2: '#6aaa3a',
    green3: '#a8d878'
  };

  const FONT = '14px "Segoe UI", system-ui, sans-serif';
  const FONT_BOLD = 'bold 14px "Segoe UI", system-ui, sans-serif';
  const FONT_SMALL = '12px "Segoe UI", system-ui, sans-serif';

  // ─── Data Loading ───────────────────────────────────────────────────────────

  /**
   * Loads and validates the metrics store from localStorage.
   * @returns {Object} metrics store or default empty store
   */
  function loadMetrics() {
    try {
      const raw = localStorage.getItem('eco_luxury_metrics');
      if (!raw) return getEmptyMetrics();
      const data = JSON.parse(raw);
      if (typeof data !== 'object' || Array.isArray(data)) return getEmptyMetrics();
      return data;
    } catch (e) {
      console.warn('[ZWK Dashboard] Failed to load metrics:', e.message);
      return getEmptyMetrics();
    }
  }

  function getEmptyMetrics() {
    return { totalSessions: 0, totalClicks: 0, totalImpressions: 0, events: [], categoryStats: {}, productStats: {}, journeys: [], abVariants: {} };
  }

  // ─── Summary Strip ──────────────────────────────────────────────────────────

  /**
   * Renders the top summary strip with key metrics.
   * @param {Object} metrics
   */
  function renderSummaryStrip(metrics) {
    const el = document.getElementById('summary-strip');
    if (!el) return;

    const convRate = metrics.totalImpressions > 0
      ? ((metrics.totalClicks / metrics.totalImpressions) * 100).toFixed(1)
      : '0.0';

    // Find top category
    let topCat = '—';
    let topCatClicks = 0;
    Object.entries(metrics.categoryStats || {}).forEach(([cat, stats]) => {
      if ((stats.clicks || 0) > topCatClicks) { topCatClicks = stats.clicks; topCat = cat; }
    });

    el.innerHTML = `
      <div class="summary-card" aria-label="Total sessions tracked: ${metrics.totalSessions}">
        <span class="summary-value">${metrics.totalSessions}</span>
        <span class="summary-label">Sessions Tracked</span>
      </div>
      <div class="summary-card" aria-label="Total affiliate clicks: ${metrics.totalClicks}">
        <span class="summary-value">${metrics.totalClicks}</span>
        <span class="summary-label">Affiliate Clicks</span>
      </div>
      <div class="summary-card" aria-label="Overall conversion rate: ${convRate}%">
        <span class="summary-value">${convRate}%</span>
        <span class="summary-label">Conversion Rate</span>
      </div>
      <div class="summary-card summary-card--accent" aria-label="Top performing category: ${topCat}">
        <span class="summary-value summary-value--small">🏆</span>
        <span class="summary-label">Top Category</span>
        <span class="summary-badge">${topCat}</span>
      </div>
    `;
  }

  // ─── Chart 1: Conversion Rate by Category (Bar Chart) ──────────────────────

  /**
   * Renders a bar chart of conversion rates by recommendation category.
   * @param {Object} metrics
   */
  function renderCategoryChart(metrics) {
    const canvas = document.getElementById('chart-categories');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const stats = metrics.categoryStats || {};

    const labels = Object.keys(stats);
    const values = labels.map(cat => {
      const s = stats[cat];
      return s.impressions > 0 ? parseFloat(((s.clicks / s.impressions) * 100).toFixed(1)) : 0;
    });

    if (labels.length === 0) { renderEmptyState(ctx, canvas, 'No category data yet'); return; }

    const W = canvas.width, H = canvas.height;
    const pad = { top: 30, right: 20, bottom: 60, left: 55 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;
    const maxVal = Math.max(...values, 1);
    const barW = Math.min(60, (chartW / labels.length) * 0.6);
    const gap = chartW / labels.length;

    ctx.clearRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = pad.top + chartH - (i / 5) * chartH;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + chartW, y); ctx.stroke();
      ctx.fillStyle = COLORS.textMuted; ctx.font = FONT_SMALL; ctx.textAlign = 'right';
      ctx.fillText((i / 5 * maxVal).toFixed(1) + '%', pad.left - 6, y + 4);
    }

    // Bars
    labels.forEach((label, i) => {
      const x = pad.left + i * gap + gap / 2 - barW / 2;
      const barH = (values[i] / maxVal) * chartH;
      const y = pad.top + chartH - barH;

      // Bar fill
      const isTop = values[i] === Math.max(...values);
      ctx.fillStyle = isTop ? COLORS.accent : COLORS.primaryLight;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]) : ctx.rect(x, y, barW, barH);
      ctx.fill();

      // Value label
      ctx.fillStyle = COLORS.text; ctx.font = FONT_BOLD; ctx.textAlign = 'center';
      ctx.fillText(values[i] + '%', x + barW / 2, y - 6);

      // X label (wrap long text)
      ctx.fillStyle = COLORS.textMuted; ctx.font = FONT_SMALL;
      const words = label.split(' ');
      let line = '', lineY = pad.top + chartH + 18;
      words.forEach((word, wi) => {
        const test = line + (line ? ' ' : '') + word;
        if (ctx.measureText(test).width > gap - 4 && line) {
          ctx.fillText(line, x + barW / 2, lineY); line = word; lineY += 14;
        } else { line = test; }
        if (wi === words.length - 1) ctx.fillText(line, x + barW / 2, lineY);
      });
    });

    // Axis
    ctx.strokeStyle = COLORS.border; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pad.left, pad.top); ctx.lineTo(pad.left, pad.top + chartH); ctx.lineTo(pad.left + chartW, pad.top + chartH); ctx.stroke();
  }

  // ─── Chart 2: Most-Clicked Products (Horizontal Bar Chart) ─────────────────

  /**
   * Renders a horizontal bar chart of most-clicked products.
   * @param {Object} metrics
   */
  function renderProductChart(metrics) {
    const canvas = document.getElementById('chart-products');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const stats = metrics.productStats || {};

    const entries = Object.entries(stats)
      .map(([id, s]) => ({ id, clicks: s.clicks || 0 }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 8);

    if (entries.length === 0) { renderEmptyState(ctx, canvas, 'No product click data yet'); return; }

    const W = canvas.width, H = canvas.height;
    const pad = { top: 20, right: 60, bottom: 20, left: 180 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;
    const barH = Math.min(28, chartH / entries.length - 6);
    const maxVal = Math.max(...entries.map(e => e.clicks), 1);

    ctx.clearRect(0, 0, W, H);

    entries.forEach((entry, i) => {
      const y = pad.top + i * (chartH / entries.length) + (chartH / entries.length - barH) / 2;
      const barW = (entry.clicks / maxVal) * chartW;
      const isTop = i === 0;

      // Label
      ctx.fillStyle = COLORS.text; ctx.font = FONT; ctx.textAlign = 'right';
      const label = entry.id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).slice(0, 22);
      ctx.fillText(label, pad.left - 8, y + barH / 2 + 4);

      // Bar
      ctx.fillStyle = isTop ? COLORS.accent : COLORS.green2;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(pad.left, y, barW, barH, 4) : ctx.rect(pad.left, y, barW, barH);
      ctx.fill();

      // Value
      ctx.fillStyle = COLORS.text; ctx.font = FONT_BOLD; ctx.textAlign = 'left';
      ctx.fillText(entry.clicks, pad.left + barW + 6, y + barH / 2 + 4);
    });
  }

  // ─── Chart 3: User Journey Visualization ───────────────────────────────────

  /**
   * Renders a sequential path flow showing common user journeys before conversion.
   * @param {Object} metrics
   */
  function renderJourneyChart(metrics) {
    const container = document.getElementById('chart-journey');
    if (!container) return;
    const journeys = metrics.journeys || [];

    if (journeys.length === 0) {
      container.innerHTML = '<p class="empty-state" aria-label="No journey data yet">No journey data yet — visit product pages and click affiliate links to generate data.</p>';
      return;
    }

    // Count path frequencies
    const pathCounts = {};
    journeys.forEach(j => {
      const path = (j.journey || []).map(s => s.productId).join(' → ');
      pathCounts[path] = (pathCounts[path] || 0) + 1;
    });

    const sorted = Object.entries(pathCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxCount = Math.max(...sorted.map(e => e[1]), 1);

    container.innerHTML = '';
    sorted.forEach(([path, count], i) => {
      const steps = path.split(' → ');
      const pct = Math.round((count / maxCount) * 100);

      const row = document.createElement('div');
      row.className = 'journey-row';
      row.setAttribute('aria-label', `Journey path: ${path}, occurred ${count} times`);

      const pathEl = document.createElement('div');
      pathEl.className = 'journey-path';
      steps.forEach((step, si) => {
        const chip = document.createElement('span');
        chip.className = 'journey-chip' + (si === steps.length - 1 ? ' journey-chip--convert' : '');
        chip.textContent = step.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).slice(0, 18);
        pathEl.appendChild(chip);
        if (si < steps.length - 1) {
          const arrow = document.createElement('span');
          arrow.className = 'journey-arrow';
          arrow.textContent = '→';
          pathEl.appendChild(arrow);
        }
      });

      const bar = document.createElement('div');
      bar.className = 'journey-bar-wrap';
      bar.innerHTML = `<div class="journey-bar" style="width:${pct}%" role="progressbar" aria-valuenow="${count}" aria-valuemin="0" aria-valuemax="${maxCount}"></div><span class="journey-count">${count}x</span>`;

      row.appendChild(pathEl);
      row.appendChild(bar);
      container.appendChild(row);
    });
  }

  // ─── Chart 4: Attribute Combination Performance ─────────────────────────────

  /**
   * Renders a grouped breakdown of material + aesthetic tier + sustainability profile combos.
   * @param {Object} metrics
   */
  function renderAttributeChart(metrics) {
    const canvas = document.getElementById('chart-attributes');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const stats = metrics.productStats || {};

    // Aggregate attribute combos across all products
    const attrCounts = {};
    Object.values(stats).forEach(ps => {
      Object.entries(ps.attributes || {}).forEach(([key, count]) => {
        attrCounts[key] = (attrCounts[key] || 0) + count;
      });
    });

    const entries = Object.entries(attrCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (entries.length === 0) { renderEmptyState(ctx, canvas, 'No attribute data yet'); return; }

    const W = canvas.width, H = canvas.height;
    const pad = { top: 20, right: 20, bottom: 20, left: 220 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;
    const barH = Math.min(26, chartH / entries.length - 8);
    const maxVal = Math.max(...entries.map(e => e[1]), 1);

    ctx.clearRect(0, 0, W, H);

    const segColors = [COLORS.accent, COLORS.primaryLight, COLORS.earth2, COLORS.green2, COLORS.earth1, COLORS.green3];

    entries.forEach(([key, count], i) => {
      const parts = key.split('|');
      const label = parts.slice(0, 2).join(' / ');
      const y = pad.top + i * (chartH / entries.length) + (chartH / entries.length - barH) / 2;
      const barW = (count / maxVal) * chartW;

      ctx.fillStyle = COLORS.text; ctx.font = FONT_SMALL; ctx.textAlign = 'right';
      ctx.fillText(label.slice(0, 28), pad.left - 8, y + barH / 2 + 4);

      ctx.fillStyle = segColors[i % segColors.length];
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(pad.left, y, barW, barH, 4) : ctx.rect(pad.left, y, barW, barH);
      ctx.fill();

      ctx.fillStyle = COLORS.text; ctx.font = FONT_BOLD; ctx.textAlign = 'left';
      ctx.fillText(count, pad.left + barW + 6, y + barH / 2 + 4);
    });
  }

  // ─── Chart 5: A/B Test Insights Panel ──────────────────────────────────────

  /**
   * Renders the A/B test side-by-side comparison panel.
   * @param {Object} metrics
   */
  function renderABPanel(metrics) {
    const el = document.getElementById('ab-panel');
    if (!el) return;
    const variants = metrics.abVariants || {};

    if (Object.keys(variants).length === 0) {
      el.innerHTML = '<p class="empty-state">No A/B test data yet. Variants are assigned on first visit.</p>';
      return;
    }

    const variantA = variants['A'] || { impressions: 0, clicks: 0 };
    const variantB = variants['B'] || { impressions: 0, clicks: 0 };
    const rateA = variantA.impressions > 0 ? ((variantA.clicks / variantA.impressions) * 100).toFixed(1) : '0.0';
    const rateB = variantB.impressions > 0 ? ((variantB.clicks / variantB.impressions) * 100).toFixed(1) : '0.0';
    const winner = parseFloat(rateA) >= parseFloat(rateB) ? 'A' : 'B';

    el.innerHTML = `
      <div class="ab-card ${winner === 'A' ? 'ab-card--winner' : ''}" aria-label="Variant A: sort by rating, conversion rate ${rateA}%">
        <div class="ab-label">Variant A ${winner === 'A' ? '🏆' : ''}</div>
        <div class="ab-desc">Sort by Rating</div>
        <div class="ab-rate">${rateA}%</div>
        <div class="ab-meta">${variantA.impressions} impressions · ${variantA.clicks} clicks</div>
      </div>
      <div class="ab-vs">VS</div>
      <div class="ab-card ${winner === 'B' ? 'ab-card--winner' : ''}" aria-label="Variant B: sort by review count, conversion rate ${rateB}%">
        <div class="ab-label">Variant B ${winner === 'B' ? '🏆' : ''}</div>
        <div class="ab-desc">Sort by Review Count</div>
        <div class="ab-rate">${rateB}%</div>
        <div class="ab-meta">${variantB.impressions} impressions · ${variantB.clicks} clicks</div>
      </div>
    `;
  }

  // ─── Utility ────────────────────────────────────────────────────────────────

  function renderEmptyState(ctx, canvas, message) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.fillText(message, canvas.width / 2, canvas.height / 2);
  }

  // ─── Clear Data ─────────────────────────────────────────────────────────────

  function setupClearButton() {
    const btn = document.getElementById('btn-clear-data');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (confirm('Clear all Zero Waste Kitchen analytics data? This cannot be undone.')) {
        if (window.ZWKTracker) {
          ZWKTracker.clearMetrics();
        } else {
          try { localStorage.removeItem('eco_luxury_metrics'); sessionStorage.removeItem('eco_luxury_session'); } catch (e) { /* ignore */ }
        }
        renderAll();
        alert('Analytics data cleared.');
      }
    });
  }

  // ─── Main Render ─────────────────────────────────────────────────────────────

  /**
   * Renders all dashboard components.
   */
  function renderAll() {
    const metrics = loadMetrics();
    renderSummaryStrip(metrics);
    renderCategoryChart(metrics);
    renderProductChart(metrics);
    renderJourneyChart(metrics);
    renderAttributeChart(metrics);
    renderABPanel(metrics);
  }

  // ─── Init ────────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    renderAll();
    setupClearButton();

    // Refresh every 30 seconds if page stays open
    setInterval(renderAll, 30000);
  });

  window.ZWKDashboard = { renderAll, loadMetrics };

}());
