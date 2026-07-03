import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Plus,
  Star,
  Search as SearchIcon,
  Pencil,
  Trash2,
  Eye,
  Sparkles,
  Lock,
} from "lucide-react";
import { api, type JournalEntry, type JournalInput, type JournalStats } from "@/lib/api";
import { useXAuth } from "@/hooks/use-x-auth";
import { useToast } from "@/hooks/use-toast";
import { XLoginButton } from "@/components/x-login-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

// ── Helpers ──────────────────────────────────────────────────────────────────
function toEpoch(dateStr: string): number | null {
  if (!dateStr) return null;
  const ms = Date.parse(`${dateStr}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}
function toDateInput(epoch: number | null | undefined): string {
  if (!epoch) return "";
  return new Date(epoch * 1000).toISOString().slice(0, 10);
}
function fmtDate(epoch: number | null | undefined): string {
  if (!epoch) return "—";
  return new Date(epoch * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type FormState = {
  title: string;
  tradeType: "spot" | "leverage" | "";
  direction: "long" | "short" | "";
  outcome: "win" | "loss" | "neutral" | "";
  token: string;
  tradeDate: string;
  entryReason: string;
  exitReason: string;
  wentRight: string;
  wentWrong: string;
  lessons: string;
  emotionBefore: string;
  emotionAfter: string;
  rating: number;
  notes: string;
  template: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  tradeType: "",
  direction: "",
  outcome: "",
  token: "",
  tradeDate: toDateInput(Math.floor(Date.now() / 1000)),
  entryReason: "",
  exitReason: "",
  wentRight: "",
  wentWrong: "",
  lessons: "",
  emotionBefore: "",
  emotionAfter: "",
  rating: 0,
  notes: "",
  template: "",
};

type TemplateKey = "winning" | "losing" | "quick";
const TEMPLATES: Record<
  TemplateKey,
  { label: string; description: string; apply: (f: FormState) => FormState }
> = {
  winning: {
    label: "Winning Trade Review",
    description: "What worked, can it repeat, what was the edge",
    apply: (f) => ({
      ...f,
      template: "winning",
      title: f.title || "Winning Trade Review",
      outcome: "win",
      wentRight: f.wentRight || "What worked?\n\n",
      lessons: f.lessons || "Can this be repeated?\n\nWhat was the edge?\n\n",
    }),
  },
  losing: {
    label: "Losing Trade Review",
    description: "Mistake, risk, FOMO, what to change",
    apply: (f) => ({
      ...f,
      template: "losing",
      title: f.title || "Losing Trade Review",
      outcome: "loss",
      wentWrong:
        f.wentWrong ||
        "What mistake was made?\n\nWas risk managed?\n\nWas this FOMO?\n\n",
      lessons: f.lessons || "What should change next time?\n\n",
    }),
  },
  quick: {
    label: "Quick Trade Review",
    description: "Why enter, follow plan, what happened, lesson",
    apply: (f) => ({
      ...f,
      template: "quick",
      title: f.title || "Quick Trade Review",
      entryReason: f.entryReason || "Why did I enter?\n\nDid I follow my plan?\n\n",
      exitReason: f.exitReason || "What happened?\n\n",
      lessons: f.lessons || "What did I learn?\n\n",
    }),
  },
};

// ── Small UI pieces ──────────────────────────────────────────────────────────
function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="rounded-xl bg-card shadow-card px-4 py-3.5 transition-colors hover:bg-surface-3">
      <div className="stat-label mb-1.5">{label}</div>
      <div className={cn("stat-value text-xl md:text-2xl", className)}>{value}</div>
    </div>
  );
}

function StarRating({
  value,
  onChange,
  readonly,
  size = "w-5 h-5",
}: {
  value: number;
  onChange?: (n: number) => void;
  readonly?: boolean;
  size?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(n === value ? 0 : n)}
          className={cn(
            "transition-transform",
            !readonly && "hover:scale-110 cursor-pointer",
          )}
          data-testid={readonly ? undefined : `star-${n}`}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          <Star
            className={cn(
              size,
              n <= value
                ? "fill-accent text-accent"
                : "text-muted-foreground/40",
            )}
          />
        </button>
      ))}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T | "";
  onChange: (v: T | "") => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-full bg-surface-2 p-1 gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(value === o.value ? "" : o.value)}
          className={cn(
            "px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors",
            value === o.value
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          data-testid={`seg-${o.value}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const OUTCOME_STYLES: Record<string, string> = {
  win: "bg-success/12 text-success",
  loss: "bg-destructive/12 text-destructive",
  neutral: "bg-surface-3 text-muted-foreground",
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function TradingJournal() {
  const { loggedIn } = useXAuth();

  if (!loggedIn) {
    return <JournalGate />;
  }
  return <JournalDashboard />;
}

function JournalGate() {
  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:py-10 max-w-5xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Trading Journal
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Review trades, track lessons, and improve performance over time.
        </p>
      </div>
      <div className="rounded-2xl bg-gradient-to-br from-accent/10 via-card to-card border border-accent/20 shadow-card p-8 sm:p-10 max-w-xl mx-auto w-full text-center">
        <div className="w-14 h-14 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-5">
          <Lock className="w-7 h-7 text-accent" />
        </div>
        <h2 className="text-xl font-bold mb-2">Connect X to start journaling</h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
          Your Trading Journal is private and saved to your account. Connect X to
          record entries, track lessons, and build your improvement history.
        </p>
        <div className="flex justify-center">
          <XLoginButton />
        </div>
      </div>
    </div>
  );
}

function JournalDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: statsData } = useQuery({
    queryKey: ["journal-stats"],
    queryFn: api.journal.stats,
  });
  const { data: listData, isLoading } = useQuery({
    queryKey: ["journal"],
    queryFn: api.journal.list,
  });

  const stats: JournalStats = statsData?.stats ?? {
    totalEntries: 0,
    entriesThisMonth: 0,
    winningReviews: 0,
    losingReviews: 0,
    lessonsRecorded: 0,
  };
  const entries = listData?.entries ?? [];

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [viewing, setViewing] = useState<JournalEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JournalEntry | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "spot" | "leverage">("");
  const [outcomeFilter, setOutcomeFilter] = useState<
    "" | "win" | "loss" | "neutral"
  >("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (typeFilter && e.trade_type !== typeFilter) return false;
      if (outcomeFilter && e.outcome !== outcomeFilter) return false;
      if (!q) return true;
      return [e.title, e.token, e.notes, e.lessons, e.entry_reason]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [entries, search, typeFilter, outcomeFilter]);

  function openNew(template?: TemplateKey) {
    let form = { ...EMPTY_FORM };
    if (template) form = TEMPLATES[template].apply(form);
    setEditing(null);
    setEditorForm(form);
    setEditorOpen(true);
  }
  function openEdit(entry: JournalEntry) {
    setEditing(entry);
    setEditorForm(entryToForm(entry));
    setEditorOpen(true);
  }

  const [editorForm, setEditorForm] = useState<FormState>(EMPTY_FORM);

  const saveMutation = useMutation({
    mutationFn: (payload: { id: number | null; input: JournalInput }) =>
      payload.id == null
        ? api.journal.create(payload.input)
        : api.journal.update(payload.id, payload.input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal"] });
      queryClient.invalidateQueries({ queryKey: ["journal-stats"] });
      setEditorOpen(false);
      setEditing(null);
      toast({
        title: editing ? "Entry updated" : "Entry saved",
        description: "Your journal has been updated.",
      });
    },
    onError: (e) =>
      toast({
        title: "Couldn't save entry",
        description: (e as Error).message,
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.journal.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal"] });
      queryClient.invalidateQueries({ queryKey: ["journal-stats"] });
      setDeleteTarget(null);
      toast({ title: "Entry deleted" });
    },
    onError: (e) =>
      toast({
        title: "Couldn't delete entry",
        description: (e as Error).message,
        variant: "destructive",
      }),
  });

  function submit() {
    const input: JournalInput = {
      title: editorForm.title || null,
      tradeType: editorForm.tradeType || null,
      direction: editorForm.direction || null,
      outcome: editorForm.outcome || null,
      token: editorForm.token || null,
      tradeDate: toEpoch(editorForm.tradeDate),
      entryReason: editorForm.entryReason || null,
      exitReason: editorForm.exitReason || null,
      wentRight: editorForm.wentRight || null,
      wentWrong: editorForm.wentWrong || null,
      lessons: editorForm.lessons || null,
      emotionBefore: editorForm.emotionBefore || null,
      emotionAfter: editorForm.emotionAfter || null,
      rating: editorForm.rating || null,
      notes: editorForm.notes || null,
      template: editorForm.template || null,
    };
    saveMutation.mutate({ id: editing?.id ?? null, input });
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:py-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Trading Journal
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Review trades, track lessons, and improve performance over time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            title="Coming soon — auto-fill an entry from one of your trades"
            className="inline-flex items-center gap-2 px-4 h-11 rounded-full bg-surface-2 text-muted-foreground text-sm font-medium cursor-not-allowed opacity-70"
            data-testid="button-create-from-trade"
          >
            <Sparkles className="w-4 h-4" />
            From Trade
          </button>
          <button
            type="button"
            onClick={() => openNew()}
            className="inline-flex items-center gap-2 px-4 h-11 rounded-full bg-accent text-accent-foreground hover:bg-accent/90 text-sm font-semibold transition-colors shadow-card"
            data-testid="button-new-entry"
          >
            <Plus className="w-4 h-4" />
            New Journal Entry
          </button>
        </div>
      </div>

      {/* KPI dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Total Entries" value={stats.totalEntries} />
        <Stat label="This Month" value={stats.entriesThisMonth} />
        <Stat
          label="Winning Reviews"
          value={stats.winningReviews}
          className="text-success"
        />
        <Stat
          label="Losing Reviews"
          value={stats.losingReviews}
          className="text-destructive"
        />
        <Stat label="Lessons Recorded" value={stats.lessonsRecorded} />
      </div>

      {/* Templates */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Start from a template
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(Object.keys(TEMPLATES) as TemplateKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => openNew(key)}
              className="group text-left card-interactive rounded-2xl bg-card shadow-card p-4 flex items-start gap-3"
              data-testid={`template-${key}`}
            >
              <div className="w-10 h-10 rounded-full bg-accent/12 flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-5 h-5 text-accent" />
              </div>
              <div className="min-w-0">
                <div className="font-bold">{TEMPLATES[key].label}</div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {TEMPLATES[key].description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* History */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Journal History</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search entries..."
                data-testid="input-journal-search"
                className="h-9 rounded-full bg-surface-2 border border-border pl-9 pr-3 text-sm focus:outline-none focus:border-accent/50 w-44"
              />
            </div>
            <Segmented
              value={typeFilter}
              onChange={(v) => setTypeFilter(v as "" | "spot" | "leverage")}
              options={[
                { value: "spot", label: "Spot" },
                { value: "leverage", label: "Perps" },
              ]}
            />
            <Segmented
              value={outcomeFilter}
              onChange={(v) =>
                setOutcomeFilter(v as "" | "win" | "loss" | "neutral")
              }
              options={[
                { value: "win", label: "Win" },
                { value: "loss", label: "Loss" },
              ]}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-10 text-center">
            Loading your journal…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-card shadow-card p-10 text-center">
            <div className="w-12 h-12 rounded-full bg-accent/12 flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-6 h-6 text-accent" />
            </div>
            <p className="font-semibold mb-1">
              {entries.length === 0
                ? "No journal entries yet"
                : "No entries match your filters"}
            </p>
            <p className="text-sm text-muted-foreground">
              {entries.length === 0
                ? "Record your first trade review to start tracking lessons."
                : "Try clearing your search or filters."}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl bg-card shadow-card overflow-hidden divide-y divide-border">
            {filtered.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-4 px-4 py-3.5 hover:bg-surface-3 transition-colors"
                data-testid={`journal-row-${e.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold truncate">
                      {e.title || "Untitled entry"}
                    </span>
                    {e.outcome ? (
                      <span
                        className={cn(
                          "text-[10px] uppercase font-bold px-2 py-0.5 rounded-full",
                          OUTCOME_STYLES[e.outcome] ?? OUTCOME_STYLES.neutral,
                        )}
                      >
                        {e.outcome}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                    <span>{fmtDate(e.trade_date ?? e.created_at)}</span>
                    {e.token ? (
                      <>
                        <span>·</span>
                        <span className="text-foreground/80">{e.token}</span>
                      </>
                    ) : null}
                    {e.trade_type ? (
                      <>
                        <span>·</span>
                        <span className="capitalize">{e.trade_type}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                {e.rating ? (
                  <div className="hidden sm:block">
                    <StarRating value={e.rating} readonly size="w-4 h-4" />
                  </div>
                ) : null}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setViewing(e)}
                    className="p-2 rounded-full text-muted-foreground hover:text-accent hover:bg-surface-2 transition-colors"
                    data-testid={`button-view-${e.id}`}
                    aria-label="View entry"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(e)}
                    className="p-2 rounded-full text-muted-foreground hover:text-accent hover:bg-surface-2 transition-colors"
                    data-testid={`button-edit-${e.id}`}
                    aria-label="Edit entry"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(e)}
                    className="p-2 rounded-full text-muted-foreground hover:text-destructive hover:bg-surface-2 transition-colors"
                    data-testid={`button-delete-${e.id}`}
                    aria-label="Delete entry"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Journal Entry" : "New Journal Entry"}
            </DialogTitle>
            <DialogDescription>
              Capture your reasoning, emotions, and lessons so you can review them
              later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <Field label="Entry Title">
              <Input
                value={editorForm.title}
                onChange={(e) =>
                  setEditorForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="e.g. BONK breakout — patience paid off"
                data-testid="input-title"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Trade Type">
                <Segmented
                  value={editorForm.tradeType}
                  onChange={(v) =>
                    setEditorForm((f) => ({
                      ...f,
                      tradeType: v as FormState["tradeType"],
                    }))
                  }
                  options={[
                    { value: "spot", label: "Spot" },
                    { value: "leverage", label: "Perps" },
                  ]}
                />
              </Field>
              <Field label="Direction">
                <Segmented
                  value={editorForm.direction}
                  onChange={(v) =>
                    setEditorForm((f) => ({
                      ...f,
                      direction: v as FormState["direction"],
                    }))
                  }
                  options={[
                    { value: "long", label: "Long" },
                    { value: "short", label: "Short" },
                  ]}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Token">
                <Input
                  value={editorForm.token}
                  onChange={(e) =>
                    setEditorForm((f) => ({ ...f, token: e.target.value }))
                  }
                  placeholder="e.g. BONK"
                  data-testid="input-token"
                />
              </Field>
              <Field label="Date">
                <Input
                  type="date"
                  value={editorForm.tradeDate}
                  onChange={(e) =>
                    setEditorForm((f) => ({ ...f, tradeDate: e.target.value }))
                  }
                  data-testid="input-date"
                />
              </Field>
            </div>

            <Field label="Outcome">
              <Segmented
                value={editorForm.outcome}
                onChange={(v) =>
                  setEditorForm((f) => ({
                    ...f,
                    outcome: v as FormState["outcome"],
                  }))
                }
                options={[
                  { value: "win", label: "Win" },
                  { value: "loss", label: "Loss" },
                  { value: "neutral", label: "Neutral" },
                ]}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Entry Reason">
                <Textarea
                  value={editorForm.entryReason}
                  onChange={(e) =>
                    setEditorForm((f) => ({ ...f, entryReason: e.target.value }))
                  }
                  rows={3}
                  placeholder="Why did you enter?"
                  data-testid="input-entry-reason"
                />
              </Field>
              <Field label="Exit Reason">
                <Textarea
                  value={editorForm.exitReason}
                  onChange={(e) =>
                    setEditorForm((f) => ({ ...f, exitReason: e.target.value }))
                  }
                  rows={3}
                  placeholder="Why did you exit?"
                  data-testid="input-exit-reason"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="What Went Right">
                <Textarea
                  value={editorForm.wentRight}
                  onChange={(e) =>
                    setEditorForm((f) => ({ ...f, wentRight: e.target.value }))
                  }
                  rows={3}
                  data-testid="input-went-right"
                />
              </Field>
              <Field label="What Went Wrong">
                <Textarea
                  value={editorForm.wentWrong}
                  onChange={(e) =>
                    setEditorForm((f) => ({ ...f, wentWrong: e.target.value }))
                  }
                  rows={3}
                  data-testid="input-went-wrong"
                />
              </Field>
            </div>

            <Field label="Lessons Learned">
              <Textarea
                value={editorForm.lessons}
                onChange={(e) =>
                  setEditorForm((f) => ({ ...f, lessons: e.target.value }))
                }
                rows={3}
                placeholder="What will you do differently next time?"
                data-testid="input-lessons"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Emotional State — Before">
                <Input
                  value={editorForm.emotionBefore}
                  onChange={(e) =>
                    setEditorForm((f) => ({
                      ...f,
                      emotionBefore: e.target.value,
                    }))
                  }
                  placeholder="e.g. Confident, calm"
                  data-testid="input-emotion-before"
                />
              </Field>
              <Field label="Emotional State — After">
                <Input
                  value={editorForm.emotionAfter}
                  onChange={(e) =>
                    setEditorForm((f) => ({
                      ...f,
                      emotionAfter: e.target.value,
                    }))
                  }
                  placeholder="e.g. Satisfied, relieved"
                  data-testid="input-emotion-after"
                />
              </Field>
            </div>

            <Field label="Rating">
              <StarRating
                value={editorForm.rating}
                onChange={(n) => setEditorForm((f) => ({ ...f, rating: n }))}
              />
            </Field>

            <Field label="Notes">
              <Textarea
                value={editorForm.notes}
                onChange={(e) =>
                  setEditorForm((f) => ({ ...f, notes: e.target.value }))
                }
                rows={4}
                placeholder="Anything else worth remembering…"
                data-testid="input-notes"
              />
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              className="px-4 h-10 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-cancel-entry"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saveMutation.isPending}
              className="px-5 h-10 rounded-full bg-accent text-accent-foreground hover:bg-accent/90 text-sm font-semibold transition-colors disabled:opacity-60"
              data-testid="button-save-entry"
            >
              {saveMutation.isPending
                ? "Saving…"
                : editing
                  ? "Save Changes"
                  : "Save Entry"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Viewer */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewing ? <EntryViewer entry={viewing} /> : null}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes “{deleteTarget?.title || "Untitled entry"}
              ” from your journal. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.id)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ReadField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <p className="text-sm whitespace-pre-wrap text-foreground/90">{value}</p>
    </div>
  );
}

function EntryViewer({ entry }: { entry: JournalEntry }) {
  return (
    <div>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 flex-wrap">
          {entry.title || "Untitled entry"}
          {entry.outcome ? (
            <span
              className={cn(
                "text-[10px] uppercase font-bold px-2 py-0.5 rounded-full",
                OUTCOME_STYLES[entry.outcome] ?? OUTCOME_STYLES.neutral,
              )}
            >
              {entry.outcome}
            </span>
          ) : null}
        </DialogTitle>
        <DialogDescription className="flex items-center gap-2 flex-wrap">
          {fmtDate(entry.trade_date ?? entry.created_at)}
          {entry.token ? <span>· {entry.token}</span> : null}
          {entry.trade_type ? (
            <span className="capitalize">· {entry.trade_type}</span>
          ) : null}
          {entry.direction ? (
            <span className="capitalize">· {entry.direction}</span>
          ) : null}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-3">
        {entry.rating ? (
          <StarRating value={entry.rating} readonly />
        ) : null}
        <ReadField label="Entry Reason" value={entry.entry_reason} />
        <ReadField label="Exit Reason" value={entry.exit_reason} />
        <ReadField label="What Went Right" value={entry.went_right} />
        <ReadField label="What Went Wrong" value={entry.went_wrong} />
        <ReadField label="Lessons Learned" value={entry.lessons} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ReadField label="Emotion — Before" value={entry.emotion_before} />
          <ReadField label="Emotion — After" value={entry.emotion_after} />
        </div>
        <ReadField label="Notes" value={entry.notes} />
      </div>
    </div>
  );
}

function entryToForm(e: JournalEntry): FormState {
  return {
    title: e.title ?? "",
    tradeType: (e.trade_type as FormState["tradeType"]) ?? "",
    direction: (e.direction as FormState["direction"]) ?? "",
    outcome: (e.outcome as FormState["outcome"]) ?? "",
    token: e.token ?? "",
    tradeDate: toDateInput(e.trade_date),
    entryReason: e.entry_reason ?? "",
    exitReason: e.exit_reason ?? "",
    wentRight: e.went_right ?? "",
    wentWrong: e.went_wrong ?? "",
    lessons: e.lessons ?? "",
    emotionBefore: e.emotion_before ?? "",
    emotionAfter: e.emotion_after ?? "",
    rating: e.rating ?? 0,
    notes: e.notes ?? "",
    template: e.template ?? "",
  };
}
