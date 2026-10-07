const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const SAFE_TAGS = new Set("a article aside blockquote br code dd details div dl dt em figcaption figure h2 h3 h4 h5 h6 hr li ol p section small span strong sub summary sup table tbody td th thead tr ul".split(" "));
const VOID_TAGS = new Set(["br", "hr"]);
const safeHref = (value) => /^(?:https?:\/\/|mailto:)/i.test(value) ||
  (/^(?!\/\/)(?![a-z][a-z\d+.-]*:)[^\s"'<>\\]+$/i.test(value) &&
    (value.startsWith("/") || value.startsWith("#") || value.startsWith("./") || !value.startsWith("\\")));

function inline(source) {
  let result = escape(source);
  result = result.replace(/`([^`]+)`/g, "<code>$1</code>");
  result = result.replace(/\[([^\]]+)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g, (_, label, url) => {
    const href = safeHref(url) ? url : "#";
    return `<a href="${escape(href)}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>`;
  });
  return result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
}

function sanitizeHtml(html) {
  const safeBlocks = html.replace(/<(script|style|iframe|object|embed|svg|math|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  return safeBlocks.replace(/<!--[^]*?-->|<\/?([a-z][\w-]*)(\s[^<>]*?)?>/gi, (tag, rawName, rawAttributes = "") => {
    if (!rawName) return "";
    const name = rawName.toLowerCase();
    if (!SAFE_TAGS.has(name)) return "";
    if (tag.startsWith("</")) return VOID_TAGS.has(name) ? "" : `</${name}>`;
    const attributes = [];
    const matcher = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let match;
    while ((match = matcher.exec(rawAttributes))) {
      const key = match[1].toLowerCase(); const value = match[2] ?? match[3] ?? match[4] ?? "";
      if (!(key === "class" || key === "id" || key === "role" || key === "scope" || key === "colspan" || key === "rowspan" || key.startsWith("aria-"))) continue;
      attributes.push(`${key}="${escape(value)}"`);
    }
    const href = rawAttributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
    if (name === "a" && href) {
      const value = href[1] ?? href[2] ?? href[3] ?? "";
      if (safeHref(value)) attributes.push(`href="${escape(value)}"`);
    }
    return `<${name}${attributes.length ? ` ${attributes.join(" ")}` : ""}>`;
  });
}

function markdown(source) {
  const lines = source.replace(/\{\%\s*photo\b[\s\S]*?%\}/g, "").split(/\r?\n/);
  const output = [];
  for (let index = 0; index < lines.length;) {
    const text = lines[index].trim();
    if (!text) { index++; continue; }
    const heading = text.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { const level = Math.min(heading[1].length + 1, 6); output.push(`<h${level}>${inline(heading[2])}</h${level}>`); index++; continue; }
    if (/^<\/?[a-z][\w-]*\b/i.test(text)) {
      const block = [lines[index++]];
      while (index < lines.length && lines[index].trim()) block.push(lines[index++]);
      output.push(sanitizeHtml(block.join("\n"))); continue;
    }
    const list = text.match(/^([-*+]\s+|\d+[.)]\s+)/);
    if (list) {
      const ordered = /^\d/.test(list[1]); const tag = ordered ? "ol" : "ul"; const items = [];
      while (index < lines.length) {
        const item = lines[index].trim().match(/^([-*+]\s+|\d+[.)]\s+)(.+)$/);
        if (!item || /^\d/.test(item[1]) !== ordered) break;
        items.push(`<li>${inline(item[2])}</li>`); index++;
      }
      output.push(`<${tag}>${items.join("")}</${tag}>`); continue;
    }
    const paragraph = [text]; index++;
    while (index < lines.length && lines[index].trim() && !/^(#{1,6}\s|[-*+]\s+|\d+[.)]\s+|<\/?[a-z][\w-]*\b)/i.test(lines[index].trim())) paragraph.push(lines[index++].trim());
    output.push(`<p>${inline(paragraph.join(" "))}</p>`);
  }
  return output.join("\n");
}

function card(item, label = "READ THE STORY") {
  return `<article class="guide-card"><h3><a href="./${encodeURIComponent(item.id)}.html">${escape(item.title)}</a></h3><p>${escape(item.description)}</p><span>${escape(label)}</span></article>`;
}

function documentHead(site, title = site.config.seo.title, description = site.config.seo.description, canonical = site.config.canonicalUrl) {
  const url = canonical ? `<link rel="canonical" href="${escape(canonical)}">` : "";
  return `<!doctype html><html lang="${escape(site.config.locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="application-name" content="${escape(site.config.name)}"><meta name="description" content="${escape(description)}"><meta name="theme-color" content="${escape(site.config.pwa.themeColor)}">${url}<link rel="stylesheet" href="./site.css"><link rel="manifest" href="./manifest.webmanifest"><title>${escape(title)}</title><script defer src="./site.js"></script></head>`;
}

function navigation(site) {
  return site.navigation.items.map((item) => `<a href="${escape(item.href)}">${escape(item.label)}</a>`).join("");
}

function renderSection(site, section) {
  const props = section.props || {};
  switch (section.component) {
    case "hero":
      return `<section class="home-hero"><p class="eyebrow">${escape(site.config.region.name)}</p><h1>${escape(props.title || site.config.name)}</h1><p>${escape(site.config.description)}</p></section>`;
    case "guide-collection": {
      const collection = site.collections[props.collection];
      const items = collection.items.map((id) => site.content.find((entry) => entry.id === id)).filter(Boolean);
      return `<section class="content-section"><p class="eyebrow">${escape(collection.label || "EXPLORE")}</p><h2>${escape(collection.title)}</h2><div class="guide-grid">${items.map((item) => card(item, collection.title)).join("")}</div></section>`;
    }
    case "feature-gallery":
      return `<section class="content-section"><h2>${escape(props.title || "Places to explore")}</h2><div class="guide-grid">${site.places.map((place) => `<article class="guide-card"><h3>${escape(place.name)}</h3><p>${escape(place.description)}</p></article>`).join("")}</div></section>`;
    case "install-prompt":
      return `<section class="content-section" id="install-prompt"><h2>Take ${escape(site.config.pwa.shortName)} with you</h2><p>${escape(site.config.pwa.description)}</p><button id="install-app" type="button">Install the app</button><p id="install-status" role="status"></p></section>`;
    default:
      throw new Error(`Unsupported page component '${section.component}'.`);
  }
}

function buildSite(site) {
  const home = site.pages.home || Object.values(site.pages).find((page) => page.route === "/");
  if (!home) throw new Error("Site pages must define a home page at '/'.");
  const homeHtml = `${documentHead(site)}<body class="home-page"><a class="skip-link" href="#main">Skip to content</a><header class="site-header"><a class="site-brand" href="./">${escape(site.config.name)}</a><nav class="site-nav" aria-label="Main navigation">${navigation(site)}</nav></header><main id="main">${home.sections.map((section) => renderSection(site, section)).join("\n")}</main><footer class="site-footer"><span>${escape(site.config.publisher?.name || site.config.name)}</span></footer></body></html>`;
  const exploreHtml = `${documentHead(site, `${site.config.region.name} map`, site.config.description)}<body class="explore-page"><header class="site-header"><a class="site-brand" href="./">${escape(site.config.name)}</a><nav class="site-nav">${navigation(site)}</nav></header><main><div id="app" aria-label="Interactive ${escape(site.config.region.name)} map"></div></main><footer class="site-footer"><a href="./">${escape(site.config.name)}</a></footer><noscript><p>The map requires JavaScript. Browse the guides from the home page.</p></noscript><script type="module" src="./src/app.ts"></script></body></html>`;
  const pages = site.content.map((item) => {
    const canonical = site.config.canonicalUrl ? `${site.config.canonicalUrl.replace(/\/$/, "")}/${encodeURIComponent(item.id)}.html` : undefined;
    const source = `${documentHead(site, item.title, item.description || site.config.seo.description, canonical)}<body class="editorial-page"><header class="editorial-header"><a href="./">${escape(site.config.name)}</a><nav>${navigation(site)}</nav></header><main class="article-main"><header class="article-hero"><p class="eyebrow">${escape(site.config.region.name)}</p><h1>${escape(item.title)}</h1><p>${escape(item.description)}</p></header><article class="guide-article">${markdown(item.body)}</article></main></body></html>`;
    return { name: `${item.id}.html`, route: `/${item.id}.html`, source };
  });
  for (const [id, page] of Object.entries(site.pages)) {
    if (page === home || page.route === "/") continue;
    const name = page.route.endsWith("/") ? `${page.route.slice(1)}index.html` : page.route.slice(1);
    const canonical = site.config.canonicalUrl ? `${site.config.canonicalUrl.replace(/\/$/, "")}${page.route}` : undefined;
    const source = `${documentHead(site, page.sections.find((section) => section.component === "hero")?.props?.title || site.config.seo.title,
      site.config.seo.description, canonical)}<body class="home-page"><header class="site-header"><a class="site-brand" href="./">${escape(site.config.name)}</a><nav class="site-nav">${navigation(site)}</nav></header><main>${page.sections.map((section) => renderSection(site, section)).join("\n")}</main><footer class="site-footer">${escape(site.config.publisher?.name || site.config.name)}</footer></body></html>`;
    pages.push({ name, route: page.route, source, id });
  }
  const base = site.config.canonicalUrl?.replace(/\/$/, "");
  if (base) {
    const configuredUrls = Object.values(site.pages).filter((page) => page.route !== "/").map((page) => `${base}${page.route}`);
    pages.push({ name: "sitemap.xml", source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[`${base}/`, `${base}/explore.html`, ...configuredUrls, ...site.content.map((item) => `${base}/${encodeURIComponent(item.id)}.html`)].map((url) => `  <url><loc>${escape(url)}</loc></url>`).join("\n")}\n</urlset>\n` });
    pages.push({ name: "robots.txt", source: `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n` });
  }
  return { homeHtml, exploreHtml, pages, planningCards: "", localCards: "", homeCards: "" };
}

module.exports = { buildSite };
