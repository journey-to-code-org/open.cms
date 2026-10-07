# Site extraction audit (v0.1 foundation)

This audit records the imported GCADV baseline and the first package boundary. The package fixtures are data copies; the current application is not yet fully driven by them. Do not treat the existence of `sites/` as proof that runtime separation is complete.

## Existing coupling

| Location | Current responsibility and GCADV coupling | Extraction status |
| --- | --- | --- |
| `src/region.ts` | Garrett bounds, BBOX, clipping and zoom calculations are module constants. | Outstanding: signatures and callers still need package bounds. |
| `src/domain.ts` | Imports `src/model/geo.json`, maps GCADV property names and category labels to runtime places. | Fixture data copied to `sites/garrett-county/data`; runtime import remains. |
| `src/app.ts` | Contains GCADV branding, map summaries, trail query language and large imperative app shell. | Outstanding; this is the main runtime coupling. |
| `src/hikes.ts` | Regional Overpass request and clipping rely on global BBOX/bounds. | Trail snapshot copied to the package; query still needs active package bounds. |
| `src/model/geo.json`, `src/model/hikes.json` | Garrett place data and regional OpenStreetMap trail snapshot. | Copies exist in the fixture package; source imports remain for compatibility. |
| `content/articles/*` | All Markdown articles are GCADV-specific. | Copied under `sites/garrett-county/content`. |
| `scripts/content-site.js`, `scripts/build-content.js` | Article IDs, homepage collections and metadata are assembled for the GCADV pages. | Outstanding: generator still reads root `content/` and hardcodes composition. |
| `index.html`, `explore.html` | Branding, canonical URL, SEO, homepage copy and regional safety language are literal HTML. | Outstanding; package SEO/pages are initial data only. |
| `public/manifest.webmanifest`, `public/images/*` | PWA identity and many branded visual assets are fixed. | Assets copied; generated manifest is not wired yet. |
| `vite.config.mjs` | Calls `buildSite()` without an active package and uses legacy build flow. | Outstanding: `--site` selection and package builds are not yet supported. |

Searches found Garrett/Deep Creek/Maryland/Oakland references throughout those runtime files, the imported content, model snapshots, and branded public assets. References within `sites/garrett-county/` are expected migration-fixture content. Runtime references outside it remain extraction work; no blind replacement was performed. OpenStreetMap attribution, offline limitations, and trail-safety text should be preserved during that work.

## Package v1 shape

`sites/garrett-county/` and the fictional `sites/demo-region/` use a JSON manifest with `format: 1`. Package paths are relative and the TypeScript parser rejects traversal paths. `scripts/validate-site.mjs` checks required paths, region bounds, page-to-collection references, GeoJSON shape, and collection article references.

`src/site-package.ts` defines `SiteConfig`, `RegionConfig`, `SeoConfig`, `PwaConfig`, `ThemeConfig`, and `SiteManifest`. Package fields cover identity, locale, publisher, bounds, SEO, PWA, and theme. The current schemas are the initial v1 contract and still need broader JSON Schema coverage and migration policy.

## Engine and site boundaries

The engine should own rendering, generic collections, maps, trails, Markdown processing, PWA mechanics, storage, validation, and build commands. A site package should own brand and publisher identity, region bounds, content, places, trail snapshots, navigation, page composition, theme, imagery, and PWA/SEO values. The fixture package is removable in the target architecture, but current imports make it required today.

The existing application has reusable interactive behavior and existing imperative modules, but this pass did not extract new Custom Elements. Components should be drawn around independently owned map/place/trail workflows, with DOM events and shared site context; avoid wrappers that do not own behavior.

Rust currently parses and analyzes GPX locally. This pass adds WASM exports for geographic bounds validation and point containment. Segment clipping, distance APIs, and actual application calls into these exports remain follow-up work; the existing clipping algorithm is still TypeScript.

## Creating a package

Copy `sites/demo-region/` as a starting fixture, assign a unique kebab-case id and manifest format 1, and provide site/map/navigation/collections/pages JSON, Markdown, GeoJSON, trail snapshot, theme, and assets. Run `npm run validate:site -- sites/my-region`. At this milestone, validation works, but the dev server and production build do not yet select or render arbitrary packages. Build selection is a v0.2 task, not a supported command today.

Static deployment remains the current delivery model. Existing PWA behavior remains in the baseline; configurable PWA identity and independently built package output are not yet connected.
