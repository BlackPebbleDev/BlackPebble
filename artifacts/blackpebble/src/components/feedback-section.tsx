import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";

const CONTACT_HANDLE = "BlackPebbleFun";
const CONTACT_URL = `https://x.com/${CONTACT_HANDLE}`;

export function FeedbackSection({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-accent" />
          <h3 className="text-sm font-semibold text-foreground">Feedback &amp; Support</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Found a bug or have a feature idea? Reach us at{" "}
          <a
            href={CONTACT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:text-accent transition-colors underline underline-offset-2"
          >
            @{CONTACT_HANDLE}
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 border border-accent/40 flex items-center justify-center flex-shrink-0">
          <MessageSquare className="w-5 h-5 text-accent" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Feedback &amp; Support</h2>
      </div>

      <div className="border border-border bg-card p-4 sm:p-6 space-y-4">
        <div className="space-y-1">
          <p className="text-sm text-foreground">Found a bug?</p>
          <p className="text-sm text-foreground">Have a feature idea?</p>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          We read every message. Reach the team directly and help shape what BlackPebble
          builds next.
        </p>
        <div className="text-sm text-muted-foreground">
          Contact:{" "}
          <a
            href={CONTACT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:text-accent transition-colors underline underline-offset-2"
          >
            @{CONTACT_HANDLE}
          </a>
        </div>
      </div>
    </div>
  );
}
