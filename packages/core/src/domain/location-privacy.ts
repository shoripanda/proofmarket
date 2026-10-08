// Coarse places on public surfaces (13 §9 PR 7). A "coarse" task shows the centre of its geohash-6 cell
// (about 1.2 km × 0.6 km) on the proof page, the map and the dataset; the requester's GET stays exact.

export const LOCATION_PRIVACY = ["exact", "coarse"] as const;
export type LocationPrivacy = (typeof LOCATION_PRIVACY)[number];

export const COARSE_GEOHASH_LENGTH = 6;
/** Rounded size of a geohash-6 cell's long side, shown next to a coarse place. */
export const COARSE_PRECISION_M = 1200;

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Standard geohash: bits alternate longitude, latitude, 5 bits per character. */
export function geohashEncode(lat: number, lng: number, length = COARSE_GEOHASH_LENGTH): string {
  const range = { lat: [-90, 90], lng: [-180, 180] } as Record<"lat" | "lng", [number, number]>;
  let out = "";
  let bits = 0;
  let ch = 0;
  let evenBit = true;
  while (out.length < length) {
    const axis = evenBit ? "lng" : "lat";
    const v = axis === "lng" ? lng : lat;
    const [lo, hi] = range[axis];
    const mid = (lo + hi) / 2;
    ch <<= 1;
    if (v >= mid) {
      ch |= 1;
      range[axis][0] = mid;
    } else range[axis][1] = mid;
    evenBit = !evenBit;
    if (++bits === 5) {
      out += BASE32[ch];
      bits = 0;
      ch = 0;
    }
  }
  return out;
}

/** The cell's centre, to 6 decimal places. */
export function geohashCenter(hash: string): { lat: number; lng: number } {
  const range = { lat: [-90, 90], lng: [-180, 180] } as Record<"lat" | "lng", [number, number]>;
  let evenBit = true;
  for (const c of hash) {
    const n = BASE32.indexOf(c);
    if (n < 0) throw new Error(`not a geohash character: ${c}`);
    for (let b = 4; b >= 0; b--) {
      const axis = evenBit ? "lng" : "lat";
      const mid = (range[axis][0] + range[axis][1]) / 2;
      range[axis][(n >> b) & 1 ? 0 : 1] = mid;
      evenBit = !evenBit;
    }
  }
  const round = (x: number) => Math.round(x * 1e6) / 1e6;
  return { lat: round((range.lat[0] + range.lat[1]) / 2), lng: round((range.lng[0] + range.lng[1]) / 2) };
}

/** Where a coarse task appears in public: its geohash-6 cell's centre. */
export function coarseLocation(lat: number, lng: number) {
  return { ...geohashCenter(geohashEncode(lat, lng)), precision_m: COARSE_PRECISION_M };
}

/** The place a public surface shows, and how precise it is (null when exact). */
export function publicLocation(lat: number, lng: number, privacy: string) {
  if (privacy !== "coarse") return { location: { lat, lng }, location_precision_m: null };
  const c = coarseLocation(lat, lng);
  return { location: { lat: c.lat, lng: c.lng }, location_precision_m: c.precision_m };
}
