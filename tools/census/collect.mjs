#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaults = {
  url: 'https://www.tradingview.com/chart/',
  baseline: path.join(root, 'tools/census/baseline.json'),
  report: path.join(root, 'tools/census/report.md'),
  json: path.join(root, 'tools/census/report.json'),
  timeout: 45,
};

function parseArgs(argv) {
  const options = { ...defaults, update: false };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--update') options.update = true;
    else if (value === '--url') options.url = argv[++i];
    else if (value === '--baseline') options.baseline = path.resolve(argv[++i]);
    else if (value === '--report') options.report = path.resolve(argv[++i]);
    else if (value === '--json') options.json = path.resolve(argv[++i]);
    else if (value === '--timeout') options.timeout = Number(argv[++i]);
    else if (value === '--help') {
      console.log(`Usage: npm run census -- [options]\n
  --update          write tools/census/baseline.json
  --url <url>       page to capture (default: TradingView chart)
  --timeout <sec>   navigation/chart wait budget
  --baseline <path> baseline JSON path
  --report <path>   markdown report path
  --json <path>     JSON report path`);
      process.exit(0);
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
if (!Number.isFinite(options.timeout) || options.timeout < 10) {
  options.timeout = defaults.timeout;
}

const hash = (value) =>
  crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);

const setDiff = (left, right) =>
  left.filter((item) => !right.includes(item)).sort();

// Promo, toast, navigation, and experiment surfaces come and go without
// indicating a breaking change for the core chart. They are still reported,
// but do not fail the census.
const VOLATILE_DATA_NAME =
  /(toast|promo|referral|coupon|offer|upgrade|black[-_]?friday|cyber[-_]?monday|sale|discount|banner|notification|chat|community|ai-copilot|partner|broker|news|ideas)/i;

async function capture() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'en-US',
      timezoneId: 'UTC',
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    await page.goto(options.url, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeout * 1000,
    });

    let chartReady = false;
    try {
      await page.waitForFunction(
        () =>
          typeof window.TradingView === 'object' &&
          !!document.querySelector('[data-name="pane-canvas"]'),
        null,
        { timeout: options.timeout * 1000 }
      );
      chartReady = true;
    } catch {
      // Capture what loaded; the caller will report the missing chart surface.
    }

    await page.waitForTimeout(2500);

    const snapshot = await page.evaluate(() => {
      const values = (selector) =>
        [...new Set([...document.querySelectorAll(selector)]
          .map((element) => element.getAttribute('data-name'))
          .filter(Boolean))].sort();

      return {
        href: location.href,
        title: document.title,
        chartReady: false,
        dataNames: values('[data-name]'),
        initDataKeys: window.initData ? Object.keys(window.initData).sort() : [],
        tradingViewKeys: window.TradingView
          ? Object.keys(window.TradingView).sort()
          : [],
        tvdKeys: window.TVD ? Object.keys(window.TVD).sort() : [],
        tvSettingsKeys: window.TVSettings
          ? Object.keys(window.TVSettings).sort()
          : [],
        featureToggleKeys: window.featureToggleState
          ? Object.keys(window.featureToggleState).sort()
          : [],
        enabledFeatureSets: Array.isArray(window.__initialEnabledFeaturesets)
          ? [...window.__initialEnabledFeaturesets].sort()
          : null,
        disabledFeatureSets: Array.isArray(window.__initialDisabledFeaturesets)
          ? [...window.__initialDisabledFeaturesets].sort()
          : null,
        scriptCount: [...document.scripts].filter((script) => script.src).length,
        webpackChunk: typeof self.webpackChunktradingview !== 'undefined',
      };
    });

    snapshot.chartReady = chartReady;
    snapshot.url = options.url;
    snapshot.capturedAt = new Date().toISOString();
    snapshot.userAgent = await page.evaluate(() => navigator.userAgent);
    snapshot.featureToggleCount = snapshot.featureToggleKeys.length;
    snapshot.featureToggleHash = hash(snapshot.featureToggleKeys.join('\n'));
    delete snapshot.featureToggleKeys;

    return snapshot;
  } finally {
    await browser?.close();
  }
}

function compare(baseline, current) {
  const missingDataNamesAll = setDiff(
    baseline.dataNames ?? [],
    current.dataNames ?? []
  );
  const missingDataNames = missingDataNamesAll.filter(
    (name) => !VOLATILE_DATA_NAME.test(name)
  );
  const volatileMissingDataNames = missingDataNamesAll.filter((name) =>
    VOLATILE_DATA_NAME.test(name)
  );
  const addedDataNames = setDiff(current.dataNames ?? [], baseline.dataNames ?? []);
  const missingInitData = setDiff(
    baseline.initDataKeys ?? [],
    current.initDataKeys ?? []
  );
  const missingTradingView = setDiff(
    baseline.tradingViewKeys ?? [],
    current.tradingViewKeys ?? []
  );
  const missingTvd = setDiff(baseline.tvdKeys ?? [], current.tvdKeys ?? []);
  const missingTvSettings = setDiff(
    baseline.tvSettingsKeys ?? [],
    current.tvSettingsKeys ?? []
  );

  const warnings = [];
  if (
    baseline.featureToggleHash &&
    baseline.featureToggleHash !== current.featureToggleHash
  ) {
    warnings.push(
      `feature toggle key set changed (${baseline.featureToggleCount} -> ${current.featureToggleCount})`
    );
  }
  if (baseline.scriptCount !== current.scriptCount) {
    warnings.push(
      `script count changed (${baseline.scriptCount} -> ${current.scriptCount})`
    );
  }
  if (volatileMissingDataNames.length > 0) {
    warnings.push(
      `${volatileMissingDataNames.length} optional/seasonal data-name selectors disappeared`
    );
  }

  const drift =
    !current.chartReady ||
    missingDataNames.length > 0 ||
    missingInitData.length > 0 ||
    missingTradingView.length > 0 ||
    missingTvd.length > 0 ||
    missingTvSettings.length > 0;

  return {
    drift,
    chartReady: current.chartReady,
    missingDataNames,
    volatileMissingDataNames,
    addedDataNames,
    missingInitData,
    missingTradingView,
    missingTvd,
    missingTvSettings,
    warnings,
  };
}

function markdownReport(baseline, current, result, updated) {
  const lines = [
    '# TVMod compatibility census',
    '',
    `- Captured: ${current.capturedAt}`,
    `- URL: ${current.url}`,
    `- Title: ${current.title || '(none)'}`,
    `- Chart ready: ${current.chartReady ? 'yes' : 'no'}`,
    `- Status: **${result.drift ? 'DRIFT' : 'OK'}**`,
    '',
  ];

  if (updated) {
    lines.push('Baseline updated.', '');
  }

  const section = (title, items) => {
    if (items.length === 0) return;
    lines.push(`## ${title}`, '');
    for (const item of items.slice(0, 80)) lines.push(`- \`${item}\``);
    if (items.length > 80) lines.push(`- …and ${items.length - 80} more`);
    lines.push('');
  };

  section('Missing data-name selectors', result.missingDataNames);
  section('Missing initData keys', result.missingInitData);
  section('Missing TradingView keys', result.missingTradingView);
  section('Missing TVD keys', result.missingTvd);
  section('Missing TVSettings keys', result.missingTvSettings);

  if (result.warnings.length > 0) {
    lines.push('## Informational', '');
    for (const warning of result.warnings) lines.push(`- ${warning}`);
    if (result.volatileMissingDataNames?.length > 0) {
      lines.push(
        `- Optional/seasonal selectors: ${result.volatileMissingDataNames
          .slice(0, 30)
          .join(', ')}${result.volatileMissingDataNames.length > 30 ? ', …' : ''}`
      );
    }
    if (result.addedDataNames.length > 0) {
      lines.push(
        `- ${result.addedDataNames.length} new data-name selectors: ${result.addedDataNames
          .slice(0, 30)
          .join(', ')}${result.addedDataNames.length > 30 ? ', …' : ''}`
      );
    }
    lines.push('');
  }

  if (!result.drift) {
    lines.push('No compatibility drift detected.', '');
  }

  lines.push(
    `Baseline captured: ${baseline.capturedAt ?? 'unknown'}`,
    ''
  );

  return lines.join('\n');
}

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

async function main() {
  const current = await capture();

  if (!current.chartReady) {
    console.error('warning: the chart surface did not become ready');
  }

  if (options.update) {
    if (!current.chartReady) {
      throw new Error('refusing to write a baseline: the chart surface was not ready');
    }
    writeFile(options.baseline, `${JSON.stringify(current, null, 2)}\n`);
    const result = {
      drift: false,
      chartReady: current.chartReady,
      missingDataNames: [],
      volatileMissingDataNames: [],
      addedDataNames: [],
      missingInitData: [],
      missingTradingView: [],
      missingTvd: [],
      missingTvSettings: [],
      warnings: [],
    };
    writeFile(options.report, markdownReport(current, current, result, true));
    writeFile(options.json, `${JSON.stringify({ result, current }, null, 2)}\n`);
    console.log(`baseline updated: ${options.baseline}`);
    return;
  }

  if (!fs.existsSync(options.baseline)) {
    throw new Error(
      `baseline not found at ${options.baseline}; run "npm run census -- --update"`
    );
  }

  const baseline = JSON.parse(fs.readFileSync(options.baseline, 'utf8'));
  const result = compare(baseline, current);

  writeFile(options.report, markdownReport(baseline, current, result, false));
  writeFile(options.json, `${JSON.stringify({ result, baseline, current }, null, 2)}\n`);

  console.log(`census: ${result.drift ? 'DRIFT' : 'OK'}`);
  if (result.drift) {
    console.error(`report: ${options.report}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  console.error('If the browser is missing, run "npx playwright install chromium".');
  process.exitCode = 1;
});
