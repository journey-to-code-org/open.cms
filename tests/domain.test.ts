import assert from "node:assert/strict";
import test from "node:test";
import { filterPlaces, estimateMinutes, formatDuration, type Analysis, type Place } from "../src/domain";

const places: Place[] = [
  { id: "falls", name: "Swallow Falls", description: "A waterfall trail", activities: ["Hiking", "Sightseeing"], coordinates: [-79.2, 39.5] },
  { id: "new-germany", name: "New Germany State Park", description: "A quiet lake", activities: [], coordinates: [-79.1, 39.4] },
];

test("search is case-insensitive, matches metadata, and preserves identities", () => {
  const before = JSON.stringify(places);
  assert.equal(filterPlaces(places, " SWALLOW ", "")[0].name, "Swallow Falls");
  assert.ok(filterPlaces(places, "waterfall", "").length);
  assert.equal(filterPlaces(places, "no-match-123", "").length, 0);
  assert.equal(filterPlaces(places, "", "").length, 2);
  assert.equal(JSON.stringify(places), before);
  assert.equal(new Set(places.map((place) => place.id)).size, places.length);
});

test("activity and text filters combine; missing activities stay unknown", () => {
  assert.ok(filterPlaces(places, "", "Hiking").every((place) => place.activities.includes("Hiking")));
  assert.equal(filterPlaces(places, "Swallow", "Camping").length, 0);
  assert.deepEqual(places.find((place) => place.name === "New Germany State Park")?.activities, []);
});

test("time estimates include climb only with complete elevation pairs", () => {
  const analysis = { distanceM: 4000, ascentM: 600, elevationPairs: 4, totalPairs: 4 } as Analysis;
  assert.equal(estimateMinutes(analysis, 4), 120);
  assert.equal(estimateMinutes({ ...analysis, elevationPairs: 3 }, 4), 60);
  assert.throws(() => estimateMinutes(analysis, 0));
  assert.throws(() => estimateMinutes(analysis, NaN));
  assert.equal(formatDuration(120), "2 h 0 min");
});
