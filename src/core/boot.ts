/**
 * This function is serialized with Function.toString() and evaluated in the
 * page's main world before the app's own inline scripts run. It must remain
 * completely self-contained: no imports, no outer-scope references.
 */
export interface BootSettings {
  adblock: boolean;
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

  const lockedObjects = new WeakSet<object>();

  const lockAvailableOffers = (value: unknown): unknown => {
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

  const filterFeatureToggles = (value: unknown): unknown => {
    if (!settings.adblock) return value;
    if (!value || typeof value !== 'object') return value;
    const toggles = value as Record<string, unknown>;

    for (const key of Object.keys(toggles)) {
      if (!isPromoFlag(key)) continue;
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

  if (settings.adblock) {
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
