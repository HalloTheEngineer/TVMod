export interface Host {
  executeJavaScript(code: string): Promise<unknown>;
  insertCSS(css: string): string;
  removeInsertedCSS(key: string): void;
}
