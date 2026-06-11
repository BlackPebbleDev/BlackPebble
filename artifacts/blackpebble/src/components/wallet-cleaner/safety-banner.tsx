import { ShieldCheck } from "lucide-react";

const RULES = [
  "Only token accounts with a zero balance are ever shown — accounts holding tokens or NFTs are never touched.",
  "Nothing is selected automatically. You choose exactly which accounts to close.",
  "You always see a full preview before signing anything.",
  "Recovered SOL is always returned to your connected wallet.",
];

export function SafetyBanner() {
  return (
    <div className="rounded-xl bg-card shadow-card p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-accent flex-shrink-0" />
        <h2 className="text-sm font-semibold text-foreground">
          How this stays safe
        </h2>
      </div>
      <ul className="space-y-2">
        {RULES.map((rule) => (
          <li
            key={rule}
            className="flex items-start gap-2.5 text-xs text-muted-foreground leading-relaxed"
          >
            <span className="mt-1.5 w-1.5 h-1.5 bg-accent flex-shrink-0" />
            <span>{rule}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
