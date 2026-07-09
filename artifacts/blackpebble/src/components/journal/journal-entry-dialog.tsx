import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import {
  api,
  type JournalEntry,
  type JournalInput,
} from "@/lib/api";
import type { PickedTrade } from "@/components/journal/trade-picker";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fmtMarketCap, fmtSignedSol, pnlColor } from "@/lib/format";
import { cn } from "@/lib/utils";

// ── Date helpers ─────────────────────────────────────────────────────────────
export function toEpoch(dateStr: string): number | null {
  if (!dateStr) return null;
  const ms = Date.parse(`${dateStr}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}
export function toDateInput(epoch: number | null | undefined): string {
  if (!epoch) return "";
  return new Date(epoch * 1000).toISOString().slice(0, 10);
}

// ── Form model ───────────────────────────────────────────────────────────────
export type FormState = {
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
  // Structured trade link - populated by the "From Trade" flow, preserved on
  // edit so the linked trade data survives round-trips.
  tokenMint: string;
  source: string;
  entryMc: number | null;
  exitMc: number | null;
  roi: number | null;
  pnl: number | null;
};

export const EMPTY_FORM: FormState = {
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
  tokenMint: "",
  source: "manual",
  entryMc: null,
  exitMc: null,
  roi: null,
  pnl: null,
};

export type TemplateKey = "winning" | "losing" | "quick";
export const TEMPLATES: Record<
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
      entryReason:
        f.entryReason || "Why did I enter?\n\nDid I follow my plan?\n\n",
      exitReason: f.exitReason || "What happened?\n\n",
      lessons: f.lessons || "What did I learn?\n\n",
    }),
  },
};

/** Rebuild the editor form from a saved entry (edit flow). */
export function entryToForm(e: JournalEntry): FormState {
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
    tokenMint: e.token_mint ?? "",
    source: e.source ?? "manual",
    entryMc: e.entry_mc,
    exitMc: e.exit_mc,
    roi: e.roi,
    pnl: e.pnl,
  };
}

/**
 * Prefill the editor from a real trade the user picked (journal "From Trade"
 * flow, and the feed's inline "Journal" button). Reasoning/emotions/lessons
 * stay blank for the user to fill in; only the structured facts are seeded.
 */
export function formFromPickedTrade(t: PickedTrade): FormState {
  const outcomeWord =
    t.outcome === "win" ? "Win" : t.outcome === "loss" ? "Loss" : "Review";
  const typeWord =
    t.tradeType === "leverage"
      ? `${t.leverage ?? "?"}x ${t.direction}`
      : `spot ${t.detail.toLowerCase()}`;
  return {
    ...EMPTY_FORM,
    title: `${t.token} ${typeWord} - ${outcomeWord}`,
    tradeType: t.tradeType,
    direction: t.direction,
    outcome: t.outcome ?? "",
    token: t.token,
    tradeDate: toDateInput(t.ts),
    tokenMint: t.tokenMint,
    source: t.source,
    entryMc: t.entryMc,
    exitMc: t.exitMc,
    roi: t.roiPct,
    pnl: t.pnlSol,
  };
}

// ── Shared small UI pieces ─────────────────────────────────────────────────────
export function StarRating({
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

export function Segmented<T extends string>({
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

// ── The editor dialog ──────────────────────────────────────────────────────────
/**
 * The shared journal entry editor. Owns its own form state, save mutation,
 * query invalidation and success toast. Callers pass a `seed` form (blank, a
 * template, an entry being edited, or a trade prefill) and an `editingId`
 * (null for new). Mounted by both the Journal page and the feed's inline
 * "Journal this trade" button.
 */
export function JournalEntryDialog({
  open,
  onOpenChange,
  seed,
  editingId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seed: FormState;
  editingId: number | null;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(seed);

  // Re-seed the editor whenever it opens (rising edge). A ref keeps the latest
  // seed without re-running on unrelated parent re-renders that would clobber
  // in-progress edits.
  const seedRef = useRef(seed);
  seedRef.current = seed;
  useEffect(() => {
    if (open) setForm(seedRef.current);
  }, [open]);

  const isEditing = editingId != null;

  const saveMutation = useMutation({
    mutationFn: (payload: { id: number | null; input: JournalInput }) =>
      payload.id == null
        ? api.journal.create(payload.input)
        : api.journal.update(payload.id, payload.input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal"] });
      queryClient.invalidateQueries({ queryKey: ["journal-stats"] });
      onOpenChange(false);
      onSaved?.();
      toast({
        title: isEditing ? "Entry updated" : "Entry saved",
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

  function submit() {
    const input: JournalInput = {
      title: form.title || null,
      tradeType: form.tradeType || null,
      direction: form.direction || null,
      outcome: form.outcome || null,
      token: form.token || null,
      tradeDate: toEpoch(form.tradeDate),
      entryReason: form.entryReason || null,
      exitReason: form.exitReason || null,
      wentRight: form.wentRight || null,
      wentWrong: form.wentWrong || null,
      lessons: form.lessons || null,
      emotionBefore: form.emotionBefore || null,
      emotionAfter: form.emotionAfter || null,
      rating: form.rating || null,
      notes: form.notes || null,
      template: form.template || null,
      tokenMint: form.tokenMint || null,
      source: form.source || "manual",
      entryMc: form.entryMc,
      exitMc: form.exitMc,
      roi: form.roi,
      pnl: form.pnl,
    };
    saveMutation.mutate({ id: editingId, input });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Journal Entry" : "New Journal Entry"}
          </DialogTitle>
          <DialogDescription>
            Capture your reasoning, emotions, and lessons so you can review them
            later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {form.source !== "manual" && form.source !== "" && (
            <div
              className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3"
              data-testid="linked-trade-summary"
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Linked {form.source === "leverage" ? "perps" : "spot"} trade
              </div>
              <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs">
                {form.entryMc != null && (
                  <span className="text-muted-foreground">
                    Entry{" "}
                    <span className="font-mono text-foreground">
                      {fmtMarketCap(form.entryMc)}
                    </span>
                  </span>
                )}
                {form.exitMc != null && (
                  <span className="text-muted-foreground">
                    Exit{" "}
                    <span className="font-mono text-foreground">
                      {fmtMarketCap(form.exitMc)}
                    </span>
                  </span>
                )}
                {form.pnl != null && (
                  <span className="text-muted-foreground">
                    PnL{" "}
                    <span className={cn("font-mono", pnlColor(form.pnl))}>
                      {fmtSignedSol(form.pnl)} SOL
                    </span>
                  </span>
                )}
                {form.roi != null && (
                  <span className="text-muted-foreground">
                    ROI{" "}
                    <span className={cn("font-mono", pnlColor(form.roi))}>
                      {form.roi >= 0 ? "+" : ""}
                      {form.roi.toFixed(1)}%
                    </span>
                  </span>
                )}
              </div>
            </div>
          )}

          <Field label="Entry Title">
            <Input
              value={form.title}
              onChange={(e) =>
                setForm((f) => ({ ...f, title: e.target.value }))
              }
              placeholder="e.g. BONK breakout - patience paid off"
              data-testid="input-title"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Trade Type">
              <Segmented
                value={form.tradeType}
                onChange={(v) =>
                  setForm((f) => ({
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
                value={form.direction}
                onChange={(v) =>
                  setForm((f) => ({
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
                value={form.token}
                onChange={(e) =>
                  setForm((f) => ({ ...f, token: e.target.value }))
                }
                placeholder="e.g. BONK"
                data-testid="input-token"
              />
            </Field>
            <Field label="Date">
              <Input
                type="date"
                value={form.tradeDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tradeDate: e.target.value }))
                }
                data-testid="input-date"
              />
            </Field>
          </div>

          <Field label="Outcome">
            <Segmented
              value={form.outcome}
              onChange={(v) =>
                setForm((f) => ({
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
                value={form.entryReason}
                onChange={(e) =>
                  setForm((f) => ({ ...f, entryReason: e.target.value }))
                }
                rows={3}
                placeholder="Why did you enter?"
                data-testid="input-entry-reason"
              />
            </Field>
            <Field label="Exit Reason">
              <Textarea
                value={form.exitReason}
                onChange={(e) =>
                  setForm((f) => ({ ...f, exitReason: e.target.value }))
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
                value={form.wentRight}
                onChange={(e) =>
                  setForm((f) => ({ ...f, wentRight: e.target.value }))
                }
                rows={3}
                data-testid="input-went-right"
              />
            </Field>
            <Field label="What Went Wrong">
              <Textarea
                value={form.wentWrong}
                onChange={(e) =>
                  setForm((f) => ({ ...f, wentWrong: e.target.value }))
                }
                rows={3}
                data-testid="input-went-wrong"
              />
            </Field>
          </div>

          <Field label="Lessons Learned">
            <Textarea
              value={form.lessons}
              onChange={(e) =>
                setForm((f) => ({ ...f, lessons: e.target.value }))
              }
              rows={3}
              placeholder="What will you do differently next time?"
              data-testid="input-lessons"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Emotional State - Before">
              <Input
                value={form.emotionBefore}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    emotionBefore: e.target.value,
                  }))
                }
                placeholder="e.g. Confident, calm"
                data-testid="input-emotion-before"
              />
            </Field>
            <Field label="Emotional State - After">
              <Input
                value={form.emotionAfter}
                onChange={(e) =>
                  setForm((f) => ({
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
              value={form.rating}
              onChange={(n) => setForm((f) => ({ ...f, rating: n }))}
            />
          </Field>

          <Field label="Notes">
            <Textarea
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
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
            onClick={() => onOpenChange(false)}
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
              : isEditing
                ? "Save Changes"
                : "Save Entry"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
