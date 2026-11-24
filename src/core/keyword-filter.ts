import type { TvmodConfig } from './config.js';
import { getPluginSettings, isPluginEnabled } from './config.js';
import { getPlugin } from './plugins.js';

const FILTERED_ATTR = 'data-tvmod-filtered';
const PLUGIN_ID = 'keyword-filter';

export function parseKeywords(raw: string): string[] {
  const keywords: string[] = [];
  for (const part of raw.split(',')) {
    const keyword = part.trim().toLowerCase();
    if (keyword.length < 2 || keyword.length > 40) continue;
    if (!keywords.includes(keyword)) keywords.push(keyword);
    if (keywords.length >= 20) break;
  }
  return keywords;
}

function clearTags(): void {
  for (const element of document.querySelectorAll(`[${FILTERED_ATTR}]`)) {
    element.removeAttribute(FILTERED_ATTR);
  }
}

function tag(element: Element | null): void {
  if (!element) return;
  if (element === document.body || element === document.documentElement) return;
  const rect = element.getBoundingClientRect();
  if (rect.width > 520 || rect.height > 520) return;
  element.setAttribute(FILTERED_ATTR, '1');
}

function filterWatchlist(keywords: string[]): void {
  const names = document.querySelectorAll(
    '[data-name="symbol-list-wrap"] [class*="symbolNameText"]'
  );
  for (const name of names) {
    const text = (name.textContent ?? '').trim().toLowerCase();
    if (!text || !keywords.some((keyword) => text.includes(keyword))) continue;

    const row =
      name.closest('[class*="wrap-"]') ??
      name.closest('[class*="row"]') ??
      name.parentElement;
    tag(row);
  }
}

function filterNews(keywords: string[]): void {
  for (const element of document.querySelectorAll(
    '[data-name*="news-notification"]'
  )) {
    const text = (element.textContent ?? '').trim().toLowerCase();
    if (!keywords.some((keyword) => text.includes(keyword))) continue;
    tag(
      element.closest(
        '[class*="toastGroup"], [class*="toast-group"]'
      ) ?? element.parentElement
    );
  }

  const cards = document.querySelectorAll(
    [
      '[data-name="widgetbar-wrap"] [class*="headline"]',
      '[data-name="widgetbar-wrap"] [class*="news"]',
      '[data-name="widgetbar-wrap"] [class*="story"]',
      '[data-name="widgetbar-wrap"] [class*="article"]',
    ].join(', ')
  );

  for (const element of cards) {
    if (element.children.length > 3) continue;
    const text = (element.textContent ?? '').trim().toLowerCase();
    if (text.length > 240) continue;
    if (!keywords.some((keyword) => text.includes(keyword))) continue;

    const card =
      element.closest(
        '[class*="item"], [class*="card"], [class*="row"], [class*="story"]'
      ) ?? element;
    tag(card);
  }
}

export function applyKeywordFilter(config: TvmodConfig): void {
  clearTags();

  const plugin = getPlugin(PLUGIN_ID);
  if (!plugin || !isPluginEnabled(config, PLUGIN_ID)) return;

  const settings = getPluginSettings(config, plugin);
  const keywords = parseKeywords(
    typeof settings.keywords === 'string' ? settings.keywords : ''
  );
  if (keywords.length === 0) return;

  const scope =
    typeof settings.scope === 'string' ? settings.scope : 'all';
  if (scope !== 'news') filterWatchlist(keywords);
  if (scope !== 'watchlist') filterNews(keywords);
}
