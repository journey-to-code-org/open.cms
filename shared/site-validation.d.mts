export const PAGE_COMPONENTS: Set<string>;
export function validateManifestData(manifest: unknown): Record<string, unknown>;
export function validateSiteIdentity(site: unknown, manifest: unknown): unknown;
export function validateSiteConfig(site: unknown): unknown;
export function validatePlaces(places: unknown): unknown;
export function validateCollections(collections: unknown, contentIds: Iterable<string>): unknown;
export function validatePages(pages: unknown, collections: Record<string, unknown>): unknown;
export function validateGeneratedOutputPaths(pages: Record<string, unknown>, contentIds: Iterable<string>): unknown;
