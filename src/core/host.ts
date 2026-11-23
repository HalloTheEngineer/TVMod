export interface RegistryPluginInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  registry: string;
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

export interface Host {
  executeJavaScript(code: string): Promise<unknown>;
  insertCSS(css: string): string;
  removeInsertedCSS(key: string): void;
  registry?: RegistryClient;
}
