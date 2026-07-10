import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Plus,
  Search as SearchIcon,
  Pencil,
  Trash2,
  Eye,
  Sparkles,
  Lock,
} from "lucide-react";
import { api, type JournalEntry, type JournalStats } from "@/lib/api";
import {
  TradePickerDialog,
  type PickedTrade,
} from "@/components/journal/trade-picker";
import {
  EMPTY_FORM,
  JournalEntryDialog,
  Segmented,
  StarRating,
  TEMPLATES,
  entryToForm,
  formFromPickedTrade,
  type FormState,
  type TemplateKey,
} from "@/components/journal/journal-entry-dialog";
import { fmtMarketCap, fmtSignedSol, pnlColor } from "@/lib/format";
import { useXAuth } from "@/hooks/use-x-auth";
import { UtilityPageHeader } from "@/components/utility-page-header";
import { getUtility } from "@/lib/utilities-meta";

const JOURNAL = getUtility("journal");
const JOURNAL_SUBTITLE =
  "Review trades, track lessons, and improve performance over time.";
import { useToast } from "@/hooks/use-toast";
import { XLoginButton } from "@/components/x-login-button";
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
function fmtDate(epoch: number | null | undefined): string {
  if (!epoch) return "—";
  return new Date(epoch * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

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

const OUTCOME_STYLES: Record<string, string> = {
  win: "bg-success/12 text-success",
  loss: "bg-destructive/12 text-destructive",
  neutral: "bg-surface-3 text-muted-foreground",
};

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
      <UtilityPageHeader utility={JOURNAL} subtitle={JOURNAL_SUBTITLE} />
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
  const [pickerOpen, setPickerOpen] = useState(false);
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

  /** "From Trade" - prefill the editor from a real trade the user picked. */
  function openFromTrade(t: PickedTrade) {
    setEditing(null);
    setEditorForm(formFromPickedTrade(t));
    setPickerOpen(false);
    setEditorOpen(true);
  }

  const [editorForm, setEditorForm] = useState<FormState>(EMPTY_FORM);

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

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:py-10 max-w-5xl mx-auto">
      <UtilityPageHeader
        utility={JOURNAL}
        subtitle={JOURNAL_SUBTITLE}
        actions={
          <>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="inline-flex items-center gap-2 px-4 h-11 rounded-full bg-surface-2 text-foreground hover:bg-surface-3 text-sm font-medium transition-colors"
              data-testid="button-create-from-trade"
            >
              <Sparkles className="w-4 h-4 text-accent" />
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
          </>
        }
      />

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

      {/* Editor (shared with the feed's inline "Journal this trade" button) */}
      <JournalEntryDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        seed={editorForm}
        editingId={editing?.id ?? null}
        onSaved={() => setEditing(null)}
      />

      {/* From Trade picker */}
      <TradePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={openFromTrade}
      />

      {/* Viewer */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden no-scrollbar">
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
        {entry.source && entry.source !== "manual" ? (
          <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Linked {entry.source === "leverage" ? "perps" : "spot"} trade
            </div>
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs">
              {entry.entry_mc != null && (
                <span className="text-muted-foreground">
                  Entry{" "}
                  <span className="font-mono text-foreground">
                    {fmtMarketCap(entry.entry_mc)}
                  </span>
                </span>
              )}
              {entry.exit_mc != null && (
                <span className="text-muted-foreground">
                  Exit{" "}
                  <span className="font-mono text-foreground">
                    {fmtMarketCap(entry.exit_mc)}
                  </span>
                </span>
              )}
              {entry.pnl != null && (
                <span className="text-muted-foreground">
                  PnL{" "}
                  <span className={cn("font-mono", pnlColor(entry.pnl))}>
                    {fmtSignedSol(entry.pnl)} SOL
                  </span>
                </span>
              )}
              {entry.roi != null && (
                <span className="text-muted-foreground">
                  ROI{" "}
                  <span className={cn("font-mono", pnlColor(entry.roi))}>
                    {entry.roi >= 0 ? "+" : ""}
                    {entry.roi.toFixed(1)}%
                  </span>
                </span>
              )}
            </div>
          </div>
        ) : null}
        <ReadField label="Entry Reason" value={entry.entry_reason} />
        <ReadField label="Exit Reason" value={entry.exit_reason} />
        <ReadField label="What Went Right" value={entry.went_right} />
        <ReadField label="What Went Wrong" value={entry.went_wrong} />
        <ReadField label="Lessons Learned" value={entry.lessons} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ReadField label="Emotion - Before" value={entry.emotion_before} />
          <ReadField label="Emotion - After" value={entry.emotion_after} />
        </div>
        <ReadField label="Notes" value={entry.notes} />
      </div>
    </div>
  );
}

