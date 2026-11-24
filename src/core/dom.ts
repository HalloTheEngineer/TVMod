import { isPluginEnabled, type TvmodConfig } from './config.js';
import {
  PROMO_CLASS_SELECTOR,
  PROMO_NAME_SELECTOR,
} from './css.js';

const HIDDEN_ATTR = 'data-tvmod-promo';
const SIDEBAR_FORCED_KEY = 'tvmod.sidebar.forced';

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

let forcedSidebar = readForcedSidebar();
let sidebarActionAt = 0;

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
    // Keep forcedSidebar until the sidebar is actually expanded. The toggle
    // can be hidden by Hide Right Toolbar/Focus Mode, in which case the click
    // is a no-op until those plugins are disabled.
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

export function applyDom(config: TvmodConfig): void {
  const root = document.documentElement;
  if (!root) return;

  const hideSidebar = isPluginEnabled(config, 'hide-sidebar');
  const hideRightToolbar = isPluginEnabled(config, 'hide-right-toolbar');
  const hideWatchlist = isPluginEnabled(config, 'hide-watchlist');
  const hideDetails = isPluginEnabled(config, 'hide-details');
  const hideBottomControls = isPluginEnabled(config, 'hide-bottom-controls');
  const focusMode = isPluginEnabled(config, 'focus-mode');

  const adblock = isPluginEnabled(config, 'adblock');
  root.dataset.tvmodAdblock = adblock ? '1' : '0';
  root.dataset.tvmodHideAi = isPluginEnabled(config, 'hide-ai-copilot') ? '1' : '0';
  root.dataset.tvmodHideCommunity = isPluginEnabled(config, 'hide-community-hub')
    ? '1'
    : '0';
  root.dataset.tvmodHideSidebar = hideSidebar ? '1' : '0';
  // Keep the native sidebar toggle clickable while resolving sidebar state.
  root.dataset.tvmodHideRightToolbar = '0';
  root.dataset.tvmodFocus = '0';
  root.dataset.tvmodHideWatchlist = hideWatchlist ? '1' : '0';
  root.dataset.tvmodHideDetails = hideDetails ? '1' : '0';
  root.dataset.tvmodHideBottomControls = hideBottomControls ? '1' : '0';
  root.dataset.tvmodHideToolbarExtras = isPluginEnabled(
    config,
    'hide-toolbar-extras'
  )
    ? '1'
    : '0';
  root.dataset.tvmodHideTradeButtons = isPluginEnabled(
    config,
    'hide-trade-buttons'
  )
    ? '1'
    : '0';
  root.dataset.tvmodReduceMotion = isPluginEnabled(config, 'reduce-motion')
    ? '1'
    : '0';

  updateSidebarLayout(
    root,
    hideSidebar ||
      focusMode ||
      (hideWatchlist && hideDetails)
  );

  root.dataset.tvmodHideRightToolbar = hideRightToolbar ? '1' : '0';
  root.dataset.tvmodFocus = focusMode ? '1' : '0';

  if (!adblock) return;

  for (const element of document.querySelectorAll(PROMO_CLASS_SELECTOR)) {
    tagPromo(element);
  }

  for (const element of document.querySelectorAll(PROMO_NAME_SELECTOR)) {
    tagPromo(element);
    const container = findPromoContainer(element);
    if (container) tagPromo(container);
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
