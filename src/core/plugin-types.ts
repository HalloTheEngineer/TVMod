export type PluginPermission = 'dom' | 'style' | 'storage';

export interface PluginSettingDefinition {
  key: string;
  name: string;
  description?: string;
  default: boolean;
}

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

export const ALLOWED_PERMISSIONS: PluginPermission[] = ['dom', 'style', 'storage'];

export function isPluginPermission(value: string): value is PluginPermission {
  return (ALLOWED_PERMISSIONS as string[]).includes(value);
}
