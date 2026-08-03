// Google Analytics 4 (GA4) — lightweight client-side integration.
// Measurement IDs are public identifiers, safe to keep in source.
export const GA_MEASUREMENT_ID = "G-YSQVDNF3QP";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function gtag(...args: unknown[]) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(args);
}

let initialized = false;

/** Loads gtag.js once. No-op on the server or if already present. */
export function initAnalytics() {
  if (typeof window === "undefined") return;
  if (initialized) return;
  if (document.querySelector(`script[src*="googletagmanager.com/gtag/js"]`)) {
    initialized = true;
    return;
  }
  initialized = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  gtag("js", new Date());
  // Route changes are tracked manually below.
  gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });
}

/** Sends a page_view for the current SPA location. */
export function trackPageView(path: string) {
  if (typeof window === "undefined") return;
  gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}
