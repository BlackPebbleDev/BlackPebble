import {
  academyHomePath,
  categoryCanonicalUrl,
  categoryPath,
  lessonCanonicalUrl,
} from "./routes";
import type { NormalizedLesson } from "./normalize";

/**
 * JSON-LD structured data for a lesson: a primary item (DefinedTerm for glossary
 * entries, TechArticle otherwise) plus a BreadcrumbList. Kept as plain data so
 * both the client meta hook and the build-time prerender emit identical markup.
 * Schema is only attached where it genuinely fits the content.
 */
export function lessonJsonLd(
  lesson: NormalizedLesson,
  siteUrl: string,
): Record<string, unknown>[] {
  const site = siteUrl.replace(/\/$/, "");
  const canonical = lessonCanonicalUrl(site, lesson.categoryId, lesson.slug);

  const primary: Record<string, unknown> =
    lesson.kind === "glossary"
      ? {
          "@context": "https://schema.org",
          "@type": "DefinedTerm",
          name: lesson.title,
          description: lesson.seo.description,
          url: canonical,
          inDefinedTermSet: `${site}${categoryPath(lesson.categoryId)}`,
        }
      : {
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: lesson.title,
          name: lesson.title,
          description: lesson.seo.description,
          url: canonical,
          inLanguage: "en",
          isAccessibleForFree: true,
          articleSection: lesson.categoryTitle,
          publisher: {
            "@type": "Organization",
            name: "BlackPebble",
            url: site,
          },
        };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "BlackPebble Academy",
        item: `${site}${academyHomePath()}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: lesson.categoryTitle,
        item: categoryCanonicalUrl(site, lesson.categoryId),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: lesson.title,
        item: canonical,
      },
    ],
  };

  return [primary, breadcrumb];
}
