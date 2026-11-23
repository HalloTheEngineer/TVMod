import { isPluginEnabled, type TvmodConfig } from './config.js';
import {
  PROMO_CLASS_SELECTOR,
  PROMO_NAME_SELECTOR,
} from './css.js';

const HIDDEN_ATTR = 'data-tvmod-promo';

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

  const adblock = isPluginEnabled(config, 'adblock');
  root.dataset.tvmodAdblock = adblock ? '1' : '0';
  root.dataset.tvmodHideAi = isPluginEnabled(config, 'hide-ai-copilot') ? '1' : '0';
  root.dataset.tvmodHideCommunity = isPluginEnabled(config, 'hide-community-hub')
    ? '1'
    : '0';
  root.dataset.tvmodHideSidebar = isPluginEnabled(config, 'hide-sidebar') ? '1' : '0';

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
