export type PluginPermission = 'dom' | 'style' | 'storage' | 'events';

export type PluginCategory =
  | 'ads'
  | 'interface'
  | 'accessibility'
  | 'tools'
  | 'other';

export const PLUGIN_CATEGORY_ORDER: PluginCategory[] = [
  'ads',
  'interface',
  'accessibility',
  'tools',
  'other',
];

export const PLUGIN_CATEGORY_LABELS: Record<PluginCategory, string> = {
  ads: 'Ads & promotions',
  interface: 'Interface',
  accessibility: 'Accessibility',
  tools: 'Tools',
  other: 'Other',
};

export function isPluginCategory(value: string): value is PluginCategory {
  return (PLUGIN_CATEGORY_ORDER as string[]).includes(value);
}

export type PluginSettingValue = boolean | string | number;
export type PluginSettings = Record<string, PluginSettingValue>;

interface PluginSettingBase {
  key: string;
  name: string;
  description?: string;
}

export interface PluginBooleanSetting extends PluginSettingBase {
  type: 'boolean';
  default: boolean;
}

export interface PluginStringSetting extends PluginSettingBase {
  type: 'string';
  default: string;
  placeholder?: string;
}

export interface PluginNumberSetting extends PluginSettingBase {
  type: 'number';
  default: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface PluginSelectOption {
  value: string;
  label: string;
}

export interface PluginSelectSetting extends PluginSettingBase {
  type: 'select';
  default: string;
  options: PluginSelectOption[];
}

export type PluginSettingDefinition =
  | PluginBooleanSetting
  | PluginStringSetting
  | PluginNumberSetting
  | PluginSelectSetting;

export interface ExternalPluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  main: string;
  defaultEnabled?: boolean;
  permissions?: PluginPermission[];
  settings?: PluginSettingDefinition[];
  category?: PluginCategory;
}

export interface EmbeddedPlugin {
  manifest: ExternalPluginManifest;
  source: string;
}

export interface PanelPlugin {
  id: string;
  name: string;
  description: string;
  defaultEnabled: boolean;
  requiresReload?: boolean;
  external?: boolean;
  category: PluginCategory;
  version?: string;
  author?: string;
  permissions?: PluginPermission[];
  settings?: PluginSettingDefinition[];
}

export const ALLOWED_PERMISSIONS: PluginPermission[] = [
  'dom',
  'style',
  'storage',
  'events',
];

export function isPluginPermission(value: string): value is PluginPermission {
  return (ALLOWED_PERMISSIONS as string[]).includes(value);
}
