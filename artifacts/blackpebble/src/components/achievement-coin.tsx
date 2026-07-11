import { useId } from "react";
import { Award } from "lucide-react";
import type { BadgeEntry, BadgeRarity } from "@/lib/api";
import { iconForBadge, rarityOf } from "@/components/achievement-badge";
import { cn } from "@/lib/utils";

/**
 * AchievementCoin - a crafted collectible medallion rendered as layered SVG art,
 * not an icon-in-a-circle. Every coin is built from the same design family:
 *
 *   outer rim (knurled challenge-coin edge)
 *   -> engraved bezel ring
 *   -> recessed inner plate (radial etching / guilloche)
 *   -> a per-achievement decorative motif (bars, rays, laurel, crest, ...)
 *   -> the embossed central emblem (the achievement's symbol)
 *   -> enamel accent + polished top sheen
 *
 * Metal finish + accent color come from rarity; the motif comes from the
 * achievement's family, so each coin has its own identity while staying
 * cohesive. Pure SVG keeps it crisp at any size and fully on-brand.
 */

interface Palette {
  rimA: string;
  rimB: string;
  faceA: string;
  faceB: string;
  plateA: string;
  plateB: string;
  etch: string;
  emblem: string;
  accent: string;
  glow: string;
}

const PALETTES: Record<BadgeRarity, Palette> = {
  common: {
    rimA: "#aab3c0",
    rimB: "#2b3038",
    faceA: "#727a85",
    faceB: "#2c313a",
    plateA: "#3a3f47",
    plateB: "#171a1f",
    etch: "#cbd5e1",
    emblem: "#eef2f7",
    accent: "#aab6c6",
    glow: "rgba(148,163,184,0.25)",
  },
  rare: {
    rimA: "#bae6fd",
    rimB: "#0b1a38",
    faceA: "#3b82f6",
    faceB: "#12203f",
    plateA: "#1e3a8a",
    plateB: "#0a1526",
    etch: "#bae6fd",
    emblem: "#eff8ff",
    accent: "#67d0fb",
    glow: "rgba(56,189,248,0.4)",
  },
  epic: {
    rimA: "#e9d5ff",
    rimB: "#2a1150",
    faceA: "#8b5cf6",
    faceB: "#2f1560",
    plateA: "#5b21b6",
    plateB: "#1d0b3a",
    etch: "#e9d5ff",
    emblem: "#f8f2ff",
    accent: "#c4a2fb",
    glow: "rgba(167,139,250,0.45)",
  },
  legendary: {
    rimA: "#fde68a",
    rimB: "#3b2606",
    faceA: "#d4af37",
    faceB: "#6d4b12",
    plateA: "#8a6318",
    plateB: "#301f05",
    etch: "#fde68a",
    emblem: "#fffdf5",
    accent: "#fcd34d",
    glow: "rgba(251,191,36,0.5)",
  },
};

type Motif =
  | "bars"
  | "rays"
  | "signal"
  | "scroll"
  | "orbit"
  | "laurel"
  | "crest"
  | "starburst";

/** Map an achievement to a decorative motif family (by category, art-only). */
function motifFor(badge: BadgeEntry): Motif {
  switch (badge.category) {
    case "trading":
      return "bars";
    case "profit":
      return "rays";
    case "caller":
      return "signal";
    case "thesis":
      return "scroll";
    case "wallet":
      return "orbit";
    case "community":
      return "laurel";
    case "profile":
      return "crest";
    case "milestone":
      return "starburst";
    case "special":
      return "laurel";
    default:
      return "rays";
  }
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function MotifArt({ motif, pal }: { motif: Motif; pal: Palette }) {
  const a = pal.accent;
  switch (motif) {
    case "bars":
      return (
        <g opacity="0.32" fill={a}>
          <rect x="37" y="55" width="5" height="11" rx="1.4" />
          <rect x="47.5" y="49" width="5" height="17" rx="1.4" />
          <rect x="58" y="43" width="5" height="23" rx="1.4" />
        </g>
      );
    case "rays": {
      const lines = Array.from({ length: 12 }, (_, i) => {
        const [x1, y1] = polar(50, 50, 19, i * 30);
        const [x2, y2] = polar(50, 50, 27, i * 30);
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeLinecap="round" />
        );
      });
      return (
        <g opacity="0.28" stroke={a} strokeWidth="1.3">
          {lines}
        </g>
      );
    }
    case "signal":
      return (
        <g fill="none" stroke={a} strokeWidth="1.5" opacity="0.32" strokeLinecap="round">
          <path d="M39 42 Q50 33 61 42" />
          <path d="M34 46 Q50 34 66 46" />
          <path d="M29 50 Q50 35 71 50" />
        </g>
      );
    case "scroll":
      return (
        <g stroke={a} strokeWidth="1.4" opacity="0.32" strokeLinecap="round">
          <line x1="39" y1="43" x2="61" y2="43" />
          <line x1="39" y1="50" x2="61" y2="50" />
          <line x1="39" y1="57" x2="55" y2="57" />
        </g>
      );
    case "orbit":
      return (
        <g fill="none" stroke={a} strokeWidth="1.3" opacity="0.3">
          <ellipse cx="50" cy="50" rx="27" ry="12" transform="rotate(-22 50 50)" />
          <ellipse cx="50" cy="50" rx="27" ry="12" transform="rotate(28 50 50)" />
        </g>
      );
    case "laurel":
      return (
        <g fill="none" stroke={a} strokeWidth="1.7" opacity="0.42" strokeLinecap="round">
          <path d="M35 68 Q26 55 31 41" />
          <path d="M65 68 Q74 55 69 41" />
          <path d="M34 60 l-5 -2 M33 53 l-5 -2 M34 46 l-5 -1" />
          <path d="M66 60 l5 -2 M67 53 l5 -2 M66 46 l5 -1" />
        </g>
      );
    case "crest":
      return (
        <g fill="none" stroke={a} strokeWidth="1.5" opacity="0.36">
          <path d="M50 30 L64 35.5 L64 51 Q64 65 50 71 Q36 65 36 51 L36 35.5 Z" />
        </g>
      );
    case "starburst": {
      const pts: string[] = [];
      for (let i = 0; i < 8; i++) {
        const [xo, yo] = polar(50, 50, 26, i * 45);
        const [xi, yi] = polar(50, 50, 12, i * 45 + 22.5);
        pts.push(`${xo},${yo}`, `${xi},${yi}`);
      }
      return <polygon points={pts.join(" ")} fill={a} opacity="0.22" />;
    }
    default:
      return null;
  }
}

/** A tiny crown flourish struck at the top of legendary coins. */
function CrownFlourish({ pal }: { pal: Palette }) {
  return (
    <path
      d="M41 31 L44.5 25 L50 30 L55.5 25 L59 31 Z"
      fill={pal.accent}
      opacity="0.55"
    />
  );
}

export function AchievementCoin({
  badge,
  size,
  overflowLabel,
  glow = false,
}: {
  badge?: BadgeEntry;
  size: number;
  overflowLabel?: string;
  glow?: boolean;
}) {
  const rawId = useId();
  const uid = rawId.replace(/:/g, "");
  const rarity = badge ? rarityOf(badge) : "common";
  const pal = PALETTES[rarity];
  const Icon = badge ? iconForBadge(badge) : Award;
  const iconPx = Math.round(size * 0.32);

  const faceId = `f${uid}`;
  const plateId = `p${uid}`;
  const rimId = `r${uid}`;
  const sheenId = `s${uid}`;

  // Faint concentric guilloche + a few radiating hairlines for engraved depth.
  const rings = [30, 24, 17].map((r) => (
    <circle
      key={r}
      cx="50"
      cy="50"
      r={r}
      fill="none"
      stroke={pal.etch}
      strokeWidth="0.5"
      opacity="0.1"
    />
  ));

  return (
    <span
      className="relative inline-flex flex-shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        boxShadow: glow
          ? `0 3px 8px rgba(0,0,0,0.55), 0 0 ${Math.round(size * 0.4)}px ${pal.glow}`
          : `0 2px 5px rgba(0,0,0,0.5), 0 0 ${Math.round(size * 0.28)}px ${pal.glow}`,
      }}
    >
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={faceId} cx="38%" cy="30%" r="78%">
            <stop offset="0%" stopColor={pal.faceA} />
            <stop offset="56%" stopColor={pal.faceB} />
            <stop offset="100%" stopColor={pal.plateB} />
          </radialGradient>
          <radialGradient id={plateId} cx="42%" cy="34%" r="72%">
            <stop offset="0%" stopColor={pal.plateA} />
            <stop offset="100%" stopColor={pal.plateB} />
          </radialGradient>
          <linearGradient id={rimId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={pal.rimA} />
            <stop offset="100%" stopColor={pal.rimB} />
          </linearGradient>
          <radialGradient id={sheenId} cx="36%" cy="24%" r="48%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Outer rim */}
        <circle cx="50" cy="50" r="49" fill={`url(#${rimId})`} />
        {/* Knurled challenge-coin edge */}
        <g stroke={pal.rimB} strokeWidth="0.8" opacity="0.5">
          {Array.from({ length: 60 }, (_, i) => {
            const [x1, y1] = polar(50, 50, 45.5, i * 6);
            const [x2, y2] = polar(50, 50, 48.5, i * 6);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
          })}
        </g>

        {/* Coin face + engraved bezel ring */}
        <circle cx="50" cy="50" r="44" fill={`url(#${faceId})`} />
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          stroke={pal.rimA}
          strokeWidth="0.8"
          opacity="0.45"
        />

        {/* Recessed inner plate */}
        <circle cx="50" cy="50" r="38" fill={`url(#${plateId})`} />
        <circle
          cx="50"
          cy="50"
          r="38"
          fill="none"
          stroke="#000000"
          strokeWidth="1"
          opacity="0.35"
        />
        <circle
          cx="50"
          cy="50"
          r="36.5"
          fill="none"
          stroke={pal.accent}
          strokeWidth="0.6"
          opacity="0.3"
        />

        {/* Guilloche etching */}
        {rings}

        {/* Per-achievement motif + prestige flourish */}
        {badge && <MotifArt motif={motifFor(badge)} pal={pal} />}
        {badge && rarity === "legendary" && <CrownFlourish pal={pal} />}

        {/* Polished top sheen */}
        <ellipse
          cx="39"
          cy="31"
          rx="27"
          ry="19"
          fill={`url(#${sheenId})`}
          opacity="0.5"
        />
      </svg>

      {/* Embossed central emblem */}
      {overflowLabel ? (
        <span
          className="relative font-mono font-bold tabular-nums [filter:drop-shadow(0_1px_0.5px_rgba(0,0,0,0.6))]"
          style={{ fontSize: Math.round(size * 0.28), color: pal.emblem }}
        >
          {overflowLabel}
        </span>
      ) : (
        <Icon
          strokeWidth={2.25}
          className={cn(
            "relative [filter:drop-shadow(0_1px_0.5px_rgba(0,0,0,0.65))]",
          )}
          style={{ width: iconPx, height: iconPx, color: pal.emblem }}
        />
      )}
    </span>
  );
}
