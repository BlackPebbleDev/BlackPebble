import { useEffect } from "react";
import { canonicalUrl } from "@/lib/seo";
import { lessonJsonLd } from "./structured-data";
import { categoryPath, lessonPath } from "./routes";
import type { NormalizedLesson } from "./normalize";

const JSONLD_ID = "academy-jsonld";

function setMetaByName(name: string, content: string) {
  let el = document.head.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setMetaByProperty(property: string, content: string) {
  let el = document.head.querySelector(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function setJsonLd(data: unknown) {
  let el = document.getElementById(JSONLD_ID);
  if (!el) {
    el = document.createElement("script");
    el.setAttribute("type", "application/ld+json");
    el.id = JSONLD_ID;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

function clearJsonLd() {
  document.getElementById(JSONLD_ID)?.remove();
}

/** Head metadata for a normalized lesson page (title, description, OG, JSON-LD). */
export function useLessonMeta(lesson: NormalizedLesson | undefined) {
  useEffect(() => {
    if (!lesson) return;
    const url = canonicalUrl(lessonPath(lesson.categoryId, lesson.slug));
    document.title = lesson.seo.title;
    setMetaByName("description", lesson.seo.description);
    setCanonical(url);
    setMetaByProperty("og:title", lesson.seo.title);
    setMetaByProperty("og:description", lesson.seo.description);
    setMetaByProperty("og:url", url);
    setMetaByName("twitter:title", lesson.seo.title);
    setMetaByName("twitter:description", lesson.seo.description);
    setJsonLd(lessonJsonLd(lesson, canonicalUrl("/")));
    return () => clearJsonLd();
  }, [lesson]);
}

/** Head metadata for a category page. */
export function useCategoryMeta(params: {
  id: string;
  title: string;
  description?: string;
  lessonCount: number;
} | undefined) {
  useEffect(() => {
    if (!params) return;
    const url = canonicalUrl(categoryPath(params.id));
    const title = `${params.title} | BlackPebble Academy`;
    const description =
      params.description ??
      `${params.title}: ${params.lessonCount} lessons in the BlackPebble Academy.`;
    document.title = title;
    setMetaByName("description", description);
    setCanonical(url);
    setMetaByProperty("og:title", title);
    setMetaByProperty("og:description", description);
    setMetaByProperty("og:url", url);
    setMetaByName("twitter:title", title);
    setMetaByName("twitter:description", description);
  }, [params]);
}
