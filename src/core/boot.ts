/**
 * This function is serialized with Function.toString() and evaluated in the
 * page's main world before the app's own inline scripts run. It must remain
 * completely self-contained: no imports, no outer-scope references.
 */
export interface BootSettings {
  adblock: boolean;
  disableAi: boolean;
  privacy: boolean;
  privacyHosts: string[];
}

export interface BootMeta {
  version: string;
  at: number;
}

export function installBootHooks(settings: BootSettings, meta: BootMeta): void {
  const w = window as unknown as Record<string, unknown>;

  if (w.__TVMOD_BOOT__) {
    w.__TVMOD_ACTIVE__ = {
      version: meta.version,
      at: Date.now(),
      boot: true,
    };
    return;
  }

  w.__TVMOD_BOOT__ = true;
  w.__TVMOD_BOOT_VERSION__ = meta.version;
  w.__TVMOD_SETTINGS__ = { ...settings };
  w.__TVMOD_ACTIVE__ = {
    version: meta.version,
    at: Date.now(),
    boot: true,
  };

  const promoFlagPattern =
    /^(black_friday|cyber_monday|show_featured_ipo|broker_side_promotion|paper_competition_banner|paper_community_contests_banner|referral_promo|coupon_notification|three_month_offer|promo_)/i;

  const isPromoFlag = (key: string): boolean => promoFlagPattern.test(key);

  const aiFlagPattern = /^enable_ai_copilot/i;
  const privacyFlagPattern =
    /^(adwords-analytics|trading_general_events_ga_tracking|trading_general_events_snowplow_tracking)$/i;

  const lockedObjects = new WeakSet<object>();

  const lockAvailableOffers = (value: unknown): unknown => {
    if (!settings.adblock) return value;
    if (!value || typeof value !== 'object') return value;
    const user = value as Record<string, unknown>;

    try {
      user.available_offers = {};
    } catch {
      // Ignore frozen objects; the DOM layer still handles the UI.
    }

    if (lockedObjects.has(user)) return value;
    lockedObjects.add(user);

    try {
      Object.defineProperty(user, 'available_offers', {
        configurable: true,
        enumerable: true,
        get() {
          return {};
        },
        set() {
          // Offers are intentionally ignored while Adblock is enabled.
        },
      });
    } catch {
      // Ignore.
    }

    return value;
  };

  const filterInitData = (value: unknown): unknown => {
    if (!settings.adblock) return value;
    if (!value || typeof value !== 'object') return value;
    const data = value as Record<string, unknown>;

    if (lockedObjects.has(data)) return value;
    lockedObjects.add(data);

    try {
      delete data.offerButtonInfo;
      delete data.offer_button_info;
    } catch {
      // Ignore.
    }

    try {
      Object.defineProperty(data, 'offerButtonInfo', {
        configurable: true,
        enumerable: false,
        get() {
          return undefined;
        },
        set() {
          // Ignore late offer-button updates.
        },
      });
    } catch {
      // Ignore.
    }

    return value;
  };

  const filterShopConf = (value: unknown): unknown => {
    if (!settings.adblock) return value;
    if (!value || typeof value !== 'object') return value;
    const shop = value as Record<string, unknown>;

    if (lockedObjects.has(shop)) return value;
    lockedObjects.add(shop);

    try {
      shop.offers = [];
      Object.defineProperty(shop, 'offers', {
        configurable: true,
        enumerable: true,
        get() {
          return [];
        },
        set() {
          // Ignore late offer updates.
        },
      });
    } catch {
      // Ignore.
    }

    return value;
  };

  const shouldDisableFlag = (key: string): boolean =>
    (settings.adblock &&
      (isPromoFlag(key) ||
        key === 'enable_ad_block_detect' ||
        key === 'enable_prof_popup_free')) ||
    (settings.disableAi && aiFlagPattern.test(key)) ||
    (settings.privacy &&
      (privacyFlagPattern.test(key) || key === 'enable_ad_block_detect'));

  const filterFeatureToggles = (value: unknown): unknown => {
    if (!settings.adblock && !settings.disableAi && !settings.privacy) {
      return value;
    }
    if (!value || typeof value !== 'object') return value;
    const toggles = value as Record<string, unknown>;

    for (const key of Object.keys(toggles)) {
      if (!shouldDisableFlag(key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(toggles, key);
      if (descriptor?.get) continue;

      try {
        Object.defineProperty(toggles, key, {
          configurable: true,
          enumerable: true,
          get() {
            return 0;
          },
          set() {
            // Promo feature flags stay disabled.
          },
        });
      } catch {
        try {
          toggles[key] = 0;
        } catch {
          // Ignore.
        }
      }
    }

    return value;
  };

  if (
    settings.adblock &&
    typeof MutationObserver !== 'undefined' &&
    typeof document !== 'undefined'
  ) {
    const upgradeText =
      /Analyze markets in TradingView Desktop|full power of TradingView Desktop|Link symbols across tabs/i;
    const upgradeAttr = 'data-tvmod-upgrade';
    let upgradeScheduled = false;

    const tagUpgradeModal = (start: Element | null): void => {
      if (!start || start === document.body || start === document.documentElement) {
        return;
      }
      if (start.closest(`[${upgradeAttr}]`)) return;
      const startText = start.textContent ?? '';
      if (startText.length > 4000) return;
      if (!upgradeText.test(startText)) return;

      let node: Element | null = start;
      let target: Element = start;
      let overlay: Element | null = null;

      for (let depth = 0; depth < 12 && node; depth += 1) {
        if (node === document.body || node === document.documentElement) break;
        const className =
          typeof node.className === 'string' ? node.className : '';
        const role = node.getAttribute('role');
        const ariaModal = node.getAttribute('aria-modal');

        if (
          role === 'dialog' ||
          role === 'alertdialog' ||
          ariaModal === 'true' ||
          /modal|overlay|paywall|upgrade|backdrop/i.test(className)
        ) {
          target = node;
        }

        try {
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          const textLength = (node.textContent ?? '').length;
          const safeOverlay =
            !/layout|chart|app|workspace/i.test(className) &&
            textLength <= 4000 &&
            node.childElementCount <= 12;
          if (
            safeOverlay &&
            (style.position === 'fixed' || style.position === 'absolute') &&
            rect.width >= innerWidth * 0.6 &&
            rect.height >= innerHeight * 0.5
          ) {
            overlay = node;
          }
        } catch {
          // Ignore layout failures.
        }

        node = node.parentElement;
      }

      (overlay ?? target).setAttribute(upgradeAttr, '1');
    };

    const inspectUpgradeNode = (node: Node | null): void => {
      if (!node) return;
      const element =
        node.nodeType === Node.ELEMENT_NODE
          ? (node as Element)
          : node.parentElement;
      tagUpgradeModal(element);
    };

    const scheduleUpgradeCheck = (): void => {
      if (upgradeScheduled) return;
      upgradeScheduled = true;
      setTimeout(() => {
        upgradeScheduled = false;
        if (document.querySelector(`[${upgradeAttr}]`)) return;
        for (const candidate of document.querySelectorAll(
          '[role="dialog"], [role="alertdialog"], [aria-modal="true"], [class*="modal"], [class*="Modal"], [class*="overlay"], [class*="Overlay"], [class*="paywall"], [class*="Paywall"], [class*="upgrade"], [class*="Upgrade"]'
        )) {
          tagUpgradeModal(candidate);
        }
      }, 150);
    };

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'childList') {
          for (const node of record.addedNodes) inspectUpgradeNode(node);
        } else if (record.type === 'characterData') {
          inspectUpgradeNode(record.target.parentElement);
        }
      }
      scheduleUpgradeCheck();
    });

    const startUpgradeObserver = (): void => {
      const root = document.documentElement;
      if (!root) {
        document.addEventListener('DOMContentLoaded', startUpgradeObserver, {
          once: true,
        });
        return;
      }
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      scheduleUpgradeCheck();
      w.__TVMOD_UPGRADE_OBSERVER__ = observer;
    };

    startUpgradeObserver();
  }

  if (settings.privacy) {
    try {
      const blockedHosts = settings.privacyHosts;

      const blocked = (input: unknown): boolean => {
        try {
          const raw =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.toString()
                : (input as { url?: unknown })?.url;
          if (typeof raw !== 'string') return false;
          const parsed = new URL(raw, location.href);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return false;
          }
          const host = parsed.hostname.toLowerCase();
          return blockedHosts.some(
            (entry) => host === entry || host.endsWith('.' + entry)
          );
        } catch {
          return false;
        }
      };

      const countBlocked = (): void => {
        const current = Number(w.__TVMOD_PRIVACY_BLOCKED__ ?? 0);
        w.__TVMOD_PRIVACY_BLOCKED__ = current + 1;
      };

      const nativeFetch = w.fetch;
      if (typeof nativeFetch === 'function') {
        w.fetch = function (
          this: unknown,
          input: RequestInfo | URL,
          init?: RequestInit
        ): Promise<Response> {
          if (blocked(input)) {
            countBlocked();
            return Promise.resolve(
              new Response(null, { status: 204, statusText: 'No Content' })
            );
          }
          return (nativeFetch as typeof fetch).call(this, input, init);
        } as typeof fetch;
      }

      const NativeXhr = w.XMLHttpRequest as typeof XMLHttpRequest | undefined;
      if (NativeXhr?.prototype) {
        const originalOpen = NativeXhr.prototype.open;
        const originalSend = NativeXhr.prototype.send;

        NativeXhr.prototype.open = function (
          this: XMLHttpRequest,
          method: string,
          url: string | URL,
          async?: boolean,
          username?: string | null,
          password?: string | null
        ): void {
          const xhr = this as XMLHttpRequest & { __tvmodBlocked?: boolean };
          if (blocked(url)) {
            xhr.__tvmodBlocked = true;
            countBlocked();
            return;
          }
          xhr.__tvmodBlocked = false;
          return originalOpen.call(
            this,
            method,
            url,
            async ?? true,
            username ?? null,
            password ?? null
          );
        } as typeof XMLHttpRequest.prototype.open;

        NativeXhr.prototype.send = function (
          this: XMLHttpRequest,
          body?: Document | XMLHttpRequestBodyInit | null
        ): void {
          const xhr = this as XMLHttpRequest & { __tvmodBlocked?: boolean };
          if (xhr.__tvmodBlocked) return;
          return originalSend.call(this, body);
        };
      }

      const beacon = navigator.sendBeacon?.bind(navigator);
      if (beacon) {
        navigator.sendBeacon = (url: string | URL, data?: BodyInit | null): boolean => {
          if (blocked(url)) {
            countBlocked();
            return false;
          }
          return beacon(url, data);
        };
      }
    } catch (error) {
      w.__TVMOD_PRIVACY_ERROR__ = String(error);
    }
  }

  const errors: string[] = [];

  const trap = (name: string, filter: (value: unknown) => unknown): void => {
    try {
      let current = w[name];
      if (current !== undefined) current = filter(current);

      Object.defineProperty(w, name, {
        configurable: true,
        enumerable: true,
        get() {
          return current;
        },
        set(next: unknown) {
          try {
            current = filter(next);
          } catch {
            current = next;
          }
        },
      });
    } catch (error) {
      errors.push(`${name}: ${String(error)}`);
    }
  };

  trap('initData', filterInitData);
  trap('user', lockAvailableOffers);
  trap('shopConf', filterShopConf);
  trap('featureToggleState', filterFeatureToggles);

  if (errors.length > 0) {
    w.__TVMOD_TRAP_ERRORS__ = errors;
  }

  if (settings.adblock || settings.disableAi || settings.privacy) {
    w.__TVMOD_BOOT_INTERVAL__ = setInterval(() => {
      try {
        if (w.initData) filterInitData(w.initData);
        if (w.user) lockAvailableOffers(w.user);
        if (w.shopConf) filterShopConf(w.shopConf);
        if (w.featureToggleState) filterFeatureToggles(w.featureToggleState);
      } catch {
        // Ignore late page mutations.
      }
    }, 2000);
  }

  w.__TVMOD_BOOT_READY__ = true;
}
