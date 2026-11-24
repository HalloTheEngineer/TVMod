import { isPluginEnabled, type TvmodConfig } from './config.js';
import {
  PROMO_CLASS_SELECTOR,
  PROMO_NAME_SELECTOR,
} from './css.js';
import { stripTrackingParams } from '../lib/privacy.js';

const HIDDEN_ATTR = 'data-tvmod-promo';
const PRIVACY_ATTR = 'data-tvmod-cookie';
const SIDEBAR_FORCED_KEY = 'tvmod.sidebar.forced';

let forcedSidebar = readForcedSidebar();
let sidebarActionAt = 0;
let privacyEnabled = false;
let trackingHandlerInstalled = false;

function readForcedSidebar(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_FORCED_KEY) === '1';
  } catch {
    return false;
  }
}

function setForcedSidebar(value: boolean): void {
  forcedSidebar = value;
  try {
    if (value) {
      localStorage.setItem(SIDEBAR_FORCED_KEY, '1');
    } else {
      localStorage.removeItem(SIDEBAR_FORCED_KEY);
    }
  } catch {
    // localStorage may be unavailable.
  }
}

function scheduleSidebarStateRefresh(requestedCollapsed: boolean): void {
  window.setTimeout(() => {
    const area = document.querySelector<HTMLElement>('.layout__area--right');
    if (!area) return;
    const collapsedNow = area.getBoundingClientRect().width <= 60;
    document.documentElement.dataset.tvmodSidebarCollapsed =
      collapsedNow ? '1' : '0';
    if (!collapsedNow && !requestedCollapsed) setForcedSidebar(false);
  }, 700);
}

function updateSidebarLayout(root: HTMLElement, collapsed: boolean): void {
  const area = document.querySelector<HTMLElement>('.layout__area--right');
  const center = document.querySelector<HTMLElement>('.layout__area--center');
  if (!area) {
    root.dataset.tvmodSidebarCollapsed = '0';
    return;
  }

  const isCollapsed = area.getBoundingClientRect().width <= 60;
  root.dataset.tvmodSidebarCollapsed = isCollapsed ? '1' : '0';
  if (center) {
    root.style.setProperty('--tvmod-center-left', `${center.offsetLeft}px`);
  }

  const base = document.querySelector<HTMLElement>('[data-name="base"]');
  if (!base) return;
  if (Date.now() - sidebarActionAt < 500) return;

  if (collapsed && !isCollapsed) {
    base.click();
    setForcedSidebar(true);
    sidebarActionAt = Date.now();
    scheduleSidebarStateRefresh(collapsed);
  } else if (!collapsed && isCollapsed && forcedSidebar) {
    base.click();
    sidebarActionAt = Date.now();
    scheduleSidebarStateRefresh(collapsed);
  } else if (!collapsed && !isCollapsed) {
    setForcedSidebar(false);
  }
}

function tagPromo(element: Element): void {
  if (!element.hasAttribute(HIDDEN_ATTR)) {
    element.setAttribute(HIDDEN_ATTR, '1');
  }
}

function tagPrivacy(element: Element | null): void {
  if (element && !element.hasAttribute(PRIVACY_ATTR)) {
    element.setAttribute(PRIVACY_ATTR, '1');
  }
}

function findPromoContainer(element: Element): Element | null {
  let node: Element | null = element;

  for (let depth = 0; depth < 6 && node; depth += 1) {
    const className = typeof node.className === 'string' ? node.className : '';
    const role = node.getAttribute('role');

    if (
      /toast|notification|promo|upgrade/i.test(className) ||
      role === 'status' ||
      role === 'alert'
    ) {
      return node;
    }

    node = node.parentElement;
  }

  return null;
}

function cookieContainer(element: Element): Element | null {
  return (
    element.closest(
      '[class*="toastGroup"], [class*="toast-group"], [class*="cookieBanner"], [class*="cookie-banner"]'
    ) ??
    findPromoContainer(element) ??
    element.parentElement
  );
}

function installTrackingHandler(): void {
  if (trackingHandlerInstalled) return;
  trackingHandlerInstalled = true;

  document.addEventListener(
    'click',
    (event) => {
      if (!privacyEnabled) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor) return;

      try {
        const url = new URL(anchor.href, location.href);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
        const next = stripTrackingParams(url);
        if (next !== url.toString() && next !== anchor.href) {
          anchor.href = next;
        }
      } catch {
        // Ignore malformed links.
      }
    },
    true
  );
}

export function applyDom(config: TvmodConfig): void {
  const root = document.documentElement;
  if (!root) return;

  const adblock = isPluginEnabled(config, 'adblock');
  const privacy = isPluginEnabled(config, 'privacy-shield');
  const focusMode = isPluginEnabled(config, 'focus-mode');
  const disableAi = isPluginEnabled(config, 'hide-ai-copilot');
  const reduceMotion = isPluginEnabled(config, 'reduce-motion');

  privacyEnabled = privacy;
  installTrackingHandler();

  root.dataset.tvmodAdblock = adblock ? '1' : '0';
  root.dataset.tvmodPrivacy = privacy ? '1' : '0';
  root.dataset.tvmodHideAi = disableAi ? '1' : '0';
  root.dataset.tvmodReduceMotion = reduceMotion ? '1' : '0';

  // Keep the native sidebar toggle clickable while resolving Focus Mode.
  root.dataset.tvmodFocus = '0';
  updateSidebarLayout(root, focusMode);
  root.dataset.tvmodFocus = focusMode ? '1' : '0';

  if (adblock) {
    for (const element of document.querySelectorAll(PROMO_CLASS_SELECTOR)) {
      tagPromo(element);
    }

    for (const element of document.querySelectorAll(PROMO_NAME_SELECTOR)) {
      tagPromo(element);
      const container = findPromoContainer(element);
      if (container) tagPromo(container);
    }
  }

  if (privacy) {
    for (const element of document.querySelectorAll(
      '[data-name*="cookies"], [class*="cookieBanner"], [class*="cookie-banner"]'
    )) {
      tagPrivacy(cookieContainer(element));
    }
  }
}

export function startDomObserver(
  getConfig: () => TvmodConfig,
  onMutation?: () => void
): () => void {
  let scheduled = false;

  const run = (): void => {
    scheduled = false;
    applyDom(getConfig());
    onMutation?.();
  };

  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(run, 250);
  };

  const root = document.documentElement;
  if (!root) return () => {};

  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true });

  applyDom(getConfig());
  onMutation?.();

  return () => observer.disconnect();
}
