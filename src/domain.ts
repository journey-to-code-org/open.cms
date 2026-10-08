import type { HikeSource } from "./hikes";
import type { Place } from "./site-package";

export type { Place } from "./site-package";

export type { SiteRuntime } from "./site-package";

export interface TrailPoint {
  longitude: number;
  latitude: number;
  elevation: number | null;
  distanceM: number;
}

export interface Analysis {
  name: string;
  segments: TrailPoint[][];
  pointCount: number;
  distanceM: number;
  ascentM: number;
  descentM: number;
  elevationPoints: number;
  elevationPairs: number;
  totalPairs: number;
  minElevation: number | null;
  maxElevation: number | null;
}

export type SavedOuting =
  | { id: string; kind: "place"; name: string; savedAt: string; place: Place }
  | { id: string; kind: "trail"; name: string; savedAt: string; analysis: Analysis; source?: HikeSource };

const categories: [string, RegExp][] = [
  ["Hiking", /hik/i],
  ["Camping", /camp/i],
  ["Paddling", /kayak|boat/i],
  ["Fishing", /fish/i],
  ["Biking", /bik/i],
  ["Picnicking", /picni/i],
  ["Winter sports", /ski|snow/i],
  ["Sightseeing", /view|museum|shopping/i],
];

export const places: Place[] = [];
export const activityOptions: string[] = [];

export function configurePlaces(data: Place[]): void {
  places.splice(0, places.length, ...data);
  activityOptions.splice(0, activityOptions.length, ...[...new Set(data.flatMap((place) => place.activities))].sort());
}

export function filterPlaces(data: Place[], query: string, activity: string): Place[] {
  const term = query.trim().toLocaleLowerCase();
  return data.filter((place) =>
    (!activity || place.activities.includes(activity)) &&
    `${place.name} ${place.description} ${place.activities.join(" ")}`.toLocaleLowerCase().includes(term),
  );
}

export function estimateMinutes(analysis: Analysis, paceKmh: number): number {
  if (!Number.isFinite(paceKmh) || paceKmh <= 0) throw new Error("Walking pace must be positive.");
  const climb = analysis.elevationPairs === analysis.totalPairs ? analysis.ascentM / 600 : 0;
  return Math.round((analysis.distanceM / 1000 / paceKmh + climb) * 60);
}

export const formatDistance = (meters: number): string => `${(meters / 1000).toFixed(2)} km`;
export const formatDuration = (minutes: number): string =>
  minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
