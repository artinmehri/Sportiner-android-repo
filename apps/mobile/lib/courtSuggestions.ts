export type CourtSuggestion = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

const TORONTO_COURTS: CourtSuggestion[] = [
  { id: '1', name: 'Cedarvale Park', lat: 43.6932, lng: -79.4187 },
  { id: '2', name: 'Goulding Park', lat: 43.7812, lng: -79.4145 },
  { id: '3', name: 'Ramsden Park', lat: 43.6889, lng: -79.3942 },
  { id: '4', name: 'High Park Tennis Club', lat: 43.6465, lng: -79.4637 },
  { id: '5', name: 'Trinity Bellwoods Park', lat: 43.6476, lng: -79.4197 },
  { id: '6', name: 'Riverdale Park', lat: 43.6695, lng: -79.3518 },
];

export type GeoCoords = { lat: number; lng: number };

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

export function distanceKm(a: GeoCoords, b: GeoCoords): number {
  const earthRadiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function formatDistanceKm(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }
  return `${km.toFixed(1)}km`;
}

export async function fetchApproxLocationFromIp(): Promise<GeoCoords | null> {
  try {
    const response = await fetch('https://ipapi.co/json/');
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { latitude?: number; longitude?: number };
    if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') {
      return null;
    }
    return { lat: data.latitude, lng: data.longitude };
  } catch {
    return null;
  }
}

export function sortCourtsByProximity(
  courts: CourtSuggestion[],
  origin: GeoCoords | null
): Array<CourtSuggestion & { distanceKm?: number; distanceLabel?: string }> {
  if (!origin) {
    return courts.map((court) => ({ ...court }));
  }
  return courts
    .map((court) => {
      const km = distanceKm(origin, { lat: court.lat, lng: court.lng });
      return {
        ...court,
        distanceKm: km,
        distanceLabel: formatDistanceKm(km),
      };
    })
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
}

export function getDefaultCourts(): CourtSuggestion[] {
  return TORONTO_COURTS;
}

export function findCourtByName(name: string): CourtSuggestion | undefined {
  const normalized = name.trim().toLowerCase();
  return TORONTO_COURTS.find((court) => court.name.toLowerCase() === normalized);
}

export function toGeographyPoint(coords: GeoCoords | null | undefined) {
  if (!coords) {
    return null;
  }
  return {
    type: 'Point' as const,
    coordinates: [coords.lng, coords.lat] as [number, number],
  };
}
