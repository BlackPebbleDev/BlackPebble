import { ShieldCheck, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

const POINTS = [
  "Nothing is selected automatically.",
  "Tokens are not sold during SOL recovery.",
  "Protected assets stay protected by default.",
  "Recovered SOL returns to your connected wallet.",
  "Your wallet prompts you before anything happens.",
];

export function SafetyBanner() {
  return (
    <Accordion type="single" collapsible>
      <AccordionItem
        value="cleanup-safety"
        className="rounded-xl border border-border/60 bg-card shadow-card overflow-hidden"
        data-testid="wallet-cleanup-safety"
      >
        <AccordionTrigger className="px-4 py-3.5 hover:no-underline">
          <div className="flex items-start gap-3 text-left">
            <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">
                How Wallet Cleanup stays safe
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Preview everything before signing.
              </div>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4">
          <ul className="space-y-2 pl-7">
            {POINTS.map((point) => (
              <li
                key={point}
                className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground"
              >
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/safety"
            data-testid="link-cleanup-safety-guide"
            className="mt-3 ml-7 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            Read full wallet safety guide
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
