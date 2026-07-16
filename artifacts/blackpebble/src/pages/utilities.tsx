import { ChevronRight, Wrench } from "lucide-react";
import { Link } from "wouter";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { SupportSection } from "@/components/support-section";
import { PageHeader } from "@/components/page-header";
import { UTILITIES, type UtilityFlag } from "@/lib/utilities-meta";

export default function Utilities() {
  const flags = useFeatureFlags();

  const visible = UTILITIES.filter((u) => {
    if (!u.flag) return true;
    return flags[u.flag as UtilityFlag];
  });

  return (
    <div className="flex flex-col gap-5 px-4 py-5 sm:py-6 max-w-5xl mx-auto">
      <PageHeader
        icon={Wrench}
        title="Utilities"
        subtitle="On-chain tools. These never touch your paper trading."
        className="mb-0"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {visible.map((u) => {
          const Icon = u.icon;
          return (
            <Link
              key={u.key}
              href={u.href}
              className="group card-interactive rounded-2xl bg-card shadow-card p-6 flex items-start gap-4"
              data-testid={u.testId}
            >
              <div className="w-12 h-12 rounded-full bg-accent/12 flex items-center justify-center flex-shrink-0">
                <Icon className="w-[22px] h-[22px] text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-lg font-bold">{u.title}</div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </div>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  {u.description}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground">
        More BlackPebble tools are in the works - see the{" "}
        <Link
          href="/roadmap"
          data-testid="link-utilities-roadmap"
          className="text-accent hover:underline"
        >
          roadmap
        </Link>{" "}
        for what's next.
      </p>

      <p className="text-sm text-muted-foreground">
        Wallet tools run on-chain only after you review and sign.{" "}
        <Link
          href="/safety"
          data-testid="link-utilities-safety"
          className="text-accent hover:underline"
        >
          Wallet Safety
        </Link>
        .
      </p>

      <div className="border-t border-border/50 pt-6">
        <SupportSection />
      </div>
    </div>
  );
}
