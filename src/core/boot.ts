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
      (isPromoFlag(key) || key === 'enable_ad_block_detect')) ||
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
          if (
            host === 'tradingview.com' ||
            host.endsWith('.tradingview.com') ||
            host.endsWith('.tradingviewcdn.com') ||
            host.endsWith('.tvcdn.com')
          ) {
            return false;
          }
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
          ...args: Parameters<typeof originalOpen>
        ): void {
          const xhr = this as XMLHttpRequest & { __tvmodBlocked?: boolean };
          if (blocked(args[1])) {
            xhr.__tvmodBlocked = true;
            countBlocked();
            return;
          }
          xhr.__tvmodBlocked = false;
          return originalOpen.apply(this, args);
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
