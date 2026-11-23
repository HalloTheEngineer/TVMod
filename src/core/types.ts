export interface Settings {
  noPromos: boolean;
  cleanUi: boolean;
  hideSidebar: boolean;
}

export type SettingsKey = keyof Settings;

export const DEFAULT_SETTINGS: Settings = {
  noPromos: true,
  cleanUi: true,
  hideSidebar: false,
};

export const SETTINGS_KEY = 'tvmod.settings.v1';

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
