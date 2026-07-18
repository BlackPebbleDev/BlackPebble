/**
 * Post-build Academy prerender + sitemap generation.
 *
 * Runs after prerender.mjs. For every published Academy lesson and category it
 * writes a static dist/public/learn/<category>/<lesson>/index.html that contains:
 *   - per-lesson <title>, meta description, canonical URL, Open Graph / Twitter
 *   - JSON-LD structured data (TechArticle / DefinedTerm + BreadcrumbList)
 *   - the lesson's meaningful text content injected into #root so crawlers see
 *     real content (the SPA replaces it on load via createRoot)
 * It also appends category and lesson URLs to dist/public/sitemap.xml.
 *
 * Content is sourced from the app's own registry, bundled on the fly with
 * esbuild (a transitive dependency of Vite), so there is no separate content
 * copy to drift out of sync.
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const workspaceRoot = join(projectRoot, "..", "..");
const distDir = join(projectRoot, "dist", "public");
const indexPath = join(distDir, "index.html");
const seoPath = join(projectRoot, "seo.routes.json");
const sitemapPath = join(distDir, "sitemap.xml");

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
function replaceMetaName(html, name, content) {
  const re = new RegExp(
    `(<meta\\s+name="${name}"\\s+content=")[\\s\\S]*?("\\s*/?>)`,
  );
  return html.replace(re, `$1${content}$2`);
}
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

/** Locate esbuild, which ships as a transitive dependency of Vite. */
async function loadEsbuild() {
  try {
    const require = createRequire(import.meta.url);
    return await import(pathToFileURL(require.resolve("esbuild")).href);
  } catch {
    // Fall back to the pnpm store layout.
  }
  const pnpmDir = join(workspaceRoot, "node_modules", ".pnpm");
  if (!existsSync(pnpmDir)) return null;
  const match = readdirSync(pnpmDir).find((d) => d.startsWith("esbuild@"));
  if (!match) return null;
  const main = join(pnpmDir, match, "node_modules", "esbuild", "lib", "main.js");
  if (!existsSync(main)) return null;
  return import(pathToFileURL(main).href);
}

async function loadAcademy(esbuild) {
  const entry = join(projectRoot, "src", "lib", "education", "build-export.ts");
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent",
  });
  const tmpFile = join(tmpdir(), `academy-export-${Date.now()}.mjs`);
  writeFileSync(tmpFile, result.outputFiles[0].text, "utf8");
  return import(pathToFileURL(tmpFile).href);
}

/** Crawlable inner HTML for a lesson page (replaces the SEO fallback block). */
function lessonContentHtml(lesson, academy, site) {
  const parts = [];
  parts.push(
    `<main id="bp-academy-content" style="max-width:760px;margin:0 auto;padding:32px 20px;">`,
  );
  parts.push(
    `<nav><a href="${site}/learn">BlackPebble Academy</a> / <a href="${site}${academy.categoryPath(lesson.categoryId)}">${escapeHtml(lesson.categoryTitle)}</a></nav>`,
  );
  parts.push(`<h1>${escapeHtml(lesson.title)}</h1>`);
  if (lesson.shortAnswer) parts.push(`<p>${escapeHtml(lesson.shortAnswer)}</p>`);
  for (const section of lesson.sections) {
    parts.push(`<h2>${escapeHtml(section.title)}</h2>`);
    parts.push(`<p>${escapeHtml(section.body)}</p>`);
  }
  if (lesson.examples.length) {
    parts.push(`<h2>Examples</h2>`);
    for (const ex of lesson.examples) parts.push(`<p>${escapeHtml(ex)}</p>`);
  }
  if (lesson.commonMistakes.length) {
    parts.push(`<h2>Common mistakes</h2><ul>`);
    for (const m of lesson.commonMistakes) parts.push(`<li>${escapeHtml(m)}</li>`);
    parts.push(`</ul>`);
  }
  if (lesson.relatedLessons.length) {
    parts.push(`<h2>Related lessons</h2><ul>`);
    for (const r of lesson.relatedLessons) {
      parts.push(
        `<li><a href="${site}${academy.lessonPath(r.categoryId, r.slug)}">${escapeHtml(r.title)}</a></li>`,
      );
    }
    parts.push(`</ul>`);
  }
  parts.push(`</main>`);
  return parts.join("\n");
}

function categoryContentHtml(category, academy, site, lessonsByCat) {
  const parts = [];
  parts.push(
    `<main id="bp-academy-content" style="max-width:760px;margin:0 auto;padding:32px 20px;">`,
  );
  parts.push(`<nav><a href="${site}/learn">BlackPebble Academy</a></nav>`);
  parts.push(`<h1>${escapeHtml(category.title)}</h1>`);
  if (category.description) parts.push(`<p>${escapeHtml(category.description)}</p>`);
  parts.push(`<ul>`);
  for (const lesson of lessonsByCat.get(category.id) ?? []) {
    parts.push(
      `<li><a href="${site}${academy.lessonPath(category.id, lesson.slug)}">${escapeHtml(lesson.title)}</a></li>`,
    );
  }
  parts.push(`</ul></main>`);
  return parts.join("\n");
}

/** Replace the homepage SEO fallback block with page-specific content. */
function injectContent(html, contentHtml) {
  const re = /<main id="bp-seo-fallback"[\s\S]*?<\/main>/;
  if (re.test(html)) return html.replace(re, contentHtml);
  // Fallback: inject at the start of #root without removing anything.
  return html.replace(/(<div id="root">)/, `$1${contentHtml}`);
}

/** Crawlable inner HTML for a learning-path overview page. */
function pathContentHtml(path, academy, site) {
  const parts = [];
  parts.push(
    `<main id="bp-academy-content" style="max-width:760px;margin:0 auto;padding:32px 20px;">`,
  );
  parts.push(`<nav><a href="${site}/learn">BlackPebble Academy</a></nav>`);
  parts.push(`<h1>${escapeHtml(path.title)}</h1>`);
  parts.push(`<p>${escapeHtml(path.description)}</p>`);
  if (path.outcomes?.length) {
    parts.push(`<h2>What you'll be able to do</h2><ul>`);
    for (const o of path.outcomes) parts.push(`<li>${escapeHtml(o)}</li>`);
    parts.push(`</ul>`);
  }
  parts.push(`<h2>Lesson sequence</h2><ol>`);
  for (const slug of path.lessonSlugs) {
    const ref = academy.getLessonRef(slug);
    if (!ref) continue;
    parts.push(
      `<li><a href="${site}${academy.lessonPath(ref.categoryId, ref.slug)}">${escapeHtml(ref.title)}</a></li>`,
    );
  }
  parts.push(`</ol></main>`);
  return parts.join("\n");
}

function injectJsonLd(html, jsonLd) {
  const scripts = jsonLd
    .map(
      (obj) =>
        `<script type="application/ld+json">${JSON.stringify(obj)}</script>`,
    )
    .join("\n");
  return html.replace(/<\/head>/, `${scripts}\n</head>`);
}

function applyMeta(html, { title, description, canonical }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  let out = html;
  out = replaceTitle(out, t);
  out = replaceMetaName(out, "description", d);
  out = replaceCanonical(out, canonical);
  out = replaceMetaProperty(out, "og:title", t);
  out = replaceMetaProperty(out, "og:description", d);
  out = replaceMetaProperty(out, "og:url", canonical);
  out = replaceMetaName(out, "twitter:title", t);
  out = replaceMetaName(out, "twitter:description", d);
  return out;
}

function writeSitemap(entries) {
  if (!existsSync(sitemapPath)) return 0;
  const xml = readFileSync(sitemapPath, "utf8");
  const urls = entries
    .map(
      ({ loc, priority }) =>
        `  <url>\n    <loc>${loc}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>${priority}</priority>\n  </url>`,
    )
    .join("\n");
  const next = xml.replace(/<\/urlset>\s*$/, `${urls}\n</urlset>\n`);
  writeFileSync(sitemapPath, next, "utf8");
  return entries.length;
}

async function main() {
  if (!existsSync(indexPath)) {
    console.error(`[prerender-academy] dist index not found at ${indexPath}; skipping.`);
    process.exit(1);
  }
  const esbuild = await loadEsbuild();
  if (!esbuild) {
    console.warn(
      "[prerender-academy] esbuild not found; skipping lesson prerender (SPA still serves lesson routes).",
    );
    process.exit(0);
  }

  const { siteUrl } = JSON.parse(readFileSync(seoPath, "utf8"));
  const site = String(siteUrl).replace(/\/$/, "");
  const baseHtml = readFileSync(indexPath, "utf8");
  const academy = await loadAcademy(esbuild);

  const lessons = academy
    .getAllNormalizedLessons()
    .filter((l) => l.status === "published");
  const categories = academy.ACADEMY_CATEGORIES;

  const lessonsByCat = new Map();
  for (const l of lessons) {
    if (!lessonsByCat.has(l.categoryId)) lessonsByCat.set(l.categoryId, []);
    lessonsByCat.get(l.categoryId).push(l);
  }

  const paths = academy
    .getPublishedLearningPaths()
    .filter((p) => p.status === "published");

  const sitemapEntries = [];
  let lessonPages = 0;
  let categoryPages = 0;
  let pathPages = 0;

  // Category pages.
  for (const category of categories) {
    const canonical = `${site}${academy.categoryPath(category.id)}`;
    const title = `${category.title} | BlackPebble Academy`;
    const description =
      category.description ??
      `${category.title}: lessons in the BlackPebble Academy.`;
    let html = applyMeta(baseHtml, { title, description, canonical });
    html = injectContent(html, categoryContentHtml(category, academy, site, lessonsByCat));
    const outDir = join(distDir, "learn", category.id);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "index.html"), html, "utf8");
    categoryPages += 1;
    sitemapEntries.push({ loc: canonical, priority: "0.6" });
  }

  // Lesson pages.
  for (const lesson of lessons) {
    const canonical = `${site}${academy.lessonPath(lesson.categoryId, lesson.slug)}`;
    let html = applyMeta(baseHtml, {
      title: lesson.seo.title,
      description: lesson.seo.description,
      canonical,
    });
    html = injectJsonLd(html, academy.lessonJsonLd(lesson, site));
    html = injectContent(html, lessonContentHtml(lesson, academy, site));
    const outDir = join(distDir, "learn", lesson.categoryId, lesson.slug);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "index.html"), html, "utf8");
    lessonPages += 1;
    sitemapEntries.push({
      loc: canonical,
      priority: lesson.kind === "flagship" ? "0.7" : "0.5",
    });
  }

  // Learning-path overview pages.
  for (const path of paths) {
    const canonical = `${site}${academy.learningPathPath(path.slug)}`;
    const title = `${path.title} | BlackPebble Academy`;
    const description = String(path.description).slice(0, 158);
    let html = applyMeta(baseHtml, { title, description, canonical });
    html = injectContent(html, pathContentHtml(path, academy, site));
    const outDir = join(distDir, "learn", "path", path.slug);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "index.html"), html, "utf8");
    pathPages += 1;
    sitemapEntries.push({ loc: canonical, priority: "0.7" });
  }

  const sitemapCount = writeSitemap(sitemapEntries);
  console.log(
    `[prerender-academy] wrote ${categoryPages} category + ${lessonPages} lesson + ${pathPages} path page(s); ${sitemapCount} sitemap URL(s).`,
  );
}

main().catch((err) => {
  console.error("[prerender-academy] failed:", err);
  process.exit(1);
});
