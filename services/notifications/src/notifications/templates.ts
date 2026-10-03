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
  nb: 'Du får denne e-posten fordi du har en konto på Raadiso. Endre varslene dine her:',
  en: 'You receive this e-mail because you have a Raadiso account. Change your notifications here:',
  so: 'Waxaad helaysaa iimaylkan sababtoo ah waxaad leedahay akoon Raadiso. Halkan ka beddel ogeysiisyadaada:',
};

/**
 * Deliberately short: e-mails never contain message text or contact details,
 * only a link back to the signed-in app (GDPR, phishing resistance).
 */
const COPY: Record<EmailKind, Record<Locale, Copy>> = {
  new_message: {
    nb: {
      subject: 'Du har fått en ny melding på Raadiso',
      body: ['Hei!', 'Du har fått en ny melding om en annonse på Raadiso.'],
      action: 'Les og svar',
    },
    en: {
      subject: 'You have a new message on Raadiso',
      body: ['Hi!', 'Someone sent you a message about a listing on Raadiso.'],
      action: 'Read and reply',
    },
    so: {
      subject: 'Fariin cusub ayaa kuu timid Raadiso',
      body: ['Salaan!', 'Qof ayaa kuu soo diray fariin ku saabsan xayeysiis Raadiso ah.'],
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
        'Your listing "{title}" was removed by Raadiso\'s moderators because it does not follow the marketplace rules.',
      ],
      action: 'See your listings',
    },
    so: {
      subject: 'Xayeysiiskaaga waa la saaray',
      body: [
        'Salaan!',
        'Xayeysiiskaaga "{title}" waxaa saaray maamulayaasha Raadiso sababtoo ah ma raacayo xeerarka suuqa.',
      ],
      action: 'Arag xayeysiisyadaada',
    },
  },
  payment_receipt: {
    nb: {
      subject: 'Kvittering fra Raadiso',
      body: [
        'Takk for kjøpet!',
        'Ordre: {orderId}',
        '{product}: {amount} (inkl. mva. {vat})',
        'Dato: {date}',
        'Selger: {merchant}',
        'Denne e-posten er kvitteringen din. Ta vare på den.',
      ],
      action: 'Se annonsen',
    },
    en: {
      subject: 'Your Raadiso receipt',
      body: [
        'Thank you for your purchase!',
        'Order: {orderId}',
        '{product}: {amount} (incl. VAT {vat})',
        'Date: {date}',
        'Seller: {merchant}',
        'This e-mail is your receipt. Please keep it.',
      ],
      action: 'See the listing',
    },
    so: {
      subject: 'Rasiidkaaga Raadiso',
      body: [
        'Waad ku mahadsan tahay iibsashadaada!',
        'Dalab: {orderId}',
        '{product}: {amount} (oo ay ku jirto canshuurta {vat})',
        'Taariikh: {date}',
        'Iibiye: {merchant}',
        'Iimaylkan waa rasiidkaaga. Fadlan kaydi.',
      ],
      action: 'Arag xayeysiiska',
    },
  },
};

const PRODUCT_NAMES: Record<Locale, (days: string) => string> = {
  nb: (d) => `Fremhevet annonse i ${d} dager`,
  en: (d) => `Promoted listing for ${d} days`,
  so: (d) => `Xayeysiis la horumariyay ${d} maalmood`,
};
const INTL: Record<Locale, string> = { nb: 'nb-NO', en: 'en-GB', so: 'so-SO' };

/**
 * Receipt fields formatted for the recipient's language: the price includes
 * 25 % Norwegian VAT, and the VAT amount is shown as the law requires.
 */
export function receiptParams(
  params: Record<string, string>,
  locale: Locale,
): Record<string, string> {
  const ore = Number(params.amountOre);
  const vatOre = Math.round(ore - ore / 1.25);
  const money = (o: number) =>
    new Intl.NumberFormat(INTL[locale], { style: 'currency', currency: 'NOK' }).format(o / 100);
  return {
    ...params,
    product: PRODUCT_NAMES[locale](params.days ?? ''),
    amount: money(ore),
    vat: money(vatOre),
    date: new Intl.DateTimeFormat(INTL[locale], {
      dateStyle: 'long',
      timeZone: 'Europe/Oslo',
    }).format(new Date(params.capturedAt ?? Date.now())),
  };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function renderEmail(
  kind: EmailKind,
  locale: Locale,
  params: Record<string, string>,
  links: { action: string; settings: string },
): RenderedEmail {
  const copy = COPY[kind][locale];
  if (kind === 'payment_receipt') params = receiptParams(params, locale);
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
