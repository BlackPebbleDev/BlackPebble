import {
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  AlertTriangle,
  Ban,
  Flame,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TokenRiskClass, TokenRiskFactor } from "@/lib/api";
import type { Sellability } from "@/lib/recovery-classify";

interface BadgeMeta {
  label: string;
  className: string;
  icon: React.ReactNode;
}

/** Visual treatment for each conservative risk class (worst → best). */
function riskMeta(risk: TokenRiskClass): BadgeMeta {
  switch (risk) {
    case "verified":
      return {
        label: "Verified",
        className: "bg-accent/12 text-accent",
        icon: <ShieldCheck className="w-3 h-3" />,
      };
    case "normal":
      return {
        label: "Normal",
        className: "bg-sky-500/12 text-sky-400",
        icon: <Check className="w-3 h-3" />,
      };
    case "unknown":
      return {
        label: "Unknown",
        className: "bg-amber-500/12 text-amber-400",
        icon: <HelpCircle className="w-3 h-3" />,
      };
    case "suspicious":
      return {
        label: "Suspicious",
        className: "bg-orange-500/12 text-orange-400",
        icon: <AlertTriangle className="w-3 h-3" />,
      };
    case "spam":
      return {
        label: "Spam",
        className: "bg-red-500/12 text-red-400",
        icon: <Ban className="w-3 h-3" />,
      };
    case "high_risk":
      return {
        label: "High risk",
        className: "bg-red-500/15 text-red-400",
        icon: <ShieldAlert className="w-3 h-3" />,
      };
  }
}

export function RiskBadge({
  risk,
  className,
}: {
  risk: TokenRiskClass;
  className?: string;
}) {
  const meta = riskMeta(risk);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
        meta.className,
        className,
      )}
      data-testid={`risk-badge-${risk}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

/** Visual treatment for each sellability rating. */
function sellabilityClass(rating: Sellability): string {
  switch (rating) {
    case "Excellent":
      return "bg-accent/12 text-accent";
    case "Good":
      return "bg-emerald-500/12 text-emerald-400";
    case "Fair":
      return "bg-amber-500/12 text-amber-400";
    case "Poor":
      return "bg-orange-500/12 text-orange-400";
    case "Very Poor":
      return "bg-red-500/12 text-red-400";
  }
}

export function SellabilityBadge({
  rating,
  className,
}: {
  rating: Sellability;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium",
        sellabilityClass(rating),
        className,
      )}
      title={`Sellability: ${rating}`}
      data-testid="sellability-badge"
    >
      {rating}
    </span>
  );
}

function factorIcon(level: TokenRiskFactor["level"]): React.ReactNode {
  if (level === "ok") return <Check className="w-2.5 h-2.5" />;
  if (level === "bad") return <X className="w-2.5 h-2.5" />;
  return <AlertCircle className="w-2.5 h-2.5" />;
}

function factorClass(level: TokenRiskFactor["level"]): string {
  if (level === "ok") return "bg-secondary text-muted-foreground";
  if (level === "bad") return "bg-red-500/10 text-red-400";
  return "bg-amber-500/10 text-amber-400";
}

/** A consistent row of structured factor chips (market / authorities / etc). */
export function RiskFactors({
  factors,
  className,
}: {
  factors: TokenRiskFactor[];
  className?: string;
}) {
  if (factors.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)} data-testid="risk-factors">
      {factors.map((f) => (
        <span
          key={f.key}
          className={cn(
            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium",
            factorClass(f.level),
          )}
        >
          {factorIcon(f.level)}
          {f.label}
        </span>
      ))}
    </div>
  );
}

/** Inline marker for burn candidates: irreversible flame chip. */
export function BurnChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-red-500/12 px-1.5 py-0.5 text-[10px] font-medium text-red-400",
        className,
      )}
    >
      <Flame className="w-3 h-3" />
      Burn candidate
    </span>
  );
}
