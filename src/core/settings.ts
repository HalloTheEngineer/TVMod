import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  type Settings,
  type SettingsStorage,
} from './types.js';

export function normalizeSettings(input: unknown): Settings {
  const value =
    input && typeof input === 'object' ? (input as Record<string, unknown>) : {};

  return {
    noPromos:
      typeof value.noPromos === 'boolean'
        ? value.noPromos
        : DEFAULT_SETTINGS.noPromos,
    cleanUi:
      typeof value.cleanUi === 'boolean'
        ? value.cleanUi
        : DEFAULT_SETTINGS.cleanUi,
    hideSidebar:
      typeof value.hideSidebar === 'boolean'
        ? value.hideSidebar
        : DEFAULT_SETTINGS.hideSidebar,
  };
}

export function loadSettings(storage?: SettingsStorage | null): Settings {
  try {
    const store = storage ?? (globalThis as { localStorage?: SettingsStorage }).localStorage;
    if (!store) return { ...DEFAULT_SETTINGS };
    const raw = store.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(
  settings: Settings,
  storage?: SettingsStorage | null
): boolean {
  try {
    const store = storage ?? (globalThis as { localStorage?: SettingsStorage }).localStorage;
    if (!store) return false;
    store.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
