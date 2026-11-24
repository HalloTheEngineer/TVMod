export interface RegistryPluginInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  registry: string;
  installedVersion?: string;
  sourceRegistry?: string;
}

export interface RegistryListResult {
  ok: boolean;
  plugins?: RegistryPluginInfo[];
  warnings?: string[];
  error?: string;
}

export interface RegistrySource {
  name: string;
  url: string;
  addedAt?: string;
}

export interface RegistrySourcesResult {
  ok: boolean;
  sources?: RegistrySource[];
  error?: string;
}

export interface RegistryActionResult {
  ok: boolean;
  error?: string;
}

export interface RegistryKeyResult {
  ok: boolean;
  canceled?: boolean;
  name?: string;
  publicKey?: string;
  error?: string;
}

export interface RegistryReloadResult {
  ok: boolean;
  reloaded?: number[];
  error?: string;
}

export interface RegistryInstallResult {
  ok: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface RegistryClient {
  list(): Promise<RegistryListResult>;
  sources(): Promise<RegistrySourcesResult>;
  add(name: string, url: string, publicKey: string): Promise<RegistryActionResult>;
  remove(name: string): Promise<RegistryActionResult>;
  pickKey(): Promise<RegistryKeyResult>;
  install(
    id: string,
    registry?: string,
    force?: boolean,
    noReload?: boolean
  ): Promise<RegistryInstallResult>;
  reload(): Promise<RegistryReloadResult>;
}

export interface ConfigLoadResult {
  exists: boolean;
  config?: unknown;
  error?: string;
}

export interface ConfigBridge {
  load(): ConfigLoadResult;
  save(config: unknown): void;
  migrate(config: unknown): void;
  onChange(handler: (config: unknown) => void): void;
  request?(): void;
  onRequest?(handler: () => void): void;
}

export interface SettingsFocusBridge {
  consume(): boolean;
  onChange(handler: () => void): void;
}

export interface Host {
  executeJavaScript(code: string): Promise<unknown>;
  insertCSS(css: string): string;
  removeInsertedCSS(key: string): void;
  registry?: RegistryClient;
  config?: ConfigBridge;
  settingsFocus?: SettingsFocusBridge;
}
