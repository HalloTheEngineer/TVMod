import type { PanelPlugin } from './plugin-types.js';

export const PLUGINS: PanelPlugin[] = [
  {
    id: 'adblock',
    name: 'Adblock',
    description:
      'Suppress promo offers, upgrade pills, referral/coupon toasts, and Black Friday/Cyber Monday flags.',
    category: 'ads',
    defaultEnabled: true,
    requiresReload: true,
  },
  {
    id: 'hide-ai-copilot',
    name: 'Hide AI Copilot',
    description: 'Remove the AI Copilot button and area from the chart.',
    category: 'interface',
    defaultEnabled: true,
  },
  {
    id: 'hide-community-hub',
    name: 'Hide Community Hub',
    description: 'Remove the Community Hub button from the right toolbar.',
    category: 'interface',
    defaultEnabled: true,
  },
  {
    id: 'hide-sidebar',
    name: 'Hide Sidebar',
    description:
      'Hide the entire right watchlist/details sidebar and give the chart more room.',
    category: 'interface',
    defaultEnabled: false,
  },
  {
    id: 'hide-right-toolbar',
    name: 'Hide Right Toolbar',
    description:
      'Remove the entire right button column: alerts, object tree, screeners, Pine, calendar, notifications, chats, and help.',
    category: 'interface',
    defaultEnabled: false,
  },
  {
    id: 'hide-watchlist',
    name: 'Hide Watchlist',
    description:
      'Hide the watchlist widget while keeping the instrument details panel available.',
    category: 'interface',
    defaultEnabled: false,
  },
  {
    id: 'hide-details',
    name: 'Hide Details Panel',
    description:
      'Hide the instrument details widget while keeping the watchlist available.',
    category: 'interface',
    defaultEnabled: false,
  },
  {
    id: 'hide-bottom-controls',
    name: 'Hide Bottom Controls',
    description:
      'Hide the bottom timeframe and date-range control bar for a cleaner chart.',
    category: 'interface',
    defaultEnabled: false,
  },
  {
    id: 'hide-toolbar-extras',
    name: 'Hide Toolbar Extras',
    description:
      'Hide screeners, Pine Editor, Pine Screener, calendars, notifications, chats, help, and the object tree button.',
    category: 'interface',
    defaultEnabled: false,
  },
  {
    id: 'hide-trade-buttons',
    name: 'Hide Trade Buttons',
    description:
      'Hide buy/sell and broker buttons. Account entitlements and trading permissions are unchanged.',
    category: 'interface',
    defaultEnabled: false,
  },
  {
    id: 'focus-mode',
    name: 'Focus Mode',
    description:
      'Hide the right toolbar, sidebar, and bottom controls. Press Ctrl+Shift+M to reopen TVMod settings.',
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
