export const PAGE_CSS = `
html[data-tvmod-adblock="1"] [class*="desktopUpgrade-"],
html[data-tvmod-adblock="1"] [class*="mobileUpgrade-"],
html[data-tvmod-adblock="1"] [data-tvmod-promo="1"] {
  display: none !important;
}

html[data-tvmod-privacy="1"] [data-tvmod-cookie="1"] {
  display: none !important;
}

html[data-tvmod-hide-ai="1"] [data-name="ai-copilot-area"] {
  display: none !important;
}

[data-tvmod-filtered="1"] {
  display: none !important;
}

html[data-tvmod-focus="1"] [data-name="right-toolbar"] {
  display: none !important;
}

html[data-tvmod-focus="1"] .chart-controls-bar {
  display: none !important;
}

html[data-tvmod-focus="1"] .chart-container {
  height: 100% !important;
}

html[data-tvmod-sidebar-collapsed="1"][data-tvmod-focus="1"] .layout__area--right {
  display: none !important;
}

html[data-tvmod-sidebar-collapsed="1"][data-tvmod-focus="1"] .layout__area--center {
  width: calc(100% - var(--tvmod-center-left, 56px)) !important;
}

html[data-tvmod-sidebar-collapsed="1"][data-tvmod-focus="1"] .chart-container {
  width: 100% !important;
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
  '[data-name*="charting-ad"]',
  '[data-name*="toast-group-expand-button"][data-name*="offer"]',
].join(', ');
