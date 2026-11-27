import { isPluginEnabled, type TvmodConfig } from './config.js';
import {
  PROMO_CLASS_SELECTOR,
  PROMO_NAME_SELECTOR,
} from './css.js';
import { stripTrackingParams } from '../lib/privacy.js';
import { isSafeUpgradeClass, isUpgradeText } from './upgrade.js';

const HIDDEN_ATTR = 'data-tvmod-promo';
const UPGRADE_ATTR = 'data-tvmod-upgrade';
const PRIVACY_ATTR = 'data-tvmod-cookie';
const UPGRADE_SCAN_MS = 1000;
const UPGRADE_SELECTOR = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[aria-modal="true"]',
  '[class*="modal"]',
  '[class*="Modal"]',
  '[class*="overlay"]',
  '[class*="Overlay"]',
  '[class*="paywall"]',
  '[class*="Paywall"]',
  '[class*="upgrade"]',
  '[class*="Upgrade"]',
  '[class*="go-pro"]',
].join(', ');
const SIDEBAR_FORCED_KEY = 'tvmod.sidebar.forced';

let forcedSidebar = readForcedSidebar();
let sidebarActionAt = 0;
let privacyEnabled = false;
let trackingHandlerInstalled = false;
const pendingUpgradeRoots = new Set<Element>();
let upgradeGroups: Array<{ root: Element; extras: Element[] }> = [];
let lastUpgradeScan = 0;

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

function upgradeAttrSelector(): string {
  return '[' + UPGRADE_ATTR + ']';
}

function hasChartContent(element: Element): boolean {
  return Boolean(
    element.querySelector('canvas, .chart-container, [data-name="chart"]')
  );
}

function isSafeUpgradeContainer(element: Element): boolean {
  if (!element.isConnected) return false;
  if (element === document.body || element === document.documentElement) {
    return false;
  }
  const className =
    typeof element.className === 'string' ? element.className : '';
  if (!isSafeUpgradeClass(className)) return false;
  if (element.childElementCount > 60) return false;
  if (hasChartContent(element)) return false;
  return true;
}

function upgradeRootFor(candidate: Element): Element {
  let root = candidate;
  let node: Element | null = candidate;

  for (let depth = 0; depth < 12 && node; depth += 1) {
    if (!isSafeUpgradeContainer(node)) break;
    if (!isUpgradeText(node.textContent ?? '')) break;
    root = node;
    node = node.parentElement;
  }

  return root;
}

function looksLikeBackdrop(element: Element): boolean {
  if (element === document.body || element === document.documentElement) {
    return false;
  }
  const className =
    typeof element.className === 'string' ? element.className : '';
  const role = element.getAttribute('role');
  if (/backdrop|scrim|mask|overlay|modal/i.test(className)) return true;
  if (role === 'presentation') return true;
  if ((element.textContent ?? '').trim().length > 40) return false;

  try {
    const style = getComputedStyle(element);
    if (style.position !== 'fixed' && style.position !== 'absolute') {
      return false;
    }
    if (style.pointerEvents === 'none') return false;
    const rect = element.getBoundingClientRect();
    return (
      rect.width >= window.innerWidth * 0.6 &&
      rect.height >= window.innerHeight * 0.5
    );
  } catch {
    return false;
  }
}

function tagUpgradeBackdrops(root: Element): Element[] {
  const extras: Element[] = [];
  const parent = root.parentElement;
  if (!parent) return extras;

  for (const sibling of Array.from(parent.children)) {
    if (sibling === root) continue;
    if (sibling.hasAttribute(UPGRADE_ATTR)) continue;
    if (!looksLikeBackdrop(sibling)) continue;
    sibling.setAttribute(UPGRADE_ATTR, '1');
    extras.push(sibling);
  }

  return extras;
}

function tagUpgradeRoot(root: Element): void {
  if (root.hasAttribute(UPGRADE_ATTR)) return;
  root.setAttribute(UPGRADE_ATTR, '1');
  upgradeGroups.push({ root, extras: tagUpgradeBackdrops(root) });
}

function cleanUpgradeTags(): void {
  if (upgradeGroups.length === 0) {
    for (const element of document.querySelectorAll(upgradeAttrSelector())) {
      element.removeAttribute(UPGRADE_ATTR);
    }
    return;
  }

  const keep = new Set<Element>();
  upgradeGroups = upgradeGroups.filter(({ root, extras }) => {
    const valid =
      root.isConnected &&
      isSafeUpgradeContainer(root) &&
      isUpgradeText(root.textContent ?? '');
    if (!valid) return false;
    keep.add(root);
    for (const extra of extras) keep.add(extra);
    return true;
  });

  for (const element of document.querySelectorAll(upgradeAttrSelector())) {
    if (!keep.has(element)) element.removeAttribute(UPGRADE_ATTR);
  }
}

function scanUpgradeRoots(): void {
  const candidates = new Set<Element>();

  for (const element of document.querySelectorAll(UPGRADE_SELECTOR)) {
    candidates.add(element);
  }
  for (const element of Array.from(document.body?.children ?? [])) {
    candidates.add(element);
  }
  for (const element of candidates) {
    if (element.hasAttribute(UPGRADE_ATTR)) continue;
    if (element.closest(upgradeAttrSelector())) continue;
    if (!isSafeUpgradeContainer(element)) continue;
    if (!isUpgradeText(element.textContent ?? '')) continue;
    tagUpgradeRoot(upgradeRootFor(element));
  }
}

function processPendingUpgradeRoots(): void {
  if (pendingUpgradeRoots.size === 0) return;

  const roots = Array.from(pendingUpgradeRoots);
  pendingUpgradeRoots.clear();

  for (const element of roots) {
    if (!element.isConnected) continue;
    if (element.hasAttribute(UPGRADE_ATTR)) continue;
    if (element.closest(upgradeAttrSelector())) continue;
    if (!isSafeUpgradeContainer(element)) continue;
    if (!isUpgradeText(element.textContent ?? '')) continue;
    tagUpgradeRoot(upgradeRootFor(element));
  }
}

function refreshUpgradeTags(force = false): void {
  cleanUpgradeTags();
  processPendingUpgradeRoots();

  const now = Date.now();
  if (!force && now - lastUpgradeScan < UPGRADE_SCAN_MS) return;
  lastUpgradeScan = now;
  scanUpgradeRoots();
}

function clearUpgradeTags(): void {
  upgradeGroups = [];
  pendingUpgradeRoots.clear();
  lastUpgradeScan = 0;
  for (const element of document.querySelectorAll(upgradeAttrSelector())) {
    element.removeAttribute(UPGRADE_ATTR);
  }
}

function isUpgradeCandidateNode(element: Element): boolean {
  if (element.parentElement === document.body) return true;
  if (element.hasAttribute('role') || element.hasAttribute('aria-modal')) {
    return true;
  }
  try {
    return element.matches(UPGRADE_SELECTOR);
  } catch {
    return false;
  }
}

function rememberUpgradeRoot(node: Node): void {
  if (!(node instanceof Element)) return;
  if (pendingUpgradeRoots.size >= 40) return;
  if (!isUpgradeCandidateNode(node)) return;
  pendingUpgradeRoots.add(node);
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

    refreshUpgradeTags();
  } else {
    clearUpgradeTags();
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

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) rememberUpgradeRoot(node);
    }
    schedule();
  });
  observer.observe(root, { childList: true, subtree: true });

  const cleanupTimer = window.setInterval(cleanUpgradeTags, 1500);

  applyDom(getConfig());
  onMutation?.();

  return () => {
    observer.disconnect();
    window.clearInterval(cleanupTimer);
  };
}
