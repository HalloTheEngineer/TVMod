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
  install(
    id: string,
    registry?: string,
    force?: boolean
  ): Promise<RegistryInstallResult>;
}

export interface Host {
  executeJavaScript(code: string): Promise<unknown>;
  insertCSS(css: string): string;
  removeInsertedCSS(key: string): void;
  registryList?(): Promise<RegistryListResult>;
  registryInstall?(
    id: string,
    registry?: string,
    force?: boolean
  ): Promise<RegistryInstallResult>;
}
