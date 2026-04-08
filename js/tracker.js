/**
 * tracker.js
 * Zero Waste Kitchen — Client-Side Analytics Tracker
 *
 * Instruments the recommendation system to capture engagement events.
 * All data is stored in localStorage under the namespaced key `eco_luxury_metrics`.
 * No external services, no PII, no cookies — fully private, browser-only.
 *
 * @module tracker
 */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'eco_luxury_metrics';
  const SESSION_KEY = 'eco_luxury_session';

  // ─── Schema Definitions ────────────────────────────────────────────────────

  /**
   * Valid event types accepted by trackEvent().
   * @enum {string}
   */
  const EVENT_TYPES = {
    IMPRESSION: 'recommendation_impression',
    CLICK: 'affiliate_click',
    PAGE_VIEW: 'product_page_view',
    JOURNEY_STEP: 'journey_step',
    AB_VARIANT: 'ab_variant_assigned'
  };

  /**
   * Required payload fields per event type.
   * @type {Object.<string, string[]>}
   */
  const REQUIRED_FIELDS = {
    recommendation_impression: ['productId', 'category'],
    affiliate_click: ['productId', 'linkType', 'category', 'material', 'aestheticTier', 'sustainabilityProfile'],
    product_page_view: ['productId'],
    journey_step: ['productId', 'stepIndex'],
    ab_variant_assigned: ['variant']
  };

  // ─── Storage Helpers ────────────────────────────────────────────────────────

  /**
   * Checks if localStorage is available (may be blocked in private browsing).
   * @returns {boolean}
   */
  function isStorageAvailable() {
    try {
      const test = '__zwk_test__';
      localStorage.setItem(test, '1');
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      console.warn('[ZWK Tracker] localStorage unavailable — tracking disabled.', e.message);
      return false;
    }
  }

  /**
   * Reads and parses the metrics store from localStorage.
   * Returns a default empty store if missing or malformed.
   * @returns {Object} metrics store
   */
  function readStore() {
    if (!isStorageAvailable()) return getDefaultStore();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return getDefaultStore();
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        console.warn('[ZWK Tracker] Malformed metrics store — resetting.');
        return getDefaultStore();
      }
      return parsed;
    } catch (e) {
      console.warn('[ZWK Tracker] Failed to parse metrics store:', e.message);
      return getDefaultStore();
    }
  }

  /**
   * Writes the metrics store to localStorage.
   * @param {Object} store
   */
  function writeStore(store) {
    if (!isStorageAvailable()) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      console.warn('[ZWK Tracker] Failed to write metrics store:', e.message);
    }
  }

  /**
   * Returns a fresh default metrics store structure.
   * @returns {Object}
   */
  function getDefaultStore() {
    return {
      version: 1,
      totalSessions: 0,
      totalClicks: 0,
      totalImpressions: 0,
      events: [],
      categoryStats: {},
      productStats: {},
      journeys: [],
      abVariants: {}
    };
  }

  // ─── Session Management ─────────────────────────────────────────────────────

  /**
   * Gets or creates the current session object in sessionStorage.
   * @returns {Object} current session
   */
  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    const session = {
      id: 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      startTime: Date.now(),
      journey: [],
      abVariant: null,
      clicks: 0
    };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) { /* ignore */ }
    // Increment session count in persistent store
    const store = readStore();
    store.totalSessions = (store.totalSessions || 0) + 1;
    writeStore(store);
    return session;
  }

  /**
   * Saves the current session back to sessionStorage.
   * @param {Object} session
   */
  function saveSession(session) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) { /* ignore */ }
  }

  // ─── Payload Validation ─────────────────────────────────────────────────────

  /**
   * Validates that a payload contains all required fields for its event type.
   * @param {string} type - event type
   * @param {Object} payload - event payload
   * @returns {boolean} true if valid
   */
  function validatePayload(type, payload) {
    if (typeof payload !== 'object' || payload === null) {
      console.warn('[ZWK Tracker] Payload must be an object. Got:', typeof payload);
      return false;
    }
    const required = REQUIRED_FIELDS[type];
    if (!required) {
      console.warn('[ZWK Tracker] Unknown event type:', type);
      return false;
    }
    const missing = required.filter(field => payload[field] === undefined || payload[field] === null);
    if (missing.length > 0) {
      console.warn('[ZWK Tracker] Missing required payload fields for', type + ':', missing.join(', '));
      return false;
    }
    return true;
  }

  // ─── Core Tracking Function ─────────────────────────────────────────────────

  /**
   * Tracks an analytics event and persists it to localStorage.
   *
   * @param {string} type - one of EVENT_TYPES values
   * @param {Object} payload - event-specific data (see REQUIRED_FIELDS)
   * @returns {boolean} true if event was successfully tracked
   *
   * @example
   * ZWKTracker.trackEvent('affiliate_click', {
   *   productId: 'swedish-dishcloths',
   *   linkType: 'amazon',
   *   category: 'Complete Your Luxury Kitchen',
   *   material: 'cellulose-cotton blend',
   *   aestheticTier: 'everyday-essential',
   *   sustainabilityProfile: 'biodegradable'
   * });
   */
  function trackEvent(type, payload) {
    if (!validatePayload(type, payload)) return false;

    const store = readStore();
    const session = getSession();
    const timestamp = Date.now();

    const event = {
      type,
      payload: Object.assign({}, payload),
      timestamp,
      sessionId: session.id,
      abVariant: session.abVariant
    };

    // Append to events log (cap at 2000 to avoid localStorage bloat)
    store.events = store.events || [];
    store.events.push(event);
    if (store.events.length > 2000) store.events = store.events.slice(-2000);

    // Update aggregates
    if (type === EVENT_TYPES.IMPRESSION) {
      store.totalImpressions = (store.totalImpressions || 0) + 1;
      const cat = payload.category || 'Unknown';
      store.categoryStats[cat] = store.categoryStats[cat] || { impressions: 0, clicks: 0 };
      store.categoryStats[cat].impressions++;
    }

    if (type === EVENT_TYPES.CLICK) {
      store.totalClicks = (store.totalClicks || 0) + 1;
      session.clicks++;

      const cat = payload.category || 'Unknown';
      store.categoryStats[cat] = store.categoryStats[cat] || { impressions: 0, clicks: 0 };
      store.categoryStats[cat].clicks++;

      const pid = payload.productId;
      store.productStats[pid] = store.productStats[pid] || { clicks: 0, amazonClicks: 0, companyClicks: 0, attributes: {} };
      store.productStats[pid].clicks++;
      if (payload.linkType === 'amazon') store.productStats[pid].amazonClicks++;
      else store.productStats[pid].companyClicks++;

      // Track attribute combinations
      const attrKey = [payload.material, payload.aestheticTier, payload.sustainabilityProfile].join('|');
      store.productStats[pid].attributes[attrKey] = (store.productStats[pid].attributes[attrKey] || 0) + 1;

      // Save journey snapshot
      if (session.journey.length > 0) {
        store.journeys = store.journeys || [];
        store.journeys.push({ sessionId: session.id, journey: [...session.journey], convertedOn: pid, timestamp });
        if (store.journeys.length > 500) store.journeys = store.journeys.slice(-500);
      }
    }

    if (type === EVENT_TYPES.PAGE_VIEW || type === EVENT_TYPES.JOURNEY_STEP) {
      session.journey.push({ productId: payload.productId, timestamp });
      saveSession(session);
    }

    if (type === EVENT_TYPES.AB_VARIANT) {
      session.abVariant = payload.variant;
      saveSession(session);
      store.abVariants[payload.variant] = store.abVariants[payload.variant] || { impressions: 0, clicks: 0 };
      store.abVariants[payload.variant].impressions++;
    }

    writeStore(store);
    return true;
  }

  /**
   * Clears all stored metrics after confirmation.
   * @returns {boolean} true if cleared
   */
  function clearMetrics() {
    if (!isStorageAvailable()) return false;
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      console.info('[ZWK Tracker] Metrics cleared.');
      return true;
    } catch (e) {
      console.warn('[ZWK Tracker] Failed to clear metrics:', e.message);
      return false;
    }
  }

  /**
   * Returns a read-only snapshot of the current metrics store.
   * @returns {Object}
   */
  function getMetrics() {
    return readStore();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  global.ZWKTracker = {
    trackEvent,
    clearMetrics,
    getMetrics,
    EVENT_TYPES
  };

  // Auto-track page view on load
  document.addEventListener('DOMContentLoaded', function () {
    const slug = window.location.pathname.replace(/^\/|\.html$/g, '').replace(/\//g, '-') || 'home';
    trackEvent(EVENT_TYPES.PAGE_VIEW, { productId: slug });
  });

}(window));
