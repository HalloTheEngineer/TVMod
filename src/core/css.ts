export const PAGE_CSS = `
html[data-tvmod-adblock="1"] [class*="desktopUpgrade-"],
html[data-tvmod-adblock="1"] [class*="mobileUpgrade-"],
html[data-tvmod-adblock="1"] [data-tvmod-promo="1"] {
  display: none !important;
}

html[data-tvmod-hide-ai="1"] [data-name="ai-copilot-area"],
html[data-tvmod-hide-community="1"] [data-name="community-hub-button"] {
  display: none !important;
}

html[data-tvmod-hide-sidebar="1"] [data-name="widgetbar-wrap"] {
  display: none !important;
}
`;

export const PROMO_CLASS_SELECTOR =
  '[class*="desktopUpgrade-"], [class*="mobileUpgrade-"]';

export const PROMO_NAME_SELECTOR = [
  '[data-name*="referral-promo"]',
  '[data-name*="coupon-notification"]',
  '[data-name*="three-month-offer"]',
  '[data-name*="toast-group-expand-button"][data-name*="offer"]',
].join(', ');
