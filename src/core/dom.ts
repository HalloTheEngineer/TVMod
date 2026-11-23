import {
  PROMO_CLASS_SELECTOR,
  PROMO_NAME_SELECTOR,
} from './css.js';
import type { Settings } from './types.js';

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

export function applyDom(settings: Settings): void {
  const root = document.documentElement;
  if (!root) return;

  root.dataset.tvmodNoPromos = settings.noPromos ? '1' : '0';
  root.dataset.tvmodCleanUi = settings.cleanUi ? '1' : '0';
  root.dataset.tvmodHideSidebar = settings.hideSidebar ? '1' : '0';

  if (!settings.noPromos) return;

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
  getSettings: () => Settings,
  onMutation?: () => void
): () => void {
  let scheduled = false;

  const run = (): void => {
    scheduled = false;
    applyDom(getSettings());
    onMutation?.();
  };

  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 50);
    }
  };

  const root = document.documentElement;
  if (!root) return () => {};

  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true });

  applyDom(getSettings());
  onMutation?.();

  return () => observer.disconnect();
}
