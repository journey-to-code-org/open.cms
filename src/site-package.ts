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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function parseSiteManifest(value: unknown): SiteManifest {
  if (!isRecord(value) || value.format !== 1 || typeof value.id !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id) || typeof value.name !== "string" ||
      typeof value.version !== "string") throw new Error("Invalid site package manifest header or unsupported format.");
  const paths = ["site", "map", "navigation", "collections", "pages", "content", "places", "trails", "theme", "assets"] as const;
  for (const key of paths) {
    const path = value[key];
    if (typeof path !== "string" || path.startsWith("/") || path.includes("\\") ||
        path.split("/").some((part) => part === ".." || part === "")) {
      throw new Error(`Invalid package-relative path for ${key}.`);
    }
  }
  return value as unknown as SiteManifest;
}

export function parseSiteConfig(value: unknown): SiteConfig {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" ||
      typeof value.description !== "string" || typeof value.locale !== "string" ||
      !isRecord(value.region) || typeof value.region.name !== "string" ||
      !Array.isArray(value.region.bounds) || value.region.bounds.length !== 2 ||
      !value.region.bounds.every((point) => Array.isArray(point) && point.length === 2 &&
        point.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))) ||
      !isRecord(value.seo) || typeof value.seo.title !== "string" || typeof value.seo.description !== "string" ||
      !isRecord(value.pwa) || typeof value.pwa.name !== "string" || typeof value.pwa.shortName !== "string" ||
      typeof value.pwa.description !== "string" || typeof value.pwa.themeColor !== "string" ||
      typeof value.pwa.backgroundColor !== "string" || !Array.isArray(value.pwa.icons) ||
      !value.pwa.icons.every((icon) => typeof icon === "string") || !isRecord(value.theme) ||
      typeof value.theme.accent !== "string" || typeof value.theme.background !== "string" ||
      typeof value.theme.text !== "string") throw new Error("Invalid site configuration.");
  const bounds = value.region.bounds as Bounds;
  const [[west, south], [east, north]] = bounds;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    throw new Error("Site region bounds must be ordered valid longitude/latitude coordinates.");
  }
  return value as unknown as SiteConfig;
}
