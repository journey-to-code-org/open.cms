import type { LoadedSite, SiteConfig, SiteManifest } from "../src/site-package";

export function resolvePackagePaths(manifest: SiteManifest, packageRoot: string): { root: string; paths: Omit<LoadedSite["paths"], "root"> };
export function validateSitePackage(packageRoot: string): { manifest: SiteManifest; site: SiteConfig };
export function loadSitePackage(packagePath: string): LoadedSite;
