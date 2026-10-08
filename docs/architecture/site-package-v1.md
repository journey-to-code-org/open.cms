# Stable site-package format 1 contract

Site packages are independent inputs to the open.cms engine. The public engine can load a sibling or absolute private package; packages do not need to live under `open.cms/sites/`.

```sh
npm run validate:site -- ../my-private-site
npm run build -- --site ../my-private-site
```

## Identity and versions

`manifest.json` and `site.json` must use the same lowercase kebab-case package ID and display name. The manifest's `version` must be semantic version syntax. A package's version is independent of the open.cms engine version; changing the engine version does not require changing the versions of unchanged site packages.

## Generated outputs

These engine outputs are reserved:

```text
index.html
explore.html
site.css
site.js
manifest.webmanifest
service-worker.js
map-config.json
sitemap.xml
robots.txt
```

Package assets are copied from `assets/` to the site output root, so `assets/site.css` would replace `dist/site.css` and is rejected. The package path `assets/assets/` is reserved for Vite's bundled application files. Page routes, Markdown articles, and asset destinations are compared together for case-insensitive, exact, and file/directory collisions before build output is written.

## Asset references

Images and PWA icons use root-style public paths, for example:

```text
/images/hero.webp
```

This resolves to:

```text
assets/images/hero.webp
```

The reference must be a safe relative path below the package assets directory, the exact referenced file must exist, and symlinks are rejected. External URLs, protocol-relative URLs, `data:` URLs, backslashes, and traversal segments are invalid. Asset path pairs that differ only by case are rejected for portable deployments.

## Content files and metadata

Content is a flat directory of Markdown files. Filenames use lowercase kebab-case IDs, such as `swallow-falls.md` or `first-time-deep-creek.md`. IDs are used as generated article names and are not silently rewritten. Unsafe names and case-insensitive output collisions fail package validation.

The runtime consumes the front-matter fields `title`, `description`, `summary`, `image`, and `imageAlt`. A content image must use the same validated package asset path described above. When an image card has no `imageAlt`, the rendered card uses the content title as alternative text. Other legacy or unused front-matter fields are not interpreted by the engine.

`seo.image` remains reserved in the site configuration type and is not currently rendered or validated as an asset reference.

## Presentation limits

The package may provide theme tokens and an optional `themeCss` file contained by its manifest. Package CSS cannot use `@import`, `url(...)`, or `expression(...)`. Imagery belongs in validated page, content, or PWA icon references. Format 1 does not accept arbitrary templates, JavaScript, remote themes, or CSS imports.
