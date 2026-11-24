# Privacy Shield

Privacy Shield is an optional TVMod plugin. It is **off by default** and requires a page reload when toggled.

## What it does

- Blocks requests to a curated list of advertising, analytics, and session-replay hosts.
- Disables known tracking feature flags:
  - `adwords-analytics`
  - `trading_general_events_ga_tracking`
  - `trading_general_events_snowplow_tracking`
- Hides cookie-consent toast groups.
- Removes tracking parameters from clicked links:
  - `utm_*`
  - `gclid`, `fbclid`, `msclkid`, `dclid`, `yclid`
  - `mc_cid`, `mc_eid`
  - `igshid`, `twclid`

## Blocked hosts

```text
google-analytics.com
googletagmanager.com
doubleclick.net
googleadservices.com
googlesyndication.com
connect.facebook.net
amazon-adsystem.com
adsrvr.org
criteo.com
criteo.net
taboola.com
outbrain.com
scorecardresearch.com
quantserve.com
quantcount.com
hotjar.com
fullstory.com
segment.io
segment.com
mixpanel.com
krxd.net
bluekai.com
exelator.com
```

Subdomains are blocked by suffix. Lookalike domains are not blocked.

## Deliberately not blocked

- TradingView chart data and history hosts
- `pushstream.tradingview.com`
- Authentication and account hosts
- TradingView API endpoints
- Paywall, trial, or entitlement requests

TVMod does not intercept TLS, modify the system proxy, or perform packet filtering.

## Implementation

The boot script runs in the page's main world before application scripts:

- wraps `fetch`
- wraps `XMLHttpRequest.prototype.open` / `send`
- wraps `navigator.sendBeacon`

Blocked requests are short-circuited with HTTP 204 for `fetch`, or dropped for XHR/beacon. `window.__TVMOD_PRIVACY_BLOCKED__` counts blocked requests for diagnostics.

Feature flags are filtered through the existing `featureToggleState` trap. Cookie toast groups and tracking links are handled in the DOM layer.

## Limitations

- Best-effort blocking only.
- New or first-party tracking endpoints may not be in the list.
- Some services use WebSockets or images instead of fetch/XHR/beacon.
- Site updates can change cookie UI selectors.
- Disabling Privacy Shield requires a reload to restore unwrapped networking APIs.
- Privacy Shield can overlap with Adblock; enabling both is supported.
