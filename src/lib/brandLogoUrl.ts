/** Path served from `public/logo.png` (use for `<img src>` in the SPA). */
export const brandLogoSrc = `${import.meta.env.BASE_URL}logo.png`;

/** Absolute URL to the clinic logo (works in print popups and the main app). */
export function brandLogoUrl(): string {
  return new URL(brandLogoSrc, window.location.href).href;
}
