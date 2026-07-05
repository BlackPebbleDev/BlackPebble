import { ShieldCheck } from "lucide-react";

const RULES = [
  "Every token in your wallet is shown with its real value, sellability, and risk - nothing is hidden from you.",
  "Nothing is ever selected, burned, or closed automatically. You choose exactly what to clean up.",
  "Verified and valuable tokens are protected by default. Removing that protection always takes an extra confirmation.",
  "You always see a full preview - including your wallet health before and after - before signing anything.",
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
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
            <span>{rule}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
