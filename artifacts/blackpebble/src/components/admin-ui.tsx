import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { STATUS_META, type StatusLevel } from "@/lib/admin-ops";
import { cn } from "@/lib/utils";

/** Status pill: colored dot + label. Red is reserved for `critical` only. */
export function StatusChip({
  level,
  label,
  className,
}: {
  level: StatusLevel;
  label?: string;
  className?: string;
}) {
  const meta = STATUS_META[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        meta.text,
        className,
      )}
      data-status={level}
    >
      <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", meta.dot)} aria-hidden />
      {label ?? meta.label}
    </span>
  );
}

function readOpen(id: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(`bp-admin-open-${id}`);
    return v == null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

/**
 * Collapsible, anchor-linked admin section with a premium header. Open/closed
 * state persists per-section in localStorage. `alert` opens the section
 * automatically and shows a chip so operators never miss something unhealthy.
 */
export function AdminSection({
  id,
  title,
  icon: Icon,
  defaultOpen = false,
  status,
  alert = false,
  right,
  children,
}: {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  status?: StatusLevel;
  /** When true, force-open on mount (something needs attention). */
  alert?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(() => readOpen(id, defaultOpen || alert));

  // If a section develops an alert after mount, reveal it once.
  useEffect(() => {
    if (alert) setOpen(true);
  }, [alert]);

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      try {
        localStorage.setItem(`bp-admin-open-${id}`, next ? "1" : "0");
      } catch {
        /* ignore storage errors */
      }
      return next;
    });
  };

  return (
    <section id={id} className="scroll-mt-28">
      {/* Lightweight grouping header (a bar, not a card) so it composes cleanly
          with the card-based sub-sections it contains - no card-in-card. */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        data-testid={`admin-section-${id}`}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-2 text-left transition-colors hover:bg-surface-2/50"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
            <Icon className="h-4 w-4" />
          </span>
          <span className="truncate text-sm font-semibold uppercase tracking-wider text-foreground">
            {title}
          </span>
          {status && <StatusChip level={status} />}
        </span>
        <span className="flex flex-shrink-0 items-center gap-2">
          {right}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </span>
      </button>
      {open && <div className="mt-3 space-y-4">{children}</div>}
    </section>
  );
}

export interface AdminNavItem {
  id: string;
  label: string;
}

/**
 * Sticky, mobile-first section jump bar. Horizontally scrollable pill row with
 * hidden scrollbars; clicking a pill smooth-scrolls to that section. Never
 * overflows the page or covers content.
 */
export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const [active, setActive] = useState<string>(items[0]?.id ?? "");

  const jump = (id: string) => {
    setActive(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav
      aria-label="Admin sections"
      className="sticky top-0 z-30 -mx-4 mb-4 border-b border-border/50 bg-background/85 px-4 py-2 backdrop-blur md:-mx-6 md:px-6"
    >
      <div className="flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => jump(it.id)}
            data-testid={`admin-nav-${it.id}`}
            className={cn(
              "flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active === it.id
                ? "border-accent/50 bg-accent/15 text-accent"
                : "border-border/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {it.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
