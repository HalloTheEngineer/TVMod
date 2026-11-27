export const UPGRADE_TEXT =
  /Analyze markets in TradingView Desktop|full power of TradingView Desktop|Link symbols across tabs/i;

export const UPGRADE_MAX_TEXT = 4000;

export function isUpgradeText(text: string): boolean {
  return text.length <= UPGRADE_MAX_TEXT && UPGRADE_TEXT.test(text);
}

export function isSafeUpgradeClass(className: string): boolean {
  return !/layout|chart|app|workspace|tvmod/i.test(className);
}
