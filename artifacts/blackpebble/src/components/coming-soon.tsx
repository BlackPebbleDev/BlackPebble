import type { LucideIcon } from "lucide-react";

interface ComingSoonProps {
  icon: LucideIcon;
  title: string;
  description: string;
  features?: string[];
}

export function ComingSoon({
  icon: Icon,
  title,
  description,
  features,
}: ComingSoonProps) {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="max-w-lg w-full text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-accent/12 flex items-center justify-center">
          <Icon className="w-7 h-7 text-accent" />
        </div>
        <div className="text-[11px] uppercase tracking-[0.3em] text-accent mb-3">
          Coming Soon
        </div>
        <h1 className="text-2xl font-semibold mb-4">{title}</h1>
        <p className="text-muted-foreground leading-relaxed mb-8">
          {description}
        </p>
        {features && features.length > 0 && (
          <div className="rounded-xl bg-card shadow-card overflow-hidden divide-y divide-border text-left">
            {features.map((f) => (
              <div
                key={f}
                className="px-5 py-3.5 text-sm text-muted-foreground flex items-center gap-3"
              >
                <span className="w-1.5 h-1.5 bg-accent flex-shrink-0" />
                {f}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
