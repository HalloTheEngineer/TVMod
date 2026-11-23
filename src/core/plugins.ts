import type { PanelPlugin } from './plugin-types.js';

export const PLUGINS: PanelPlugin[] = [
  {
    id: 'adblock',
    name: 'Adblock',
    description:
      'Suppress promo offers, upgrade pills, referral/coupon toasts, and Black Friday/Cyber Monday flags.',
    defaultEnabled: true,
    requiresReload: true,
  },
  {
    id: 'hide-ai-copilot',
    name: 'Hide AI Copilot',
    description: 'Remove the AI Copilot button and area from the chart.',
    defaultEnabled: true,
  },
  {
    id: 'hide-community-hub',
    name: 'Hide Community Hub',
    description: 'Remove the Community Hub button from the right toolbar.',
    defaultEnabled: true,
  },
  {
    id: 'hide-sidebar',
    name: 'Hide Sidebar',
    description: 'Hide the right watchlist/details sidebar and give the chart more room.',
    defaultEnabled: false,
  },
];

export function getPlugin(id: string): PanelPlugin | undefined {
  return PLUGINS.find((plugin) => plugin.id === id);
}

export function isBuiltinPluginId(id: string): boolean {
  return PLUGINS.some((plugin) => plugin.id === id);
}
