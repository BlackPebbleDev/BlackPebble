import { useEffect } from "react";
import { useLocation } from "wouter";
import { seoForPath, canonicalForLocation } from "@/lib/seo";

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

/**
 * Keeps the document head (title, description, canonical, Open Graph, Twitter)
 * in sync with the current route during client-side navigation. The initial,
 * crawler-visible metadata is produced statically at build time (index.html and
 * the prerender step); this component handles SPA route changes for JS clients.
 */
export function RouteMeta() {
  const [location] = useLocation();

  useEffect(() => {
    const seo = seoForPath(location);
    const url = canonicalForLocation(location);

    document.title = seo.title;
    setMetaByName("description", seo.description);
    setCanonical(url);
    setMetaByProperty("og:title", seo.title);
    setMetaByProperty("og:description", seo.description);
    setMetaByProperty("og:url", url);
    setMetaByName("twitter:title", seo.title);
    setMetaByName("twitter:description", seo.description);
  }, [location]);

  return null;
}
