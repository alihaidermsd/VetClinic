/** Absolute URL to the clinic logo in `public/logo.png` (works in print popups and the main app). */
export function brandLogoUrl(): string {
  return new URL(`${import.meta.env.BASE_URL}logo.png`, window.location.href).href;
}
