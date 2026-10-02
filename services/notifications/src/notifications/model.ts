import { z } from 'zod';

export type NotificationKind = 'listing_removed' | 'review_received' | 'listing_promoted';
export type EmailKind = 'new_message' | 'listing_removed' | 'payment_receipt';
export type Locale = 'nb' | 'en' | 'so';

export interface NotificationRow {
  id: string;
  user_id: string;
  kind: NotificationKind;
  ref_id: string;
  params: Record<string, string>;
  created_at: Date;
  read_at: Date | null;
}

export interface EmailRow {
  id: string;
  user_id: string;
  kind: EmailKind;
  ref_id: string;
  params: Record<string, string>;
  status: 'pending' | 'sent' | 'skipped' | 'failed';
  attempts: number;
  next_attempt_at: Date;
  last_error: string | null;
  created_at: Date;
  sent_at: Date | null;
}

export interface Notification {
  id: string;
  kind: NotificationKind;
  /** Values for the localized text, e.g. {"title": "…"}; the client renders the message. */
  params: Record<string, string>;
  /** Where the notification leads in the web app (locale-less path). */
  link: string;
  createdAt: string;
  read: boolean;
}

export interface Preferences {
  /** E-mail me about new messages (service e-mails such as moderation are always sent). */
  emailMessages: boolean;
}

export const preferencesSchema = z.object({ emailMessages: z.boolean() }).strict();

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const LINKS: Record<NotificationKind, (row: NotificationRow) => string> = {
  listing_removed: () => '/my/listings',
  // The recipient's own trust profile, where the new review is listed.
  review_received: (row) => `/users/${row.user_id}`,
  listing_promoted: (row) => `/listings/${row.ref_id}`,
};

export function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    kind: row.kind,
    params: row.params,
    link: LINKS[row.kind](row),
    createdAt: row.created_at.toISOString(),
    read: row.read_at !== null,
  };
}

/** Keycloak's locale attribute ("no", "nb", "en", "so") to a Raadi locale. */
export function toLocale(value: string | undefined): Locale {
  if (value === 'en' || value === 'so') return value;
  return 'nb';
}

/** Exponential backoff for failed sends: 30 s, 1 min, 2 min … capped at 1 h. */
export const retryDelayMs = (attempts: number) =>
  Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1));
