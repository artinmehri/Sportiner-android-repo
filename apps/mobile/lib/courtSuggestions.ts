export type CourtSuggestion = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

const TORONTO_COURTS: CourtSuggestion[] = [
  { id: '1', name: 'Cedarvale Park', lat: 43.6926862432366, lng: -79.43200873596362 },
  { id: '2', name: 'Sir Winston Churchill Park Tennis Club', lat: 43.68375564175669, lng: -79.40871756033495 },
  { id: '3', name: 'Hillcrest Park', lat: 43.67598988841953, lng: -79.42411274751468 },
  { id: '4', name: 'Oriole Park', lat: 43.6972457332, lng: -79.400237963 },
  { id: '5', name: 'Viewmount Park Tennis Club', lat: 43.70763875602304, lng: -79.43670190658098 },
];

export type GeoCoords = { lat: number; lng: number };

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

export function distanceKm(a: GeoCoords, b: GeoCoords): number {
  if (
    !isFinite(a.lat) || !isFinite(a.lng) ||
    !isFinite(b.lat) || !isFinite(b.lng)
  ) {
    return 0;
  }
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
  if (
    !coords ||
    !isFinite(coords.lat) ||
    !isFinite(coords.lng) ||
    Math.abs(coords.lat) > 90 ||
    Math.abs(coords.lng) > 180
  ) {
    console.log('Invalid geometry coords:', coords);
    return null;
  }

  return {
    type: 'Point' as const,
    coordinates: [coords.lng, coords.lat] as [number, number],
  };
}
