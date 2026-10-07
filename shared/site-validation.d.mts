export const PAGE_COMPONENTS: Set<string>;
export function validateManifest(manifest: unknown, root: string): { manifest: Record<string, unknown>; root: string; paths: Record<string, string> };
export function validateSiteConfig(site: unknown, manifest: Record<string, unknown>): unknown;
export function validatePlaces(places: unknown): unknown;
export function validateCollections(collections: unknown, contentDirectory: string): unknown;
export function validatePages(pages: unknown, collections: Record<string, unknown>): unknown;
export function validateSitePackage(packageRoot: string): { manifest: Record<string, unknown>; site: unknown };
export function packageRootFromModule(moduleUrl: string): string;
