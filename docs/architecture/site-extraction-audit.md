# Site extraction audit (0.2.0)

The selected v1 package now supplies the runtime and static site build. The [runtime architecture note](v0.2-package-runtime.md) describes the loader, safety checks, geographic handoff, static output, and component boundaries.

| Area | 0.2.0 source of truth | Remaining work |
| --- | --- | --- |
| Site identity, SEO, PWA, theme | Selected package `site.json` and `theme/theme.json` | Add richer metadata/image schema when the format needs it. |
| Navigation and page composition | Package `navigation.json` and `pages.json`, component IDs validated against the shared registry | Add richer safe components through allowlisted IDs. |
| Collections and content | Package collections and Markdown files | The renderer is deliberately small; it does not replace a general-purpose authoring system. |
| Places | Package GeoJSON normalized to the internal `Place` model | Add optional place fields only through schema changes. |
| Trails and region | Package snapshot and `config.region.bounds` | Keep snapshot refreshes package-scoped and preserve attribution/limits. |
| Assets | Selected package asset directory is Vite's public directory | Define richer asset metadata only when a component consumes it. |
| Geographic processing | TypeScript utilities take bounds; Rust/WASM validates and clips grouped geometry | Add parity and performance cases when operations expand. |
| Interactive UI | Place list, hike list, and notice are native custom elements | `app.ts` still owns app/map lifecycle, filters, storage, refresh, and GPX coordination. |
| Root legacy input | Root `src/model` imports, fixed homepage, old generator, and static GC public asset map are removed from the build | `content/` and `docs/README.md` remain historical Garrett material; the Garrett fixture remains a public test package. |

## Garrett-specific review

The generic runtime and generated demo output have no Garrett coordinates or brand copy. Garrett names and data remain in `sites/garrett-county/`, package fixture tests, and Garrett-specific operational documentation. The development service-worker cleanup retains the historical `chingu-adventures-` and `chingu-mapbox-` prefixes to clear caches made by earlier installs.

## Verification summary

Both packages load and validate. Tests cover normalized package data, collection/page references, safe paths, safe navigation, site selection, demo and Garrett bounds, region clipping, OpenStreetMap provenance, static identity, and malicious authored HTML. Rust tests cover GPX analysis plus geographic bounds/containment/clipping. The documented release checklist also verifies independent builds and a demo build with the Garrett fixture temporarily unavailable.
