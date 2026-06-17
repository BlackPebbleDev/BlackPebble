/**
 * Post-build prerender step.
 *
 * BlackPebble is a pure Vite SPA. The static host serves dist/public with a
 * directory-index / SPA-fallback strategy, so a crawler hitting /markets would
 * normally receive the root index.html with homepage metadata.
 *
 * This script makes each major route crawler-visible with its OWN <title>,
 * meta description, canonical URL, and Open Graph / Twitter tags — WITHOUT any
 * headless browser. It clones the built index.html and rewrites only the head
 * metadata, writing dist/public/<route>/index.html for each route. The SPA
 * still hydrates and takes over client-side routing on load.
 *
 * Lightweight, no new dependencies, no impact on bundle size or runtime.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const distDir = join(projectRoot, "dist", "public");
const indexPath = join(distDir, "index.html");
const seoPath = join(projectRoot, "seo.routes.json");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceTitle(html, title) {
  return html.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
}

/** Replace the content="" of a <meta name="..."> tag. */
function replaceMetaName(html, name, content) {
  const re = new RegExp(
    `(<meta\\s+name="${name}"\\s+content=")[\\s\\S]*?("\\s*/?>)`,
  );
  return html.replace(re, `$1${content}$2`);
}

/** Replace the content="" of a <meta property="..."> tag. */
function replaceMetaProperty(html, property, content) {
  const re = new RegExp(
    `(<meta\\s+property="${property}"\\s+content=")[\\s\\S]*?("\\s*/?>)`,
  );
  return html.replace(re, `$1${content}$2`);
}

function replaceCanonical(html, href) {
  return html.replace(
    /(<link\s+rel="canonical"\s+href=")[\s\S]*?("\s*\/?>)/,
    `$1${href}$2`,
  );
}

function main() {
  if (!existsSync(indexPath)) {
    console.error(`[prerender] dist index not found at ${indexPath}; skipping.`);
    process.exit(1);
  }
  if (!existsSync(seoPath)) {
    console.error(`[prerender] seo.routes.json not found at ${seoPath}; skipping.`);
    process.exit(1);
  }

  const baseHtml = readFileSync(indexPath, "utf8");
  const { siteUrl, routes } = JSON.parse(readFileSync(seoPath, "utf8"));
  const trimmedSite = String(siteUrl).replace(/\/$/, "");

  // Guard: the template must contain the tags we intend to rewrite. If a future
  // change reorders attributes or renames tags, fail loudly instead of silently
  // emitting route pages that all share the homepage metadata.
  const requiredTemplateTags = [
    /<title>[\s\S]*?<\/title>/,
    /<meta\s+name="description"\s+content=/,
    /<link\s+rel="canonical"\s+href=/,
  ];
  for (const re of requiredTemplateTags) {
    if (!re.test(baseHtml)) {
      console.error(
        `[prerender] template is missing an expected tag (${re}); aborting.`,
      );
      process.exit(1);
    }
  }

  let written = 0;
  for (const route of routes) {
    const { path, title, description } = route;
    // Root index.html is produced by Vite; leave it as the authoritative home.
    if (path === "/") continue;

    const canonical = `${trimmedSite}${path}`;
    const t = escapeHtml(title);
    const d = escapeHtml(description);

    let html = baseHtml;
    html = replaceTitle(html, t);
    html = replaceMetaName(html, "description", d);
    html = replaceCanonical(html, canonical);
    html = replaceMetaProperty(html, "og:title", t);
    html = replaceMetaProperty(html, "og:description", d);
    html = replaceMetaProperty(html, "og:url", canonical);
    html = replaceMetaName(html, "twitter:title", t);
    html = replaceMetaName(html, "twitter:description", d);

    // Verify each critical replacement actually applied for this route.
    const checks = [
      [`<title>${t}</title>`, "title"],
      [`content="${d}"`, "description"],
      [`href="${canonical}"`, "canonical"],
    ];
    for (const [needle, label] of checks) {
      if (!html.includes(needle)) {
        console.error(
          `[prerender] failed to apply ${label} for route "${path}"; aborting.`,
        );
        process.exit(1);
      }
    }

    const outDir = join(distDir, path.replace(/^\//, ""));
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "index.html"), html, "utf8");
    written += 1;
  }

  console.log(`[prerender] wrote ${written} route page(s) to ${distDir}`);
}

main();
