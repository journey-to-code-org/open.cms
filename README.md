# open.cms

**open.cms is an open-source, place-based CMS and static publishing engine for regional guides, local discovery sites, outdoor and tourism projects, maps, trails, and similar geographically focused websites.**

The project is in an early transition. Version 0.1.x establishes a versioned site-package format and migration foundation. The live application is still the static GCADV-derived baseline; packages are not yet authoritative runtime inputs.

## What works in 0.1.x

- Version 1 site-package manifests, typed site configuration, and package validation.
- Garrett County migration and fictional Pine Hollow demo fixtures.
- Rust/WASM GPX analysis and early geographic utilities for bounds validation and point containment.
- Static GCADV-derived map, guide, trail, saved-outing, and offline/PWA functionality.
- Local package checks with `npm run validate:site -- sites/demo-region` (or `sites/garrett-county`).

## What is transitional

- Runtime code still consumes legacy Garrett-specific root inputs.
- Site selection is not fully wired into `dev` or `build`; changing a package does not automatically change the live app.
- Web Component extraction and package-driven static generation have not happened yet.
- Migration data is duplicated between root runtime inputs and `sites/garrett-county/`.

The [runtime bridge note](docs/architecture/v0.1-runtime-bridge.md) explains which files currently power the app. The [extraction audit](docs/architecture/site-extraction-audit.md) records known coupling and migration boundaries.

## Roadmap

- **0.1.x — Package specification and migration foundation.** Establish and validate package structure while maintaining the legacy runtime.
- **0.2.x — Site-package-driven runtime.** Make packages the authoritative source for site data and build output.
- **0.3.x — CMS editing/admin experience.** Explore editing workflows after the reusable runtime is established.

These are project direction, not promises of specific features or dates.

## Development

Requirements: Node.js LTS with npm, Rust/Cargo, the `wasm32-unknown-unknown` target, and `wasm-pack`.

```sh
rustup target add wasm32-unknown-unknown
npm ci
npm test
npm run typecheck
npm run test:rust
npm run validate:site -- sites/garrett-county
npm run validate:site -- sites/demo-region
npm run build
```

The legacy application uses a public Mapbox token for its basemap. Follow [map-config.example.json](map-config.example.json) and the existing deployment instructions in [docs/README.md](docs/README.md). The tokenless build still produces the rest of the static site.

## Technology

The project favors TypeScript, HTML, CSS, native browser APIs, Web Components, and Rust compiled to WebAssembly. It does not use a client-side UI framework. Rust currently handles local GPX analysis and early geographic validation helpers; broader geographic processing is future work.

## License

See [LICENSE](LICENSE).
