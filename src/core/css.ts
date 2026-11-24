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

html[data-tvmod-hide-right-toolbar="1"] [data-name="right-toolbar"],
html[data-tvmod-focus="1"] [data-name="right-toolbar"] {
  display: none !important;
}

html[data-tvmod-hide-watchlist="1"] [class*="widgetbar-widget-watchlist"] {
  display: none !important;
}

html[data-tvmod-hide-details="1"] [class*="widgetbar-widget-detail"] {
  display: none !important;
}

html[data-tvmod-hide-watchlist="1"] [class*="widgetbar-widget-detail"],
html[data-tvmod-hide-details="1"] [class*="widgetbar-widget-watchlist"] {
  height: 100% !important;
  flex: 1 1 auto !important;
}

html[data-tvmod-hide-bottom-controls="1"] .chart-controls-bar,
html[data-tvmod-focus="1"] .chart-controls-bar {
  display: none !important;
}

html[data-tvmod-hide-bottom-controls="1"] .chart-container,
html[data-tvmod-focus="1"] .chart-container {
  height: 100% !important;
}

html[data-tvmod-sidebar-collapsed="1"][data-tvmod-hide-right-toolbar="1"] .layout__area--right,
html[data-tvmod-sidebar-collapsed="1"][data-tvmod-focus="1"] .layout__area--right {
  display: none !important;
}

html[data-tvmod-sidebar-collapsed="1"][data-tvmod-hide-right-toolbar="1"] .layout__area--center,
html[data-tvmod-sidebar-collapsed="1"][data-tvmod-focus="1"] .layout__area--center {
  width: calc(100% - var(--tvmod-center-left, 56px)) !important;
}

html[data-tvmod-sidebar-collapsed="1"][data-tvmod-hide-right-toolbar="1"] .chart-container,
html[data-tvmod-sidebar-collapsed="1"][data-tvmod-focus="1"] .chart-container {
  width: 100% !important;
}

html[data-tvmod-hide-toolbar-extras="1"] [data-name="object_tree"],
html[data-tvmod-hide-toolbar-extras="1"] [data-name="screener-dialog-button"],
html[data-tvmod-hide-toolbar-extras="1"] [data-name="pine-screener-dialog-button"],
html[data-tvmod-hide-toolbar-extras="1"] [data-name="pine-dialog-button"],
html[data-tvmod-hide-toolbar-extras="1"] [data-name="calendar-dialog-button"],
html[data-tvmod-hide-toolbar-extras="1"] [data-name="notifications-button"],
html[data-tvmod-hide-toolbar-extras="1"] [data-name="chats-button"],
html[data-tvmod-hide-toolbar-extras="1"] [data-name="help-button"] {
  display: none !important;
}

html[data-tvmod-hide-trade-buttons="1"] [data-name="buy-sell-buttons"],
html[data-tvmod-hide-trade-buttons="1"] [data-name="buy-order-button"],
html[data-tvmod-hide-trade-buttons="1"] [data-name="sell-order-button"] {
  display: none !important;
}

html[data-tvmod-reduce-motion="1"] *,
html[data-tvmod-reduce-motion="1"] *::before,
html[data-tvmod-reduce-motion="1"] *::after {
  animation-duration: 0.001ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.001ms !important;
  scroll-behavior: auto !important;
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
