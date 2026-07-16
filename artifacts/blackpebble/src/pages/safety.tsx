import {
  Shield,
  Eye,
  Sparkles,
  Flame,
  KeyRound,
  PenLine,
  LineChart,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

type SafetySection = {
  id: string;
  icon: LucideIcon;
  title: string;
  summary: string;
  points: string[];
};

const SECTIONS: SafetySection[] = [
  {
    id: "paper-trading",
    icon: LineChart,
    title: "Paper trading is simulated",
    summary: "Simulated funds. No real swaps.",
    points: [
      "Paper trades use simulated balances.",
      "The Trading Desk does not execute real market swaps.",
      "Paper trading does not require token approvals.",
      "Leaderboards and portfolios are based on simulated activity unless clearly labeled otherwise.",
    ],
  },
  {
    id: "read-only",
    icon: Eye,
    title: "Read-only wallet analysis",
    summary: "Public wallet history only. Cannot move funds.",
    points: [
      "BlackPebble can read public wallet balances and transaction history.",
      "Read-only analysis cannot transfer tokens.",
      "Read-only analysis cannot approve spending.",
      "Read-only analysis cannot sign transactions.",
      "BlackPebble never needs your seed phrase or private key.",
    ],
  },
  {
    id: "cleanup",
    icon: Sparkles,
    title: "Wallet cleanup and recovery",
    summary: "Real on-chain actions. Preview before signing.",
    points: [
      "Cleanup and recovery tools prepare real Solana transactions.",
      "Nothing is closed, burned, or recovered automatically.",
      "You choose what to clean up.",
      "Your wallet prompts you before anything happens.",
      "Recovered SOL returns to your connected wallet.",
    ],
  },
  {
    id: "burn",
    icon: Flame,
    title: "Token burning",
    summary: "Burn actions are permanent.",
    points: [
      "Burning removes selected assets permanently.",
      "Burned assets cannot be recovered.",
      "BlackPebble shows a preview before signing.",
      "Only burn assets you intentionally select.",
    ],
  },
  {
    id: "never-asks",
    icon: KeyRound,
    title: "What BlackPebble never asks for",
    summary: "No seed phrases. No private keys. No custody.",
    points: [
      "BlackPebble never asks for your seed phrase.",
      "BlackPebble never asks for your private key.",
      "BlackPebble does not custody user funds.",
      "BlackPebble does not need your wallet password.",
      "Never paste secret recovery phrases into any website.",
    ],
  },
  {
    id: "before-you-connect-or-sign",
    icon: PenLine,
    title: "Before you connect or sign",
    summary: "Test carefully. Review every transaction.",
    points: [
      "Testing a wallet tool for the first time? Start with a burner wallet, keep valuable assets separate, and review every transaction before signing.",
      "Testing wallet intelligence for the first time? Use a burner wallet or low-value wallet, keep valuable assets separate, and review what data is being analyzed.",
      "Never sign a transaction you do not understand.",
      "Disconnect when you are done.",
    ],
  },
];

export default function Safety() {
  return (
    <div className="flex flex-col gap-5 px-4 md:px-6 py-5 sm:py-6 max-w-3xl mx-auto">
      <PageHeader
        icon={Shield}
        title="Wallet Safety"
        subtitle="Know what is simulated, what is read-only, and what requires your signature."
        className="mb-0"
      />

      <div className="hairline-accent rounded-2xl bg-card shadow-card p-5 sm:p-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          BlackPebble separates simulated trading, read-only wallet
          intelligence, and real wallet utility actions. You stay in control of
          what you connect, review, and sign.
        </p>
      </div>

      <Accordion
        type="single"
        collapsible
        className="flex flex-col gap-3"
        data-testid="safety-accordion"
      >
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <AccordionItem
              key={section.id}
              value={section.id}
              className="rounded-2xl border border-border/60 bg-card shadow-card overflow-hidden"
              data-testid={`safety-section-${section.id}`}
            >
              <AccordionTrigger className="px-4 sm:px-5 py-4 hover:no-underline">
                <div className="flex items-start gap-3 text-left">
                  <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/12">
                    <Icon className="h-4 w-4 text-accent" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">
                      {section.title}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {section.summary}
                    </div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 sm:px-5">
                <ul className="space-y-2 pl-11">
                  {section.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      <div className="flex items-start gap-2.5 rounded-2xl border border-accent/20 bg-accent/5 px-4 py-3.5">
        <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" aria-hidden />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Wallet connection lets BlackPebble read public wallet data. Any real
          wallet utility action requires a separate transaction signature in your
          wallet.
        </p>
      </div>
    </div>
  );
}
