/**
 * Offline gazetteer: Norwegian towns with approximate centre coordinates
 * (WGS84). Listings reference a place by id; geo-radius search resolves a
 * place to coordinates without any external geocoding service.
 */
export const COUNTIES = {
  oslo: 'Oslo',
  akershus: 'Akershus',
  ostfold: 'Østfold',
  buskerud: 'Buskerud',
  vestfold: 'Vestfold',
  telemark: 'Telemark',
  agder: 'Agder',
  rogaland: 'Rogaland',
  vestland: 'Vestland',
  'more-og-romsdal': 'Møre og Romsdal',
  trondelag: 'Trøndelag',
  innlandet: 'Innlandet',
  nordland: 'Nordland',
  troms: 'Troms',
  finnmark: 'Finnmark',
} as const;

export type County = keyof typeof COUNTIES;

export interface Place {
  id: string;
  name: string;
  county: County;
  lat: number;
  lon: number;
}

const p = (id: string, name: string, county: County, lat: number, lon: number): Place => ({
  id,
  name,
  county,
  lat,
  lon,
});

export const PLACES: readonly Place[] = [
  p('oslo', 'Oslo', 'oslo', 59.9139, 10.7522),
  p('lillestrom', 'Lillestrøm', 'akershus', 59.956, 11.05),
  p('asker', 'Asker', 'akershus', 59.8331, 10.4392),
  p('sandvika', 'Sandvika', 'akershus', 59.8913, 10.524),
  p('ski', 'Ski', 'akershus', 59.7195, 10.8357),
  p('jessheim', 'Jessheim', 'akershus', 60.1416, 11.1747),
  p('fredrikstad', 'Fredrikstad', 'ostfold', 59.2181, 10.9298),
  p('sarpsborg', 'Sarpsborg', 'ostfold', 59.284, 11.1096),
  p('moss', 'Moss', 'ostfold', 59.434, 10.6577),
  p('halden', 'Halden', 'ostfold', 59.1229, 11.3875),
  p('drammen', 'Drammen', 'buskerud', 59.7439, 10.2045),
  p('kongsberg', 'Kongsberg', 'buskerud', 59.6686, 9.6502),
  p('honefoss', 'Hønefoss', 'buskerud', 60.168, 10.2564),
  p('tonsberg', 'Tønsberg', 'vestfold', 59.2675, 10.4076),
  p('sandefjord', 'Sandefjord', 'vestfold', 59.1312, 10.2166),
  p('larvik', 'Larvik', 'vestfold', 59.0533, 10.0352),
  p('skien', 'Skien', 'telemark', 59.2096, 9.609),
  p('porsgrunn', 'Porsgrunn', 'telemark', 59.1405, 9.6561),
  p('notodden', 'Notodden', 'telemark', 59.5594, 9.2585),
  p('kristiansand', 'Kristiansand', 'agder', 58.1599, 8.0182),
  p('arendal', 'Arendal', 'agder', 58.461, 8.7725),
  p('grimstad', 'Grimstad', 'agder', 58.3405, 8.5934),
  p('mandal', 'Mandal', 'agder', 58.0294, 7.4609),
  p('stavanger', 'Stavanger', 'rogaland', 58.97, 5.7331),
  p('sandnes', 'Sandnes', 'rogaland', 58.8517, 5.7355),
  p('haugesund', 'Haugesund', 'rogaland', 59.4138, 5.268),
  p('egersund', 'Egersund', 'rogaland', 58.4513, 5.9997),
  p('bergen', 'Bergen', 'vestland', 60.3913, 5.3221),
  p('voss', 'Voss', 'vestland', 60.628, 6.418),
  p('forde', 'Førde', 'vestland', 61.452, 5.857),
  p('leirvik', 'Leirvik', 'vestland', 59.7795, 5.5005),
  p('alesund', 'Ålesund', 'more-og-romsdal', 62.4722, 6.1495),
  p('molde', 'Molde', 'more-og-romsdal', 62.7375, 7.1591),
  p('kristiansund', 'Kristiansund', 'more-og-romsdal', 63.1105, 7.7279),
  p('trondheim', 'Trondheim', 'trondelag', 63.4305, 10.3951),
  p('steinkjer', 'Steinkjer', 'trondelag', 64.0149, 11.4954),
  p('stjordal', 'Stjørdal', 'trondelag', 63.4691, 10.918),
  p('levanger', 'Levanger', 'trondelag', 63.7464, 11.2996),
  p('hamar', 'Hamar', 'innlandet', 60.7945, 11.068),
  p('lillehammer', 'Lillehammer', 'innlandet', 61.1153, 10.4662),
  p('gjovik', 'Gjøvik', 'innlandet', 60.7957, 10.6916),
  p('elverum', 'Elverum', 'innlandet', 60.8819, 11.5623),
  p('bodo', 'Bodø', 'nordland', 67.2804, 14.4049),
  p('narvik', 'Narvik', 'nordland', 68.4385, 17.4272),
  p('mo-i-rana', 'Mo i Rana', 'nordland', 66.3128, 14.1428),
  p('svolvaer', 'Svolvær', 'nordland', 68.2343, 14.5683),
  p('tromso', 'Tromsø', 'troms', 69.6492, 18.9553),
  p('harstad', 'Harstad', 'troms', 68.7983, 16.5417),
  p('finnsnes', 'Finnsnes', 'troms', 69.2296, 17.9811),
  p('alta', 'Alta', 'finnmark', 69.9689, 23.2716),
  p('hammerfest', 'Hammerfest', 'finnmark', 70.6634, 23.6821),
  p('kirkenes', 'Kirkenes', 'finnmark', 69.7271, 30.045),
  p('vadso', 'Vadsø', 'finnmark', 70.0744, 29.7487),
];

const BY_ID = new Map(PLACES.map((place) => [place.id, place]));

export function findPlace(id: string): Place | undefined {
  return BY_ID.get(id);
}

/** Great-circle distance in kilometres (haversine). */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
