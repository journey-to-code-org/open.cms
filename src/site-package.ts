import { validateManifestData, validateSiteConfig, validateSiteIdentity } from "../shared/site-validation.mjs";

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
export interface ExplorerConfig {
  headerCaption?: string; mapCaption?: string; eyebrow?: string;
  heading?: string; description?: string; searchPlaceholder?: string;
}
export interface SiteConfig {
  id: string; name: string; shortName?: string; description: string; canonicalUrl?: string;
  locale: string; publisher?: PublisherConfig; region: RegionConfig; seo: SeoConfig;
  pwa: PwaConfig; theme: ThemeConfig;
  explorer?: ExplorerConfig;
}

export interface SiteManifest {
  format: 1; id: string; name: string; version: string;
  site: string; map: string; navigation: string; collections: string; pages: string;
  content: string; places: string; trails: string; theme: string; assets: string; themeCss?: string;
}

export interface Place {
  id: string;
  name: string;
  description: string;
  activities: string[];
  coordinates: [number, number];
}

export interface ContentRecord {
  id: string;
  title: string;
  description: string;
  body: string;
  fields: Record<string, string>;
}

export interface TrailSnapshot {
  retrievedAt: string;
  skipped: number;
  hikes: {
    name: string;
    segments: [number, number][][];
    source: {
      id: string;
      url: string;
      retrievedAt: string;
      attribution: string;
      kind: "Hiking route" | "Mapped path";
      tags: Record<string, string>;
      regionalOnly?: boolean;
    };
  }[];
}

export interface NavigationConfig { items: { label: string; href: string }[] }
export interface CollectionsConfig { [id: string]: { title: string; label?: string; items: string[] } }
export interface PagesConfig {
  [id: string]: { route: string; sections: { component: string; props?: Record<string, unknown> }[] };
}
export interface MapConfig { style: string; center: [number, number]; zoom: number }
export interface ResolvedSitePaths {
  root: string;
  site: string;
  map: string;
  navigation: string;
  collections: string;
  pages: string;
  content: string;
  places: string;
  trails: string;
  theme: string;
  assets: string;
  themeCss?: string;
}

/** Validated and normalized Node-side source of truth for one site package. */
export interface LoadedSite {
  manifest: SiteManifest;
  config: SiteConfig;
  navigation: NavigationConfig;
  pages: PagesConfig;
  collections: CollectionsConfig;
  places: Place[];
  trails: TrailSnapshot;
  content: ContentRecord[];
  map: MapConfig;
  theme: ThemeConfig;
  themeCss: string;
  paths: ResolvedSitePaths;
}

/** Browser-safe projection serialized into the Vite virtual module. */
export type SiteRuntime = Pick<LoadedSite,
  "manifest" | "config" | "navigation" | "pages" | "collections" | "places" | "trails" | "map" | "theme" | "themeCss">;

export function parseSiteManifest(value: unknown): SiteManifest {
  return validateManifestData(value) as unknown as SiteManifest;
}

export function parseSiteConfig(value: unknown): SiteConfig {
  return validateSiteConfig(value) as SiteConfig;
}

export function validateSitePackageIdentity(site: SiteConfig, manifest: SiteManifest): SiteConfig {
  return validateSiteIdentity(site, manifest) as SiteConfig;
}
