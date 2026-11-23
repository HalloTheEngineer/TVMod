# Compatibility census

TVMod depends on the public TradingView web UI: `data-name` anchors, boot data (`initData`), and a few global handles. TradingView deploys its web app independently of the desktop wrapper, so those surfaces can change at any time.

## What is captured

`tools/census/collect.mjs` loads `https://www.tradingview.com/chart/` in headless Chromium as a guest and records:

- unique `data-name` selectors
- `window.initData` top-level keys
- `window.TradingView`, `window.TVD`, and `window.TVSettings` keys
- a hash and count of `window.featureToggleState` keys
- initial enabled/disabled feature sets
- script count, chart readiness, title, and user agent

It does not save cookies, account data, offers, chart data, or page code.

## Drift policy

The census fails when the chart did not become ready or when a baseline selector/global key is missing. New selectors, feature-toggle changes, and script-count changes are informational; they do not fail the run.

## Baseline

The committed baseline lives at `tools/census/baseline.json`. Update it only after reviewing the report and confirming that TVMod still works:

```sh
npm run census
npm run census -- --update
```

Review the baseline diff before committing. The report files `tools/census/report.md` and `report.json` are generated artifacts and are ignored by git.

## CI

`.github/workflows/census.yml` runs weekly and on manual dispatch:

- installs Chromium
- runs `npm run census`
- uploads the report artifact
- opens or comments on a `[census] TradingView UI/config drift` issue on failure
- closes that issue when the census passes again

The normal push CI does not use the network census; the scheduled workflow owns that signal.

## When drift is reported

1. Read the missing-selector/global list in the report.
2. Reproduce on the current desktop app.
3. Update `src/core/css.ts`, `src/core/dom.ts`, boot filters, or the plugin API as needed.
4. Add/adjust tests and selectors.
5. Re-run the census and update the baseline only if the new surface is intentional and supported.
