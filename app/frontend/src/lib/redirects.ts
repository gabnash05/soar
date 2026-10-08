export const getSafeRedirect = (target: string): string | null => {
  try {
    const url = new URL(target, window.location.origin);
    if (url.origin !== window.location.origin && url.protocol !== 'https:') return null;
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
};

export const navigateToHostedCheckout = (target: string) => {
  const safe = getSafeRedirect(target);
  if (!safe) throw new Error('The checkout link was rejected because it is not a safe HTTP(S) URL.');
  window.location.assign(safe);
};
