/**
 * This function is serialized with Function.toString() and evaluated in the
 * page's main world before the app's own inline scripts run. It must remain
 * completely self-contained: no imports, no outer-scope references.
 */
export interface BootSettings {
  noPromos: boolean;
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

  const filterInitData = (value: unknown): unknown => {
    if (!settings.noPromos) return value;
    if (!value || typeof value !== 'object') return value;
    const data = value as Record<string, unknown>;
    try {
      delete data.offerButtonInfo;
      delete data.offer_button_info;
    } catch {
      // Ignore frozen objects; the DOM layer still handles the UI.
    }
    return value;
  };

  const filterUser = (value: unknown): unknown => {
    if (!settings.noPromos) return value;
    if (!value || typeof value !== 'object') return value;
    const user = value as Record<string, unknown>;
    try {
      user.available_offers = {};
    } catch {
      // Ignore frozen objects.
    }
    return value;
  };

  const filterShopConf = (value: unknown): unknown => {
    if (!settings.noPromos) return value;
    if (!value || typeof value !== 'object') return value;
    const shop = value as Record<string, unknown>;
    try {
      shop.offers = [];
    } catch {
      // Ignore frozen objects.
    }
    return value;
  };

  const filterFeatureToggles = (value: unknown): unknown => {
    if (!settings.noPromos) return value;
    if (!value || typeof value !== 'object') return value;
    const toggles = value as Record<string, unknown>;
    for (const key of Object.keys(toggles)) {
      if (isPromoFlag(key)) {
        try {
          toggles[key] = 0;
        } catch {
          // Ignore individual failures.
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
  trap('user', filterUser);
  trap('shopConf', filterShopConf);
  trap('featureToggleState', filterFeatureToggles);

  if (errors.length > 0) {
    w.__TVMOD_TRAP_ERRORS__ = errors;
  }

  w.__TVMOD_BOOT_READY__ = true;
}
