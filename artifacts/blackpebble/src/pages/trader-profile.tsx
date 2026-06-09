import { useEffect } from "react";
import { Link, useParams } from "wouter";
import { User, ArrowLeft } from "lucide-react";

function decodeId(raw: string | undefined): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default function TraderProfile() {
  const params = useParams<{ id: string }>();
  const id = decodeId(params.id);
  const handle = id.startsWith("@") ? id : id.length <= 16 ? `@${id}` : id;

  useEffect(() => {
    document.title = "Trader profile — BlackPebble";
  }, []);

  return (
    <div className="flex flex-col gap-8 px-4 py-6 sm:py-10 max-w-3xl mx-auto">
      <Link
        href="/leaderboard"
        data-testid="link-back-leaderboard"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-accent transition-colors w-fit"
      >
        <ArrowLeft className="w-4 h-4" /> Back to leaderboard
      </Link>

      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-lg w-full text-center">
          <div className="w-16 h-16 mx-auto mb-6 border border-accent/40 flex items-center justify-center">
            <User className="w-7 h-7 text-accent" />
          </div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-accent mb-3">
            Coming Soon
          </div>
          <h1 className="text-2xl font-semibold mb-2 break-all" data-testid="text-trader-id">
            {handle || "Trader"}
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Public trader profiles are on the way. Soon you'll be able to view
            this trader's track record, realized P&L, ROI, win rate, and recent
            closed trades — all from public paper-trading data.
          </p>
        </div>
      </div>
    </div>
  );
}
