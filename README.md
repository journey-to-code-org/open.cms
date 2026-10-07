# open.cms

**open.cms is an open-source, place-based CMS and static publishing engine for regional guides, local discovery sites, outdoor and tourism projects, maps, and trails.**

Version 0.2.0 makes version 1 site packages the source of truth for development and static builds. The Garrett County fixture and the fictional Pine Hollow demo use the same engine and can be built independently.

## Quick start

Requirements: Node.js LTS with npm, Rust/Cargo, the `wasm32-unknown-unknown` target, and `wasm-pack`.

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --locked
npm ci
npm run dev -- --site ./sites/demo-region
```

Open `http://localhost:3000`. Without `--site`, development and build use the documented `sites/demo-region` default. Site paths must resolve inside this repository.

## Site packages

Start a package by copying `sites/demo-region/` to `sites/my-region/`. A package is data, not executable code. Its `manifest.json` uses format `1` and points to the site config, map config, navigation, page composition, collections, Markdown content, place GeoJSON, regional trail snapshot, theme, and assets. All manifest paths are relative to the package root.

Validate a package before using it:

```sh
npm run validate:site -- sites/my-region
```

Develop or build it explicitly:

```sh
npm run dev -- --site ./sites/my-region
npm run build -- --site ./sites/my-region
```

Both `garrett-county` and `demo-region` are supported examples. Package paths, collection references, page component IDs, navigation URLs, GeoJSON places, theme values, and trail snapshots are checked before runtime data is exposed. Package files cannot add JavaScript, use traversal paths, or load files outside the package root.

## Runtime architecture

```text
site package → loadSitePackage() → LoadedSite → Web Components and static generator
                                      ├── normalized places and regional trails
                                      ├── config, navigation, pages, collections, theme
                                      └── SEO, PWA identity, and package assets
```

The Node loader reuses the browser-safe validators, checks resolved filesystem paths, and normalizes legacy GeoJSON fields into the internal `Place` model. The browser receives a generated virtual runtime module; UI modules do not import a site package directly. Static generation reads the same `LoadedSite` for the home page, content pages, sitemap, robots file, styles, and web app manifest.

The map center, style, bounds, minimum zoom, Overpass query, trail clipping, and places all come from the selected package. Trail refreshes preserve OpenStreetMap attribution and retrieval dates, use regional clipping, and keep the existing request and geometry size limits. Saved places, trail refresh caching, GPX import/export, and offline messaging remain available.

## Rust and Web Components

Rust/WASM continues to parse GPX and compute distance and elevation statistics. It also validates geographic bounds and contains points. The explorer sends all bundled trail geometries and the active bounds in one coarse WASM call for regional clipping; if WASM geo initialization fails, the validated TypeScript clipping result remains available. GPX analysis continues to run in a worker.

The first extracted custom elements are:

- `<open-cms-place-list>` renders normalized places and emits `place-select` with `{ place }`.
- `<open-cms-hike-list>` renders trail records and emits `hike-preview`, `hike-analyze`, and `hike-export`, each with `{ hike }`.
- `<open-cms-notice>` owns status and error announcements through its `show(message, error?)` method.

`app.ts` owns map lifecycle, saved outings, filters, trail refresh, and GPX analysis coordination. These boundaries establish the direction without replacing the whole explorer.

## Static hosting and Mapbox

`npm run build -- --site ...` writes ordinary static output to `dist/`; no application server is required after build. The output can be deployed to Netlify, static object/CDN hosting, and GitHub Pages when the package URLs and deployment base path are configured appropriately. Mapbox and live Overpass refreshes need a network connection.

The basemap requires a public Mapbox token. Follow [map-config.example.json](map-config.example.json) and the deployment notes in [docs/README.md](docs/README.md). Secret tokens are rejected. A tokenless build still includes the site, content, places, trails, and GPX tools, while the basemap reports that configuration is missing.

## Checks

```sh
npm test
npm run typecheck
npm run test:rust
npm run validate:site -- sites/garrett-county
npm run validate:site -- sites/demo-region
npm run build -- --site ./sites/garrett-county
npm run build -- --site ./sites/demo-region
```

See [the 0.2.0 runtime architecture](docs/architecture/v0.2-package-runtime.md) and [the extraction audit](docs/architecture/site-extraction-audit.md) for implementation details and remaining work.

## Roadmap

- **0.1.x:** package specification and migration foundation.
- **0.2.x:** package-driven runtime and static builds.
- **0.3.x:** possible CMS editing/admin work after the package runtime is established; it is not part of 0.2.0.

## License

See [LICENSE](LICENSE).
