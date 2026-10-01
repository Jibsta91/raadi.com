import type { EmailKind, Locale } from './model.js';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

interface Copy {
  subject: string;
  /** Paragraphs; {title} is replaced (escaped in HTML). */
  body: string[];
  action: string;
}

const footer: Record<Locale, string> = {
  nb: 'Du får denne e-posten fordi du har en konto på Raadi. Endre varslene dine her:',
  en: 'You receive this e-mail because you have a Raadi account. Change your notifications here:',
  so: 'Waxaad helaysaa iimaylkan sababtoo ah waxaad leedahay akoon Raadi. Halkan ka beddel ogeysiisyadaada:',
};

/**
 * Deliberately short: e-mails never contain message text or contact details,
 * only a link back to the signed-in app (GDPR, phishing resistance).
 */
const COPY: Record<EmailKind, Record<Locale, Copy>> = {
  new_message: {
    nb: {
      subject: 'Du har fått en ny melding på Raadi',
      body: ['Hei!', 'Du har fått en ny melding om en annonse på Raadi.'],
      action: 'Les og svar',
    },
    en: {
      subject: 'You have a new message on Raadi',
      body: ['Hi!', 'Someone sent you a message about a listing on Raadi.'],
      action: 'Read and reply',
    },
    so: {
      subject: 'Fariin cusub ayaa kuu timid Raadi',
      body: ['Salaan!', 'Qof ayaa kuu soo diray fariin ku saabsan xayeysiis Raadi ah.'],
      action: 'Akhri oo ka jawaab',
    },
  },
  listing_removed: {
    nb: {
      subject: 'Annonsen din er fjernet',
      body: [
        'Hei!',
        'Annonsen «{title}» er fjernet av Raadis moderatorer fordi den ikke følger reglene for markedsplassen.',
      ],
      action: 'Se annonsene dine',
    },
    en: {
      subject: 'Your listing was removed',
      body: [
        'Hi!',
        'Your listing "{title}" was removed by Raadi\'s moderators because it does not follow the marketplace rules.',
      ],
      action: 'See your listings',
    },
    so: {
      subject: 'Xayeysiiskaaga waa la saaray',
      body: [
        'Salaan!',
        'Xayeysiiskaaga "{title}" waxaa saaray maamulayaasha Raadi sababtoo ah ma raacayo xeerarka suuqa.',
      ],
      action: 'Arag xayeysiisyadaada',
    },
  },
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function renderEmail(
  kind: EmailKind,
  locale: Locale,
  params: Record<string, string>,
  links: { action: string; settings: string },
): RenderedEmail {
  const copy = COPY[kind][locale];
  const fill = (s: string, escape: (v: string) => string) =>
    s.replace(/\{(\w+)\}/g, (_, k: string) => escape(params[k] ?? ''));
  const text = [
    ...copy.body.map((p) => fill(p, (v) => v)),
    `${copy.action}: ${links.action}`,
    '--',
    `${footer[locale]} ${links.settings}`,
  ].join('\n\n');
  const html = [
    '<!doctype html><html><body style="font-family:sans-serif;line-height:1.5;color:#1f2937">',
    ...copy.body.map((p) => `<p>${fill(escapeHtml(p), escapeHtml)}</p>`),
    `<p><a href="${escapeHtml(links.action)}" style="display:inline-block;padding:10px 16px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(copy.action)}</a></p>`,
    `<p style="font-size:12px;color:#6b7280">${escapeHtml(footer[locale])} <a href="${escapeHtml(links.settings)}">${escapeHtml(links.settings)}</a></p>`,
    '</body></html>',
  ].join('');
  return { subject: copy.subject, text, html };
}
