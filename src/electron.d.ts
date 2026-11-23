declare module 'electron' {
  export const contextBridge: {
    exposeInMainWorld(key: string, api: unknown): void;
  };

  export const webFrame: {
    executeJavaScript(code: string): Promise<unknown>;
    insertCSS(css: string): string;
  };
}
