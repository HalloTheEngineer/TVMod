export const PRIVACY_HOSTS = [
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'googleadservices.com',
  'googlesyndication.com',
  'connect.facebook.net',
  'amazon-adsystem.com',
  'adsrvr.org',
  'criteo.com',
  'criteo.net',
  'taboola.com',
  'outbrain.com',
  'scorecardresearch.com',
  'quantserve.com',
  'quantcount.com',
  'hotjar.com',
  'fullstory.com',
  'segment.io',
  'segment.com',
  'mixpanel.com',
  'krxd.net',
  'bluekai.com',
  'exelator.com',
];

export const TRACKING_PARAMS = [
  'gclid',
  'fbclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'twclid',
  'yclid',
  'dclid',
];

export function isBlockedPrivacyHost(
  input: string | URL,
  hosts: string[] = PRIVACY_HOSTS
): boolean {
  try {
    const url = input instanceof URL ? input : new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return hosts.some(
      (blocked) => host === blocked || host.endsWith(`.${blocked}`)
    );
  } catch {
    return false;
  }
}

export function stripTrackingParams(input: string | URL): string {
  try {
    const url = input instanceof URL ? new URL(input.toString()) : new URL(input);
    let changed = false;

    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || TRACKING_PARAMS.includes(key.toLowerCase())) {
        url.searchParams.delete(key);
        changed = true;
      }
    }

    return changed ? url.toString() : input.toString();
  } catch {
    return input.toString();
  }
}
