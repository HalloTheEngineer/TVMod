declare module 'electron' {
  export const contextBridge: {
    exposeInMainWorld(key: string, api: unknown): void;
  };

  export const ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  };

  export const webFrame: {
    executeJavaScript(code: string): Promise<unknown>;
    insertCSS(css: string): string;
    removeInsertedCSS(key: string): void;
  };
}
