import { validateManifest, validateSiteConfig } from "../shared/site-validation.mjs";

export type Bounds = [[number, number], [number, number]];

export interface PublisherConfig { name: string; url?: string }
export interface RegionConfig { name: string; administrativeArea?: string; country?: string; bounds: Bounds }
export interface SeoConfig { title: string; description: string; image?: string }
export interface PwaConfig {
  name: string; shortName: string; description: string; themeColor: string;
  backgroundColor: string; icons: string[];
}
export interface ThemeConfig {
  accent: string; background: string; text: string; fontFamily?: string;
}
export interface SiteConfig {
  id: string; name: string; shortName?: string; description: string; canonicalUrl?: string;
  locale: string; publisher?: PublisherConfig; region: RegionConfig; seo: SeoConfig;
  pwa: PwaConfig; theme: ThemeConfig;
}

export interface SiteManifest {
  format: 1; id: string; name: string; version: string;
  site: string; map: string; navigation: string; collections: string; pages: string;
  content: string; places: string; trails: string; theme: string; assets: string;
}

export function parseSiteManifest(value: unknown, packageRoot: string): SiteManifest {
  return validateManifest(value, packageRoot).manifest as unknown as SiteManifest;
}

export function parseSiteConfig(value: unknown, manifest: SiteManifest): SiteConfig {
  return validateSiteConfig(value, manifest as unknown as Record<string, unknown>) as SiteConfig;
}
