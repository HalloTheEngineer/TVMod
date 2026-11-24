import type { PanelPlugin } from './plugin-types.js';

export const PLUGINS: PanelPlugin[] = [
  {
    id: 'adblock',
    name: 'Adblock',
    description:
      'Suppress charting ads, promo offers, upgrade pills, referral/coupon toasts, and Black Friday/Cyber Monday flags.',
    category: 'ads',
    defaultEnabled: true,
    requiresReload: true,
  },
  {
    id: 'privacy-shield',
    name: 'Privacy Shield',
    description:
      'Block known analytics/ad hosts, tracking feature flags, cookie prompts, and tracking parameters. Reload required.',
    category: 'ads',
    defaultEnabled: false,
    requiresReload: true,
  },
  {
    id: 'hide-ai-copilot',
    name: 'Disable AI Copilot',
    description:
      'Disable AI Copilot feature flags at boot and hide its remaining UI. Reload required.',
    category: 'interface',
    defaultEnabled: true,
    requiresReload: true,
  },
  {
    id: 'keyword-filter',
    name: 'Keyword Filter',
    description:
      'Hide watchlist symbols and news/headline content containing configured keywords.',
    category: 'interface',
    defaultEnabled: false,
    settings: [
      {
        key: 'keywords',
        name: 'Keywords',
        description: 'Comma-separated terms, case-insensitive. Up to 20.',
        type: 'string',
        default: '',
        placeholder: 'tesla, nvidia, sponsored',
      },
      {
        key: 'scope',
        name: 'Filter scope',
        type: 'select',
        default: 'all',
        options: [
          { value: 'all', label: 'Watchlist and news' },
          { value: 'watchlist', label: 'Watchlist only' },
          { value: 'news', label: 'News only' },
        ],
      },
    ],
  },
  {
    id: 'quick-actions',
    name: 'Quick Actions',
    description:
      'Hotkeys and an optional floating menu for Notes, Position Size, fullscreen, and reload.',
    category: 'tools',
    defaultEnabled: false,
    settings: [
      {
        key: 'showButton',
        name: 'Show actions button',
        type: 'boolean',
        default: true,
      },
      {
        key: 'enableHotkeys',
        name: 'Enable hotkeys',
        type: 'boolean',
        default: true,
      },
    ],
  },
  {
    id: 'focus-mode',
    name: 'Focus Mode',
    description:
      'Collapse the sidebar and hide the right toolbar and bottom controls. Press Ctrl+Shift+M to reopen TVMod settings.',
    category: 'interface',
    defaultEnabled: false,
  },
  {
    id: 'reduce-motion',
    name: 'Reduce Motion',
    description:
      'Disable UI transitions, animations, and smooth scrolling for a calmer interface.',
    category: 'accessibility',
    defaultEnabled: false,
  },
];

export function getPlugin(id: string): PanelPlugin | undefined {
  return PLUGINS.find((plugin) => plugin.id === id);
}

export function isBuiltinPluginId(id: string): boolean {
  return PLUGINS.some((plugin) => plugin.id === id);
}
