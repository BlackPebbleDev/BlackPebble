import seoData from "../../seo.routes.json";

export type RouteSeo = {
  path: string;
  title: string;
  /**
   * Optional social-preview title (Open Graph / Twitter). Falls back to `title`
   * when omitted. Lets the homepage show the clean "Solana Memecoin Trading
   * Intelligence Hub" in link previews while keeping the "BlackPebble | ..."
   * prefix on the browser/document title.
   */
  ogTitle?: string;
  description: string;
};

const SITE_URL: string = (seoData.siteUrl as string).replace(/\/$/, "");
const ROUTES: RouteSeo[] = seoData.routes as RouteSeo[];
const HOME: RouteSeo = ROUTES.find((r) => r.path === "/") ?? ROUTES[0];

/**
 * Resolve SEO metadata for a client-side location. Falls back to the home
 * entry for dynamic or unlisted routes (e.g. /u/:handle, /position/:mint).
 */
export function seoForPath(pathname: string): RouteSeo {
  const clean = pathname.split(/[?#]/)[0] || "/";
  const exact = ROUTES.find((r) => r.path === clean);
  if (exact) return exact;
  return HOME;
}

export function canonicalUrl(path: string): string {
  return path === "/" ? SITE_URL : `${SITE_URL}${path}`;
}

/**
 * Canonical URL for the actual current location. Dynamic / unlisted routes
 * (e.g. /u/:handle) canonicalize to their own URL - never to the homepage —
 * so they are not incorrectly collapsed into the home page.
 */
export function canonicalForLocation(location: string): string {
  const clean = location.split(/[?#]/)[0] || "/";
  return canonicalUrl(clean === "" ? "/" : clean);
}
