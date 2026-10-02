// UI text in the app's three languages. Wording follows the web app's message catalogues
// (apps/web/messages) so both clients say the same thing.
import type { Locale } from '../lib/format';

const en = {
  tabs: { home: 'Home', search: 'Search', messages: 'Messages', account: 'Account' },
  common: {
    error: 'Something went wrong. Please try again.',
    retry: 'Try again',
    loading: 'Loading…',
    back: 'Back',
    noPrice: 'No price',
  },
  auth: {
    login: 'Log in',
    logout: 'Log out',
    signedInAs: 'Signed in as {email}',
    failed: 'We could not log you in. Please try again.',
  },
  home: { latest: 'Latest listings', searchPlaceholder: 'Search for anything' },
  search: {
    placeholder: 'Search for anything',
    submit: 'Search',
    results: '{count} results',
    noResults: 'Nothing matched your search.',
  },
  listing: {
    seller: 'Seller',
    sold: 'Sold',
    promoted: 'Promoted',
    yours: 'Your listing',
    notFound: 'This listing does not exist or has been removed.',
    verified: 'Verified with BankID',
    notVerified: 'Not verified',
    reviews: 'Reviews',
  },
  contact: {
    title: 'Contact the seller',
    placeholder: 'Write a message…',
    send: 'Send message',
    login: 'Log in to contact the seller',
    defaultText: 'Hi! Is this still available?',
  },
  messages: {
    title: 'Messages',
    empty: 'No messages yet',
    login: 'Log in to see your messages',
    compose: 'Write a message…',
    send: 'Send',
    sending: 'Sending…',
    older: 'Show older messages',
    roleBuyer: 'You asked about this listing',
    roleSeller: 'A buyer is asking about your listing',
    errors: {
      own_listing: 'This is your own listing.',
      listing_unavailable: 'This listing is no longer available.',
      rate_limited: 'You are sending too fast. Wait a moment and try again.',
      generic: 'The message could not be sent. Please try again.',
    },
  },
  account: {
    title: 'My account',
    myListings: 'My listings',
    myListingsEmpty: 'You have no listings yet.',
    language: 'Language',
  },
};

export type Messages = typeof en;

const nb: Messages = {
  tabs: { home: 'Hjem', search: 'Søk', messages: 'Meldinger', account: 'Konto' },
  common: {
    error: 'Noe gikk galt. Prøv igjen.',
    retry: 'Prøv igjen',
    loading: 'Laster …',
    back: 'Tilbake',
    noPrice: 'Pris ikke oppgitt',
  },
  auth: {
    login: 'Logg inn',
    logout: 'Logg ut',
    signedInAs: 'Innlogget som {email}',
    failed: 'Vi kunne ikke logge deg inn. Prøv igjen.',
  },
  home: { latest: 'Nyeste annonser', searchPlaceholder: 'Søk etter hva som helst' },
  search: {
    placeholder: 'Søk etter hva som helst',
    submit: 'Søk',
    results: '{count} treff',
    noResults: 'Ingen annonser passet til søket.',
  },
  listing: {
    seller: 'Selger',
    sold: 'Solgt',
    promoted: 'Fremhevet',
    yours: 'Din annonse',
    notFound: 'Annonsen finnes ikke eller er fjernet.',
    verified: 'Verifisert med BankID',
    notVerified: 'Ikke verifisert',
    reviews: 'Omtaler',
  },
  contact: {
    title: 'Kontakt selgeren',
    placeholder: 'Skriv en melding…',
    send: 'Send melding',
    login: 'Logg inn for å kontakte selgeren',
    defaultText: 'Hei! Er denne fortsatt ledig?',
  },
  messages: {
    title: 'Meldinger',
    empty: 'Ingen meldinger ennå',
    login: 'Logg inn for å se meldingene dine',
    compose: 'Skriv en melding…',
    send: 'Send',
    sending: 'Sender…',
    older: 'Vis eldre meldinger',
    roleBuyer: 'Du spurte om denne annonsen',
    roleSeller: 'En kjøper spør om annonsen din',
    errors: {
      own_listing: 'Dette er din egen annonse.',
      listing_unavailable: 'Denne annonsen er ikke lenger tilgjengelig.',
      rate_limited: 'Du sender for raskt. Vent litt og prøv igjen.',
      generic: 'Meldingen kunne ikke sendes. Prøv igjen.',
    },
  },
  account: {
    title: 'Min konto',
    myListings: 'Mine annonser',
    myListingsEmpty: 'Du har ingen annonser ennå.',
    language: 'Språk',
  },
};

const so: Messages = {
  tabs: { home: 'Bogga hore', search: 'Raadi', messages: 'Fariimaha', account: 'Akoon' },
  common: {
    error: 'Wax baa khaldamay. Fadlan isku day mar kale.',
    retry: 'Isku day mar kale',
    loading: 'Fadlan sug…',
    back: 'Dib u noqo',
    noPrice: 'Qiime lama sheegin',
  },
  auth: {
    login: 'Gal',
    logout: 'Ka bax',
    signedInAs: 'Waxaad ku gashay {email}',
    failed: 'Kuma aanan gelin karin. Fadlan isku day mar kale.',
  },
  home: { latest: 'Xayeysiisyadii ugu dambeeyay', searchPlaceholder: 'Raadi wax kasta' },
  search: {
    placeholder: 'Raadi wax kasta',
    submit: 'Raadi',
    results: '{count} natiijo',
    noResults: 'Wax xayeysiis ah oo raadintaada la jaanqaada lama helin.',
  },
  listing: {
    seller: 'Iibiyaha',
    sold: 'La iibiyay',
    promoted: 'La horumariyay',
    yours: 'Xayeysiiskaaga',
    notFound: 'Xayeysiiskan ma jiro ama waa laga saaray.',
    verified: 'Lagu xaqiijiyay BankID',
    notVerified: 'Lama xaqiijin',
    reviews: 'Faallooyin',
  },
  contact: {
    title: 'La xiriir iibiyaha',
    placeholder: 'Qor fariin…',
    send: 'Dir fariinta',
    login: 'Gal si aad ula xiriirto iibiyaha',
    defaultText: 'Salaan! Weli ma la heli karaa?',
  },
  messages: {
    title: 'Fariimaha',
    empty: 'Weli fariin ma jirto',
    login: 'Gal si aad u aragto fariimahaaga',
    compose: 'Qor fariin…',
    send: 'Dir',
    sending: 'Waa la dirayaa…',
    older: 'Muuji fariimihii hore',
    roleBuyer: 'Waxaad wax ka weydiisay xayeysiiskan',
    roleSeller: 'Iibsade ayaa wax ka weydiinaya xayeysiiskaaga',
    errors: {
      own_listing: 'Kani waa xayeysiiskaaga.',
      listing_unavailable: 'Xayeysiiskan hadda lama heli karo.',
      rate_limited: 'Aad ayaad u degdegaysaa. Wax yar sug oo isku day mar kale.',
      generic: 'Fariinta lama diri karin. Fadlan isku day mar kale.',
    },
  },
  account: {
    title: 'Akoonkayga',
    myListings: 'Xayeysiisyadayda',
    myListingsEmpty: 'Weli ma lihid xayeysiis.',
    language: 'Luqadda',
  },
};

export const catalogues: Record<Locale, Messages> = { nb, en, so };

export const languageNames: Record<Locale, string> = { nb: 'Norsk', en: 'English', so: 'Soomaali' };
