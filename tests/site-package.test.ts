import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseSiteConfig, parseSiteManifest } from "../src/site-package";
import { validateCollections, validatePages, validatePlaces, validateSitePackage } from "../shared/site-validation.mjs";

function temporarySite(id = "demo-region"): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), "open-cms-site-"));
  cpSync(path.resolve("sites", id), path.join(directory, "site"), { recursive: true });
  return path.join(directory, "site");
}

function readJson<T>(root: string, file: string): T {
  return JSON.parse(readFileSync(path.join(root, file), "utf8")) as T;
}

function writeJson(root: string, file: string, value: unknown): void {
  writeFileSync(path.join(root, file), `${JSON.stringify(value)}\n`);
}

test("Garrett and demo fixtures satisfy the shared v1 contract", () => {
  for (const id of ["garrett-county", "demo-region"]) {
    const root = path.resolve("sites", id);
    const { manifest, site } = validateSitePackage(root);
    assert.equal(parseSiteManifest(manifest, root).format, 1);
    assert.equal(parseSiteConfig(site, parseSiteManifest(manifest, root)).id, manifest.id);
  }
});

test("manifest rejects unsupported format, invalid ids, and malformed semantic versions", () => {
  for (const [file, mutation, message] of [
    ["format", (x: any) => ({ ...x, format: 2 }), /format 1/],
    ["id", (x: any) => ({ ...x, id: "Demo_Region" }), /kebab-case/],
    ["version", (x: any) => ({ ...x, version: "1.0" }), /semantic version/],
  ] as const) {
    const root = temporarySite();
    try {
      const manifest = readJson<any>(root, "manifest.json");
      assert.throws(() => parseSiteManifest(mutation(manifest), root), message, file);
    } finally { rmSync(path.dirname(root), { recursive: true, force: true }); }
  }
});

test("manifest rejects absolute, traversal, missing and symlink-escaped package paths", (t) => {
  const root = temporarySite();
  t.after(() => rmSync(path.dirname(root), { recursive: true, force: true }));
  const manifest = readJson<any>(root, "manifest.json");
  assert.throws(() => parseSiteManifest({ ...manifest, places: "/tmp/places.geojson" }, root), /relative path/);
  assert.throws(() => parseSiteManifest({ ...manifest, places: "../places.geojson" }, root), /parent-directory/);
  assert.throws(() => parseSiteManifest({ ...manifest, places: "missing/places.geojson" }, root), /Missing package entry/);

  const outside = path.join(path.dirname(root), "outside-assets");
  mkdirSync(outside);
  const assetPath = path.join(root, "assets");
  rmSync(assetPath, { recursive: true, force: true });
  try {
    symlinkSync(outside, assetPath, process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => parseSiteManifest(manifest, root), /Resolved package path 'assets' escapes/);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM" || (error as NodeJS.ErrnoException).code === "EACCES") {
      t.skip("The current account cannot create directory symlinks for this test.");
    } else throw error;
  }
});

test("site id must match manifest and region fields and bounds must be valid", () => {
  const root = path.resolve("sites/demo-region");
  const manifest = readJson<any>(root, "manifest.json");
  const site = readJson<any>(root, "site.json");
  assert.throws(() => parseSiteConfig({ ...site, id: "other-site" }, manifest), /match the manifest/);
  const invalid = [
    { ...site, name: "  " }, { ...site, locale: "" },
    { ...site, region: { ...site.region, name: "" } },
    { ...site, region: { ...site.region, bounds: [[0, 0]] } },
    { ...site, region: { ...site.region, bounds: [[0, 0], [1, Number.NaN]] } },
    { ...site, region: { ...site.region, bounds: [[-181, 0], [1, 1]] } },
    { ...site, region: { ...site.region, bounds: [[1, 0], [0, 1]] } },
    { ...site, region: { ...site.region, bounds: [[0, 2], [1, 1]] } },
  ];
  for (const value of invalid) assert.throws(() => parseSiteConfig(value, manifest));
});

test("places reject duplicate IDs, missing shape, and invalid coordinates", () => {
  const root = path.resolve("sites/demo-region");
  const places = readJson<any>(root, "data/places.geojson");
  assert.equal(validatePlaces(places), places);
  assert.throws(() => validatePlaces({ ...places, features: [places.features[0], places.features[0]] }), /Duplicate place id/);
  for (const coordinates of [[181, 0], [0, -91], [Number.NaN, 0], [0, Number.POSITIVE_INFINITY]]) {
    const feature = { ...places.features[0], geometry: { type: "Point", coordinates } };
    assert.throws(() => validatePlaces({ ...places, features: [feature] }), /invalid longitude\/latitude/);
  }
  assert.throws(() => validatePlaces({ ...places, features: [{ ...places.features[0], id: undefined }] }), /requires a .* id/);
  assert.throws(() => validatePlaces({ ...places, features: [{ ...places.features[0], geometry: null }] }), /Point geometry/);
});

test("collections require unique string content IDs that resolve to Markdown", () => {
  const root = path.resolve("sites/demo-region");
  const content = path.join(root, "content");
  const collections = readJson<any>(root, "collections.json");
  assert.equal(validateCollections(collections, content), collections);
  assert.throws(() => validateCollections({ x: { title: "X", items: ["juniper-overlook", "juniper-overlook"] } }, content), /duplicate item/);
  assert.throws(() => validateCollections({ x: { title: "X", items: ["missing-guide"] } }, content), /missing Markdown/);
  assert.throws(() => validateCollections({ x: { title: "X", items: [4] } }, content), /non-empty strings/);
  assert.throws(() => validateCollections({ x: { title: "X", items: "juniper-overlook" } }, content), /must be an array/);
});

test("pages reject unknown collections, malformed section data, and unregistered components", () => {
  const root = path.resolve("sites/demo-region");
  const pages = readJson<any>(root, "pages.json");
  const collections = readJson<any>(root, "collections.json");
  assert.equal(validatePages(pages, collections), pages);
  assert.throws(() => validatePages({ home: { route: "/", sections: [{ component: "guide-collection", props: { collection: "missing" } }] } }, collections), /unknown guide collection/);
  assert.throws(() => validatePages({ home: { route: "/", sections: [{ component: "mystery-widget" }] } }, collections), /unknown component/);
  assert.throws(() => validatePages({ home: { route: "/", sections: [{ component: "hero", props: "not-object" }] } }, collections), /props must be an object/);
  assert.throws(() => validatePages({ home: { route: "/", sections: {} } }, collections), /sections must be an array/);
});

test("full package validation catches broken cross-references", () => {
  const root = temporarySite();
  try {
    const collections = readJson<any>(root, "collections.json");
    collections.trailheads.items.push("missing-guide");
    writeJson(root, "collections.json", collections);
    assert.throws(() => validateSitePackage(root), /missing Markdown/);
  } finally { rmSync(path.dirname(root), { recursive: true, force: true }); }

  const anotherRoot = temporarySite();
  try {
    const manifest = readJson<any>(anotherRoot, "manifest.json");
    const site = readJson<any>(anotherRoot, "site.json");
    site.id = "does-not-match";
    writeJson(anotherRoot, manifest.site, site);
    assert.throws(() => validateSitePackage(anotherRoot), /match the manifest/);
  } finally { rmSync(path.dirname(anotherRoot), { recursive: true, force: true }); }
});
