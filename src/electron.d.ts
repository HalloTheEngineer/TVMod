declare module 'electron' {
  export const contextBridge: {
    exposeInMainWorld(key: string, api: unknown): void;
  };

  export const ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
    send(channel: string, ...args: unknown[]): void;
    sendSync(channel: string, ...args: unknown[]): unknown;
    on(
      channel: string,
      listener: (event: unknown, ...args: any[]) => void
    ): void;
  };

  export const webFrame: {
    executeJavaScript(code: string): Promise<unknown>;
    insertCSS(css: string): string;
    removeInsertedCSS(key: string): void;
  };
}
