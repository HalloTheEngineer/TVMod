export type PluginPermission = 'dom' | 'style' | 'storage' | 'events';

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
