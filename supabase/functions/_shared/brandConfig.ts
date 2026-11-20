/**
 * The product's public identity used by distribution and embeds (email, RSS, widget, push).
 * Modules read these instead of writing the address or sender into their own code, so a
 * future product can pass its own values without touching module logic.
 */
export const SITE_URL = "https://curatr.pro";
export const SENDER_DOMAIN = "curatr.pro";

/** "Feed Name <noreply@curatr.pro>": the feed's own name over the product's sending address. */
export const senderFor = (displayName: string): string => `${displayName} <noreply@${SENDER_DOMAIN}>`;

/** Default contact for web-push (VAPID) when no VAPID_SUBJECT is configured. */
export const DEFAULT_VAPID_SUBJECT = `mailto:notifications@${SENDER_DOMAIN}`;
