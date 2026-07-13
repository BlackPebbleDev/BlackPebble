import { useEffect, useMemo, useState } from "react";
import { GraduationCap, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ACADEMY_CATEGORIES,
  searchAcademy,
} from "@/lib/education/registry";
import { AcademyCategorySection } from "@/components/education/academy-category";

const OPEN_KEY = "bp-academy-open-categories";
const DEFAULT_OPEN = ["start-here"];

function readOpenCategories(): string[] {
  try {
    const raw = sessionStorage.getItem(OPEN_KEY);
    if (!raw) return DEFAULT_OPEN;
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_OPEN;
  } catch {
    return DEFAULT_OPEN;
  }
}

function writeOpenCategories(ids: string[]) {
  try {
    sessionStorage.setItem(OPEN_KEY, JSON.stringify(ids));
  } catch {
    // ignore storage failures
  }
}

export default function LearnPage() {
  const [query, setQuery] = useState("");
  const [openCategories, setOpenCategories] = useState<string[]>(DEFAULT_OPEN);
  const [activeLessonSlug, setActiveLessonSlug] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  useEffect(() => {
    setOpenCategories(readOpenCategories());
  }, []);

  useEffect(() => {
    writeOpenCategories(openCategories);
  }, [openCategories]);

  const searchResults = useMemo(
    () => (query.trim() ? searchAcademy(query) : null),
    [query],
  );

  const visibleCategories = useMemo(() => {
    if (!searchResults) return ACADEMY_CATEGORIES;
    const ids = new Set(searchResults.map((result) => result.category.id));
    return ACADEMY_CATEGORIES.filter((category) => ids.has(category.id));
  }, [searchResults]);

  const matchedLessonMap = useMemo(() => {
    if (!searchResults) return null;
    const map = new Map<string, Set<string>>();
    for (const result of searchResults) {
      map.set(
        result.category.id,
        new Set(result.lessons.map((lesson) => lesson.slug)),
      );
    }
    return map;
  }, [searchResults]);

  useEffect(() => {
    if (searchResults && searchResults.length > 0) {
      setOpenCategories(searchResults.map((result) => result.category.id));
    }
  }, [searchResults]);

  useEffect(() => {
    function syncHash() {
      const slug = window.location.hash.replace(/^#/, "");
      if (!slug) {
        setActiveLessonSlug(null);
        return;
      }
      const category = ACADEMY_CATEGORIES.find((item) =>
        item.lessons.some((lesson) => lesson.slug === slug),
      );
      if (!category) return;
      setActiveLessonSlug(slug);
      setActiveCategoryId(category.id);
      setOpenCategories((prev) =>
        prev.includes(category.id) ? prev : [...prev, category.id],
      );
      window.requestAnimationFrame(() => {
        document.getElementById(slug)?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }

    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  function toggleCategory(id: string) {
    setOpenCategories((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function jumpToCategory(id: string) {
    setOpenCategories((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveCategoryId(id);
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <div className="flex w-full max-w-5xl flex-col gap-5 px-4 py-6 sm:gap-6 md:px-6 sm:py-10 mx-auto pb-24 md:pb-10 min-w-0">
      <PageHeader
        icon={GraduationCap}
        title="BlackPebble Academy"
        subtitle={
          <div className="space-y-1">
            <p>
              Learn the platform. Understand the market. Trade with more
              confidence.
            </p>
            <p className="text-xs text-muted-foreground/80">
              Built for beginners, useful for every trader.
            </p>
          </div>
        }
      />

      <div className="rounded-2xl bg-card shadow-card p-4 sm:p-5 space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search lessons, features, or terms"
            className="pl-9"
            aria-label="Search academy lessons"
            data-testid="input-academy-search"
          />
        </div>

        <div
          className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar"
          role="tablist"
          aria-label="Academy categories"
        >
          {ACADEMY_CATEGORIES.map((category) => {
            const active = activeCategoryId === category.id;
            return (
              <button
                key={category.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => jumpToCategory(category.id)}
                className={cn(
                  "flex-shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                  active
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-border bg-surface-2 text-muted-foreground hover:text-foreground hover:border-accent/30",
                )}
              >
                {category.title}
              </button>
            );
          })}
        </div>
      </div>

      {query.trim() && visibleCategories.length === 0 ? (
        <div className="rounded-2xl bg-card shadow-card px-5 py-10 text-center text-sm text-muted-foreground">
          No lessons matched your search. Try CA, MC, TP, SL, PnL, ATH, or a feature name.
        </div>
      ) : null}

      <div className="space-y-4">
        {visibleCategories.map((category) => (
          <AcademyCategorySection
            key={category.id}
            category={category}
            open={
              openCategories.includes(category.id) ||
              activeCategoryId === category.id ||
              !!searchResults
            }
            onToggle={() => toggleCategory(category.id)}
            matchedLessonSlugs={matchedLessonMap?.get(category.id)}
            activeLessonSlug={activeLessonSlug}
            forceOpenLessons={!!searchResults && !!query.trim()}
          />
        ))}
      </div>
    </div>
  );
}
