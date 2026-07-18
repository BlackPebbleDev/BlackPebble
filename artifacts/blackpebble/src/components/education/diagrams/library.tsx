import type { ReactElement } from "react";
import { cn } from "@/lib/utils";
import { DiagramLabel } from "./diagram-frame";
import type { LessonDiagramId } from "@/lib/education/diagrams";

/**
 * The visual library. Each diagram draws into the shared 320×180 viewBox from
 * DiagramFrame. Colors come from theme tokens via `text-*` classes + currentColor
 * so diagrams adapt to light/dark automatically. Motion is opt-in through the
 * `animated` prop and is additionally gated by prefers-reduced-motion in CSS.
 */

interface DiagramProps {
  animated?: boolean;
}

const flow = (animated?: boolean) =>
  cn("text-accent", animated && "bp-anim-flow");

/* ── Wallet keys: public address (share) vs private key (never share) ─────── */
function WalletKeys({ animated }: DiagramProps) {
  return (
    <>
      <g className="text-accent">
        <rect x="18" y="46" width="128" height="88" rx="12" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="1.5" />
        <rect x="18" y="46" width="128" height="26" rx="12" fill="currentColor" fillOpacity="0.16" />
      </g>
      <DiagramLabel x={82} y={63} className="text-accent" size={11}>Your wallet</DiagramLabel>
      <g className="text-success">
        <circle cx="40" cy="96" r="12" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.4" />
        <path d="M35 96h10M40 91v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </g>
      <DiagramLabel x={58} y={92} anchor="start" className="text-foreground" size={10}>Public address</DiagramLabel>
      <DiagramLabel x={58} y={104} anchor="start" className="text-success" size={9} weight={500}>Safe to share</DiagramLabel>
      <g className={cn("text-destructive", animated && "bp-anim-pulse")}>
        <rect x="28" y="114" width="24" height="14" rx="3" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="40" cy="121" r="2.4" fill="currentColor" />
      </g>
      <DiagramLabel x={58} y={120} anchor="start" className="text-foreground" size={10}>Private key</DiagramLabel>
      <DiagramLabel x={58} y={132} anchor="start" className="text-destructive" size={9} weight={500}>Never share</DiagramLabel>
      <g className="text-muted-foreground">
        <path d="M150 90h26" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 3" />
        <path d="M172 86l6 4-6 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g className="text-success">
        <rect x="184" y="58" width="118" height="46" rx="10" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="1.3" />
      </g>
      <DiagramLabel x={243} y={78} className="text-foreground" size={10}>Others can send</DiagramLabel>
      <DiagramLabel x={243} y={92} className="text-success" size={10}>you tokens ✓</DiagramLabel>
      <g className="text-destructive">
        <rect x="184" y="112" width="118" height="46" rx="10" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="1.3" />
      </g>
      <DiagramLabel x={243} y={132} className="text-foreground" size={10}>Anyone with the key</DiagramLabel>
      <DiagramLabel x={243} y={146} className="text-destructive" size={10}>controls everything ✕</DiagramLabel>
    </>
  );
}

/* ── Seed phrase: 12 words = full access ─────────────────────────────────── */
function SeedPhrase({ animated }: DiagramProps) {
  const words = ["ocean", "table", "river", "maple", "north", "quiet", "amber", "cabin", "solar", "pixel", "grape", "vivid"];
  return (
    <>
      <DiagramLabel x={160} y={22} className="text-foreground" size={12}>Your 12-word seed phrase</DiagramLabel>
      <g className="text-accent">
        {words.map((w, i) => {
          const col = i % 4;
          const row = Math.floor(i / 4);
          const x = 22 + col * 72;
          const y = 34 + row * 30;
          return (
            <g key={w}>
              <rect x={x} y={y} width="64" height="22" rx="6" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="1.1" />
              <text x={x + 8} y={y + 15} className="text-muted-foreground" fill="currentColor" fontSize="8" fontWeight={600}>{i + 1}.</text>
              <text x={x + 20} y={y + 15} className="text-foreground" fill="currentColor" fontSize="9" fontWeight={600}>{w}</text>
            </g>
          );
        })}
      </g>
      <g className={cn("text-destructive", animated && "bp-anim-pulse")}>
        <rect x="70" y="132" width="180" height="34" rx="9" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.4" />
        <path d="M92 149a6 6 0 0112 0" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <rect x="90" y="148" width="16" height="11" rx="2" fill="currentColor" fillOpacity="0.5" />
      </g>
      <DiagramLabel x={172} y={153} className="text-destructive" size={10}>Whoever has these words owns the wallet</DiagramLabel>
    </>
  );
}

/* ── Connect vs sign ──────────────────────────────────────────────────────── */
function ConnectVsSign() {
  return (
    <>
      <g className="text-success">
        <rect x="16" y="30" width="136" height="120" rx="12" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="84" cy="74" r="20" fill="currentColor" fillOpacity="0.12" />
        <path d="M66 74s8-12 18-12 18 12 18 12-8 12-18 12-18-12-18-12z" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="84" cy="74" r="6" fill="currentColor" />
      </g>
      <DiagramLabel x={84} y={112} className="text-foreground" size={12}>Connect</DiagramLabel>
      <DiagramLabel x={84} y={128} className="text-success" size={10} weight={500}>Read-only · shares address</DiagramLabel>
      <DiagramLabel x={84} y={142} className="text-muted-foreground" size={9} weight={500}>Cannot move funds</DiagramLabel>
      <g className="text-destructive">
        <rect x="168" y="30" width="136" height="120" rx="12" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeWidth="1.3" />
        <path d="M258 58l14 14-40 40-16 4 4-16z" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M250 66l14 14" stroke="currentColor" strokeWidth="1.6" />
      </g>
      <DiagramLabel x={236} y={112} className="text-foreground" size={12}>Sign</DiagramLabel>
      <DiagramLabel x={236} y={128} className="text-destructive" size={10} weight={500}>Authorizes an action</DiagramLabel>
      <DiagramLabel x={236} y={142} className="text-muted-foreground" size={9} weight={500}>Can move / spend funds</DiagramLabel>
    </>
  );
}

/* ── Transaction flow: you → sign → network → confirmed ───────────────────── */
function TransactionFlow({ animated }: DiagramProps) {
  const nodes = [
    { x: 34, label: "You", cls: "text-foreground" },
    { x: 122, label: "Sign", cls: "text-accent" },
    { x: 210, label: "Network", cls: "text-accent" },
    { x: 292, label: "Done", cls: "text-success" },
  ];
  return (
    <>
      <DiagramLabel x={160} y={30} className="text-foreground" size={12}>How a transaction travels</DiagramLabel>
      <line x1="34" y1="92" x2="292" y2="92" className={flow(animated)} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {nodes.map((n) => (
        <g key={n.label}>
          <circle cx={n.x} cy="92" r="14" className={n.cls} fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.5" />
          <DiagramLabel x={n.x} y={124} className="text-muted-foreground" size={10}>{n.label}</DiagramLabel>
        </g>
      ))}
      {animated ? (
        <circle cx="34" cy="92" r="4" className="text-accent bp-anim-travel" style={{ ["--bp-travel-x" as string]: "258px" }} fill="currentColor" />
      ) : null}
      <DiagramLabel x={122} y={62} className="text-muted-foreground" size={9} weight={500}>You approve</DiagramLabel>
      <DiagramLabel x={210} y={62} className="text-muted-foreground" size={9} weight={500}>Validators confirm</DiagramLabel>
    </>
  );
}

/* ── Market cap = price × supply ──────────────────────────────────────────── */
function MarketCap() {
  return (
    <>
      <DiagramLabel x={160} y={26} className="text-foreground" size={12}>Market cap = price × supply</DiagramLabel>
      <g className="text-accent">
        <rect x="26" y="60" width="70" height="60" rx="10" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.3" />
      </g>
      <DiagramLabel x={61} y={86} className="text-foreground" size={12}>$0.01</DiagramLabel>
      <DiagramLabel x={61} y={102} className="text-muted-foreground" size={9}>price</DiagramLabel>
      <DiagramLabel x={116} y={95} className="text-muted-foreground" size={16}>×</DiagramLabel>
      <g className="text-accent">
        <rect x="132" y="60" width="70" height="60" rx="10" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.3" />
      </g>
      <DiagramLabel x={167} y={86} className="text-foreground" size={12}>1B</DiagramLabel>
      <DiagramLabel x={167} y={102} className="text-muted-foreground" size={9}>supply</DiagramLabel>
      <DiagramLabel x={222} y={95} className="text-muted-foreground" size={16}>=</DiagramLabel>
      <g className="text-success">
        <rect x="238" y="52" width="70" height="76" rx="10" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.5" />
      </g>
      <DiagramLabel x={273} y={88} className="text-foreground" size={13}>$10M</DiagramLabel>
      <DiagramLabel x={273} y={104} className="text-success" size={9}>market cap</DiagramLabel>
      <DiagramLabel x={160} y={150} className="text-muted-foreground" size={9} weight={500}>Price alone is meaningless without supply</DiagramLabel>
    </>
  );
}

/* ── Market cap vs FDV ────────────────────────────────────────────────────── */
function Fdv() {
  return (
    <>
      <DiagramLabel x={160} y={24} className="text-foreground" size={12}>Market cap vs FDV</DiagramLabel>
      <DiagramLabel x={54} y={44} className="text-muted-foreground" size={10}>Circulating</DiagramLabel>
      <g className="text-accent">
        <rect x="24" y="52" width="120" height="26" rx="6" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.2" />
      </g>
      <DiagramLabel x={84} y={70} className="text-foreground" size={10}>MC $10M</DiagramLabel>
      <DiagramLabel x={70} y={104} className="text-muted-foreground" size={10}>All tokens (diluted)</DiagramLabel>
      <g className="text-warning">
        <rect x="24" y="112" width="272" height="26" rx="6" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.2" />
      </g>
      <g className="text-accent">
        <rect x="24" y="112" width="120" height="26" rx="6" fill="currentColor" fillOpacity="0.18" />
      </g>
      <DiagramLabel x={220} y={130} className="text-foreground" size={10}>FDV $40M</DiagramLabel>
      <DiagramLabel x={160} y={158} className="text-warning" size={9} weight={500}>A big FDV gap means future unlocks can dilute you</DiagramLabel>
    </>
  );
}

/* ── Liquidity pool ───────────────────────────────────────────────────────── */
function LiquidityPool() {
  return (
    <>
      <DiagramLabel x={160} y={24} className="text-foreground" size={12}>A liquidity pool has two sides</DiagramLabel>
      <g className="text-accent">
        <path d="M60 60a52 34 0 00104 0v40a52 34 0 01-104 0z" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="1.3" />
        <ellipse cx="112" cy="60" rx="52" ry="34" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.3" />
      </g>
      <DiagramLabel x={112} y={66} className="text-foreground" size={11}>SOL + TOKEN</DiagramLabel>
      <DiagramLabel x={112} y={126} className="text-muted-foreground" size={9}>the pool</DiagramLabel>
      <g className="text-success">
        <path d="M186 74h40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M222 70l6 4-6 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <DiagramLabel x={266} y={62} className="text-foreground" size={10}>Deeper pool</DiagramLabel>
      <DiagramLabel x={266} y={76} className="text-success" size={10}>= stable price</DiagramLabel>
      <g className="text-destructive">
        <path d="M186 106h40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M222 102l6 4-6 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <DiagramLabel x={266} y={104} className="text-foreground" size={10}>Thin pool</DiagramLabel>
      <DiagramLabel x={266} y={118} className="text-destructive" size={10}>= big swings</DiagramLabel>
    </>
  );
}

/* ── Price impact ─────────────────────────────────────────────────────────── */
function PriceImpact({ animated }: DiagramProps) {
  return (
    <>
      <DiagramLabel x={160} y={24} className="text-foreground" size={12}>A big order moves the price</DiagramLabel>
      <line x1="30" y1="140" x2="300" y2="140" className="text-border" stroke="currentColor" strokeWidth="1" />
      <path d="M30 120 Q120 118 180 96 T300 46" className={cn("text-accent", animated && "bp-anim-flow")} fill="none" stroke="currentColor" strokeWidth="2" />
      <g className="text-success">
        <circle cx="70" cy="121" r="4" fill="currentColor" />
      </g>
      <DiagramLabel x={70} y={112} className="text-success" size={9}>small buy</DiagramLabel>
      <g className="text-destructive">
        <circle cx="260" cy="58" r="5" fill="currentColor" className={animated ? "bp-anim-pulse" : undefined} />
      </g>
      <DiagramLabel x={260} y={48} className="text-destructive" size={9}>large buy</DiagramLabel>
      <DiagramLabel x={40} y={158} anchor="start" className="text-muted-foreground" size={9}>more you buy →</DiagramLabel>
      <DiagramLabel x={300} y={158} anchor="end" className="text-muted-foreground" size={9}>higher price you pay</DiagramLabel>
    </>
  );
}

/* ── Slippage: expected vs actual ─────────────────────────────────────────── */
function Slippage() {
  return (
    <>
      <DiagramLabel x={160} y={24} className="text-foreground" size={12}>Expected price vs price you actually pay</DiagramLabel>
      <g className="text-success">
        <rect x="40" y="60" width="90" height="70" rx="10" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.3" />
      </g>
      <DiagramLabel x={85} y={92} className="text-foreground" size={13}>$100</DiagramLabel>
      <DiagramLabel x={85} y={110} className="text-success" size={9}>expected</DiagramLabel>
      <g className="text-muted-foreground">
        <path d="M138 95h44" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 3" />
        <path d="M178 91l6 4-6 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g className="text-warning">
        <rect x="190" y="52" width="90" height="86" rx="10" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.4" />
      </g>
      <DiagramLabel x={235} y={92} className="text-foreground" size={13}>$108</DiagramLabel>
      <DiagramLabel x={235} y={110} className="text-warning" size={9}>actually paid</DiagramLabel>
      <DiagramLabel x={160} y={158} className="text-muted-foreground" size={9} weight={500}>The 8% gap is slippage: set a tolerance to cap it</DiagramLabel>
    </>
  );
}

/* ── Stop loss / take profit ──────────────────────────────────────────────── */
function StopLossTakeProfit() {
  return (
    <>
      <DiagramLabel x={160} y={22} className="text-foreground" size={12}>Plan the exit before you enter</DiagramLabel>
      <line x1="30" y1="46" x2="300" y2="46" className="text-success" stroke="currentColor" strokeWidth="1.3" strokeDasharray="5 4" />
      <DiagramLabel x={300} y={42} anchor="end" className="text-success" size={9}>Take profit</DiagramLabel>
      <line x1="30" y1="92" x2="300" y2="92" className="text-accent" stroke="currentColor" strokeWidth="1.3" strokeDasharray="5 4" />
      <DiagramLabel x={300} y={88} anchor="end" className="text-accent" size={9}>Entry</DiagramLabel>
      <line x1="30" y1="140" x2="300" y2="140" className="text-destructive" stroke="currentColor" strokeWidth="1.3" strokeDasharray="5 4" />
      <DiagramLabel x={300} y={136} anchor="end" className="text-destructive" size={9}>Stop loss</DiagramLabel>
      <path d="M40 92 L90 108 L140 78 L190 96 L240 58 L280 66" className="text-foreground" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="40" cy="92" r="3.5" className="text-accent" fill="currentColor" />
    </>
  );
}

/* ── Order types: market vs limit ─────────────────────────────────────────── */
function OrderTypes() {
  return (
    <>
      <g className="text-accent">
        <rect x="18" y="34" width="136" height="112" rx="12" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeWidth="1.3" />
      </g>
      <DiagramLabel x={86} y={58} className="text-foreground" size={12}>Market order</DiagramLabel>
      <g className="text-accent">
        <path d="M44 96h60" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M98 90l8 6-8 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <DiagramLabel x={86} y={122} className="text-muted-foreground" size={9}>Fills now, at the</DiagramLabel>
      <DiagramLabel x={86} y={134} className="text-muted-foreground" size={9}>best current price</DiagramLabel>
      <g className="text-success">
        <rect x="166" y="34" width="136" height="112" rx="12" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeWidth="1.3" />
      </g>
      <DiagramLabel x={234} y={58} className="text-foreground" size={12}>Limit order</DiagramLabel>
      <g className="text-success">
        <line x1="192" y1="98" x2="276" y2="98" stroke="currentColor" strokeWidth="1.2" strokeDasharray="4 3" />
        <circle cx="234" cy="98" r="4" fill="currentColor" />
      </g>
      <DiagramLabel x={234} y={122} className="text-muted-foreground" size={9}>Waits for your</DiagramLabel>
      <DiagramLabel x={234} y={134} className="text-muted-foreground" size={9}>target price</DiagramLabel>
    </>
  );
}

/* ── Bonding curve ────────────────────────────────────────────────────────── */
function BondingCurve({ animated }: DiagramProps) {
  return (
    <>
      <DiagramLabel x={160} y={22} className="text-foreground" size={12}>Bonding curve: price rises as supply sells</DiagramLabel>
      <line x1="34" y1="146" x2="300" y2="146" className="text-border" stroke="currentColor" strokeWidth="1" />
      <line x1="34" y1="40" x2="34" y2="146" className="text-border" stroke="currentColor" strokeWidth="1" />
      <path d="M34 144 Q150 140 210 100 T298 44" className={cn("text-accent", animated && "bp-anim-flow")} fill="none" stroke="currentColor" strokeWidth="2.2" />
      <DiagramLabel x={34} y={36} className="text-muted-foreground" size={9}>price</DiagramLabel>
      <DiagramLabel x={300} y={160} anchor="end" className="text-muted-foreground" size={9}>tokens sold →</DiagramLabel>
      <circle cx="70" cy="142" r="3.5" className="text-success" fill="currentColor" />
      <DiagramLabel x={78} y={132} anchor="start" className="text-success" size={9}>early = cheap</DiagramLabel>
    </>
  );
}

/* ── Holder concentration ─────────────────────────────────────────────────── */
function HolderConcentration() {
  const bars = [
    { label: "Top 1", w: 150, cls: "text-destructive" },
    { label: "Top 2-10", w: 96, cls: "text-warning" },
    { label: "Everyone else", w: 54, cls: "text-muted-foreground" },
  ];
  return (
    <>
      <DiagramLabel x={160} y={24} className="text-foreground" size={12}>Who holds the supply?</DiagramLabel>
      {bars.map((b, i) => {
        const y = 48 + i * 34;
        return (
          <g key={b.label} className={b.cls}>
            <DiagramLabel x={30} y={y + 15} anchor="start" className="text-muted-foreground" size={9}>{b.label}</DiagramLabel>
            <rect x={116} y={y} width={b.w} height="20" rx="5" fill="currentColor" fillOpacity="0.5" />
          </g>
        );
      })}
      <DiagramLabel x={160} y={158} className="text-destructive" size={9} weight={500}>One wallet holding most supply can dump on you</DiagramLabel>
    </>
  );
}

/* ── Token lifecycle ──────────────────────────────────────────────────────── */
function TokenLifecycle({ animated }: DiagramProps) {
  const stages = [
    { x: 46, label: "Launch", cls: "text-accent" },
    { x: 122, label: "Pump", cls: "text-success" },
    { x: 198, label: "Peak", cls: "text-warning" },
    { x: 274, label: "Fade", cls: "text-destructive" },
  ];
  return (
    <>
      <DiagramLabel x={160} y={24} className="text-foreground" size={12}>A typical memecoin lifecycle</DiagramLabel>
      <path d="M46 120 Q90 120 122 90 Q160 52 198 60 Q240 70 274 118" className={cn("text-muted-foreground", animated && "bp-anim-flow")} fill="none" stroke="currentColor" strokeWidth="1.8" />
      {stages.map((s) => (
        <g key={s.label} className={s.cls}>
          <circle cx={s.x} cy={s.label === "Launch" ? 120 : s.label === "Pump" ? 90 : s.label === "Peak" ? 60 : 118} r="6" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.5" />
          <DiagramLabel x={s.x} y={150} className="text-muted-foreground" size={10}>{s.label}</DiagramLabel>
        </g>
      ))}
    </>
  );
}

/* ── Paper trading vs real ────────────────────────────────────────────────── */
function PaperTrading() {
  return (
    <>
      <g className="text-accent">
        <rect x="16" y="34" width="136" height="112" rx="12" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeWidth="1.3" />
        <path d="M40 96 L64 82 L88 100 L128 66" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </g>
      <DiagramLabel x={84} y={58} className="text-foreground" size={12}>Paper trading</DiagramLabel>
      <DiagramLabel x={84} y={124} className="text-accent" size={9}>Live prices</DiagramLabel>
      <DiagramLabel x={84} y={136} className="text-muted-foreground" size={9}>Simulated funds · no risk</DiagramLabel>
      <g className="text-warning">
        <rect x="168" y="34" width="136" height="112" rx="12" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="236" cy="88" r="18" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.6" />
        <DiagramLabel x={236} y={93} className="text-foreground" size={13}>◎</DiagramLabel>
      </g>
      <DiagramLabel x={236} y={58} className="text-foreground" size={12}>Real trading</DiagramLabel>
      <DiagramLabel x={236} y={124} className="text-warning" size={9}>Real SOL</DiagramLabel>
      <DiagramLabel x={236} y={136} className="text-muted-foreground" size={9}>You sign · real risk</DiagramLabel>
    </>
  );
}

/* ── Portfolio allocation ─────────────────────────────────────────────────── */
function Portfolio() {
  const segs = [
    { w: 120, cls: "text-accent", label: "Core" },
    { w: 80, cls: "text-success", label: "Growth" },
    { w: 48, cls: "text-warning", label: "Degen" },
  ];
  let x = 34;
  return (
    <>
      <DiagramLabel x={160} y={26} className="text-foreground" size={12}>Spread risk across a portfolio</DiagramLabel>
      <g>
        {segs.map((s) => {
          const seg = (
            <g key={s.label} className={s.cls}>
              <rect x={x} y="66" width={s.w - 4} height="34" rx="6" fill="currentColor" fillOpacity="0.45" />
              <DiagramLabel x={x + (s.w - 4) / 2} y={122} className="text-muted-foreground" size={9}>{s.label}</DiagramLabel>
            </g>
          );
          x += s.w;
          return seg;
        })}
      </g>
      <DiagramLabel x={160} y={150} className="text-muted-foreground" size={9} weight={500}>No single position should be able to wipe you out</DiagramLabel>
    </>
  );
}

/* ── Rug pull ─────────────────────────────────────────────────────────────── */
function RugPull({ animated }: DiagramProps) {
  return (
    <>
      <DiagramLabel x={160} y={24} className="text-foreground" size={12}>A rug pull: liquidity vanishes</DiagramLabel>
      <ellipse cx="96" cy="86" rx="46" ry="30" className="text-accent" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.3" />
      <DiagramLabel x={96} y={90} className="text-foreground" size={10}>liquidity</DiagramLabel>
      <g className={cn("text-destructive", animated && "bp-anim-pulse")}>
        <path d="M150 86h44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M190 80l8 6-8 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g className="text-destructive">
        <path d="M226 58l16 16-40 40-18 4 4-18z" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </g>
      <DiagramLabel x={252} y={130} className="text-destructive" size={10}>creator drains it</DiagramLabel>
      <DiagramLabel x={160} y={162} className="text-muted-foreground" size={9} weight={500}>Locked liquidity + revoked authorities lower this risk</DiagramLabel>
    </>
  );
}

/* ── Risk / reward ────────────────────────────────────────────────────────── */
function RiskReward() {
  return (
    <>
      <DiagramLabel x={160} y={26} className="text-foreground" size={12}>Risk vs reward (aim for 1:2 or better)</DiagramLabel>
      <line x1="160" y1="52" x2="160" y2="150" className="text-border" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
      <g className="text-destructive">
        <rect x="88" y="96" width="60" height="36" rx="6" fill="currentColor" fillOpacity="0.4" />
      </g>
      <DiagramLabel x={118} y={148} className="text-destructive" size={10}>Risk 1</DiagramLabel>
      <g className="text-success">
        <rect x="172" y="60" width="60" height="72" rx="6" fill="currentColor" fillOpacity="0.4" />
      </g>
      <DiagramLabel x={202} y={148} className="text-success" size={10}>Reward 2</DiagramLabel>
    </>
  );
}

/* ── Trader Intelligence ──────────────────────────────────────────────────── */
function TraderIntelligence() {
  return (
    <>
      <DiagramLabel x={160} y={26} className="text-foreground" size={12}>Trader Intelligence reads real history</DiagramLabel>
      <g className="text-muted-foreground">
        <rect x="26" y="52" width="80" height="80" rx="10" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeWidth="1.2" />
      </g>
      <DiagramLabel x={66} y={88} className="text-foreground" size={10}>Past</DiagramLabel>
      <DiagramLabel x={66} y={102} className="text-muted-foreground" size={9}>trades</DiagramLabel>
      <g className="text-accent">
        <path d="M112 92h30" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M138 88l6 4-6 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="150" y="52" width="80" height="80" rx="10" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="1.3" />
        <path d="M164 112 L182 92 L200 104 L218 74" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      </g>
      <DiagramLabel x={190} y={148} className="text-accent" size={9}>patterns</DiagramLabel>
      <g className="text-success">
        <path d="M236 92h30" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M262 88l6 4-6 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="288" cy="92" r="14" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.4" />
      </g>
      <DiagramLabel x={288} y={122} className="text-success" size={9}>insight</DiagramLabel>
    </>
  );
}

/* ── Wallet cleanup ───────────────────────────────────────────────────────── */
function WalletCleanup() {
  return (
    <>
      <DiagramLabel x={160} y={26} className="text-foreground" size={12}>Wallet Cleanup recovers locked rent</DiagramLabel>
      <g className="text-muted-foreground">
        <rect x="30" y="52" width="110" height="96" rx="10" fill="currentColor" fillOpacity="0.05" stroke="currentColor" strokeWidth="1.2" />
        {[0, 1, 2].map((i) => (
          <rect key={i} x={44} y={66 + i * 24} width="82" height="16" rx="4" fill="currentColor" fillOpacity="0.14" />
        ))}
      </g>
      <DiagramLabel x={85} y={44} className="text-muted-foreground" size={9}>empty / dust accounts</DiagramLabel>
      <g className="text-success">
        <path d="M148 100h30" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M174 96l6 4-6 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="238" cy="100" r="30" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.5" />
        <DiagramLabel x={238} y={98} className="text-foreground" size={13}>◎</DiagramLabel>
        <DiagramLabel x={238} y={112} className="text-success" size={9}>rent back</DiagramLabel>
      </g>
    </>
  );
}

/* ── Realized vs unrealized PnL ───────────────────────────────────────────── */
function RealizedUnrealized() {
  return (
    <>
      <DiagramLabel x={160} y={24} className="text-foreground" size={12}>Realized vs unrealized PnL</DiagramLabel>
      <g className="text-success">
        <rect x="26" y="46" width="126" height="96" rx="12" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="1.4" />
        <path d="M52 92l12 12 24-28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <DiagramLabel x={89} y={78} className="text-foreground" size={11}>Realized</DiagramLabel>
      <DiagramLabel x={89} y={122} className="text-muted-foreground" size={9}>you sold</DiagramLabel>
      <DiagramLabel x={89} y={134} className="text-success" size={9} weight={600}>locked in ✓</DiagramLabel>
      <g className="text-warning">
        <rect x="168" y="46" width="126" height="96" rx="12" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="1.4" />
        <path d="M214 74v22M231 82v14M197 84v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </g>
      <DiagramLabel x={231} y={78} className="text-foreground" size={11}>Unrealized</DiagramLabel>
      <DiagramLabel x={231} y={122} className="text-muted-foreground" size={9}>still holding</DiagramLabel>
      <DiagramLabel x={231} y={134} className="text-warning" size={9} weight={600}>can still vanish</DiagramLabel>
      <DiagramLabel x={160} y={162} className="text-muted-foreground" size={9} weight={500}>A gain is only really yours once you sell</DiagramLabel>
    </>
  );
}

/* ── Emotion cycle: feelings peak at the worst time ───────────────────────── */
function EmotionCycle({ animated }: DiagramProps) {
  return (
    <>
      <DiagramLabel x={160} y={20} className="text-foreground" size={12}>Emotions peak at the worst time</DiagramLabel>
      <path d="M28 120 Q70 118 96 80 Q118 48 150 46 Q188 44 214 96 Q236 138 292 128" className={cn("text-muted-foreground", animated && "bp-anim-flow")} fill="none" stroke="currentColor" strokeWidth="1.8" />
      <g className="text-destructive">
        <circle cx="150" cy="46" r="5" fill="currentColor" className={animated ? "bp-anim-pulse" : undefined} />
      </g>
      <DiagramLabel x={150} y={38} className="text-destructive" size={9} weight={600}>Euphoria · FOMO</DiagramLabel>
      <DiagramLabel x={150} y={62} className="text-muted-foreground" size={8}>buying here = bad</DiagramLabel>
      <g className="text-destructive">
        <circle cx="220" cy="112" r="5" fill="currentColor" className={animated ? "bp-anim-pulse" : undefined} />
      </g>
      <DiagramLabel x={252} y={116} className="text-destructive" size={9} weight={600}>Panic</DiagramLabel>
      <DiagramLabel x={252} y={128} className="text-muted-foreground" size={8}>selling here = bad</DiagramLabel>
      <g className="text-success">
        <circle cx="70" cy="112" r="4" fill="currentColor" />
      </g>
      <DiagramLabel x={64} y={132} anchor="start" className="text-success" size={9}>calm plan wins</DiagramLabel>
    </>
  );
}

export interface DiagramEntry {
  title: string;
  caption: string;
  Component: (props: DiagramProps) => ReactElement;
  /** Whether this diagram has meaningful motion (drives the animate toggle). */
  animated?: boolean;
}

export const DIAGRAM_LIBRARY: Record<LessonDiagramId, DiagramEntry> = {
  "wallet-keys": {
    title: "Public address vs private key",
    caption: "Your public address is safe to share so people can send you tokens. Your private key and seed phrase control everything. Never share them.",
    Component: WalletKeys,
    animated: true,
  },
  "seed-phrase": {
    title: "Your seed phrase is your whole wallet",
    caption: "A seed phrase is 12–24 words that can restore your wallet anywhere. Anyone who sees them can take everything, so they never go into a website or chat.",
    Component: SeedPhrase,
    animated: true,
  },
  "connect-vs-sign": {
    title: "Connecting vs signing",
    caption: "Connecting is read-only and shares your public address. Signing authorizes an action that can move or spend your funds. Always read it first.",
    Component: ConnectVsSign,
  },
  "transaction-flow": {
    title: "How a transaction travels",
    caption: "You approve a transaction, your wallet signs it, the network's validators confirm it, and then it's final and cannot be reversed.",
    Component: TransactionFlow,
    animated: true,
  },
  "market-cap": {
    title: "Market cap = price × supply",
    caption: "Market cap multiplies price by circulating supply. A tiny price can still be a huge market cap, so judge value by market cap, not price alone.",
    Component: MarketCap,
  },
  fdv: {
    title: "Market cap vs fully diluted valuation",
    caption: "Market cap counts circulating tokens; FDV counts every token that will ever exist. A large gap means future unlocks can dilute holders.",
    Component: Fdv,
  },
  "liquidity-pool": {
    title: "A liquidity pool has two sides",
    caption: "Trades happen against a pool of two assets. A deeper pool keeps prices stable; a thin pool swings hard on every trade.",
    Component: LiquidityPool,
  },
  "price-impact": {
    title: "Big orders move the price",
    caption: "The larger your order relative to the pool, the more the price moves against you before it fills. This is price impact.",
    Component: PriceImpact,
    animated: true,
  },
  slippage: {
    title: "Expected price vs actual price",
    caption: "Slippage is the gap between the price you saw and the price you got. A slippage tolerance caps how far that gap can go before the trade cancels.",
    Component: Slippage,
  },
  "stop-loss-take-profit": {
    title: "Plan the exit before you enter",
    caption: "A take profit locks in gains at a target; a stop loss caps losses at a floor. Deciding both before entering removes emotion from the exit.",
    Component: StopLossTakeProfit,
  },
  "order-types": {
    title: "Market order vs limit order",
    caption: "A market order fills immediately at the current price. A limit order waits and only fills at the price you choose.",
    Component: OrderTypes,
  },
  "bonding-curve": {
    title: "Bonding curve pricing",
    caption: "On a bonding curve the price rises automatically as more tokens are bought, so the earliest buyers pay the least.",
    Component: BondingCurve,
    animated: true,
  },
  "holder-concentration": {
    title: "Holder concentration",
    caption: "When a few wallets hold most of the supply, they can sell into you at any time. Wider distribution is generally safer.",
    Component: HolderConcentration,
  },
  "token-lifecycle": {
    title: "A memecoin lifecycle",
    caption: "Many memecoins launch, pump on attention, peak, then fade as early buyers take profit. Knowing the stages helps you avoid buying the top.",
    Component: TokenLifecycle,
    animated: true,
  },
  "paper-trading": {
    title: "Paper trading vs real trading",
    caption: "Paper trading uses live prices with simulated funds and zero risk. Real trading spends real SOL and needs your signature.",
    Component: PaperTrading,
  },
  portfolio: {
    title: "Spread risk across a portfolio",
    caption: "Splitting funds across positions means no single bad trade can wipe you out. Position sizing is how you control that.",
    Component: Portfolio,
  },
  "rug-pull": {
    title: "How a rug pull works",
    caption: "In a rug pull the creator removes the liquidity, leaving holders unable to sell. Locked liquidity and revoked authorities reduce the risk.",
    Component: RugPull,
    animated: true,
  },
  "risk-reward": {
    title: "Risk vs reward",
    caption: "Compare how much you can lose to how much you can gain. Aiming for at least 1:2 means winners can outweigh losers over time.",
    Component: RiskReward,
  },
  "trader-intelligence": {
    title: "Trader Intelligence",
    caption: "Trader Intelligence studies real historical trades to surface patterns and deterministic insights, never predictions or advice.",
    Component: TraderIntelligence,
  },
  "wallet-cleanup": {
    title: "Wallet Cleanup",
    caption: "Empty token accounts lock small amounts of SOL as rent. Wallet Cleanup closes them so that SOL returns to you, after you review and sign.",
    Component: WalletCleanup,
  },
  "realized-unrealized": {
    title: "Realized vs unrealized PnL",
    caption: "Realized PnL is locked in once you sell. Unrealized PnL is only a paper gain or loss on what you still hold. It can still change or vanish before you sell.",
    Component: RealizedUnrealized,
  },
  "emotion-cycle": {
    title: "The emotional cycle of a trade",
    caption: "Fear and greed peak at exactly the wrong moments: FOMO tempts you to buy the top and panic tempts you to sell the bottom. A calm, pre-set plan beats reacting to either.",
    Component: EmotionCycle,
    animated: true,
  },
};
