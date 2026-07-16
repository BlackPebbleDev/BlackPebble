import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Source-level guardrails for the Community Campaigns UI. The frontend has no
 * DOM test harness, so these assert the structural/copy invariants directly
 * against the campaigns page source. They guard the final header + escrow
 * polish so a future edit can't silently regress terminology or interactions.
 */
const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../pages/campaigns.tsx"),
  "utf8",
);

describe("campaigns UI — escrow terminology", () => {
  it("uses the 'Escrow Wallet' label on card + detail address rows", () => {
    const matches = src.match(/label="Escrow Wallet"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("no longer uses old wallet labels in user-facing copy", () => {
    expect(src).not.toContain("Campaign Funding Wallet");
    // The standalone secondary "Funding Wallet" pill was removed.
    expect(src).not.toMatch(/["> ]Funding Wallet</);
    expect(src).not.toContain(">Funding Wallet<");
    expect(src).not.toContain("(only destination)");
  });

  it("keeps the escrow contribution copy", () => {
    expect(src).toContain(
      "This is the only wallet that accepts campaign contributions.",
    );
  });

  it("keeps the token-contract safety warning", () => {
    expect(src).toContain("Never send SOL to this address.");
  });
});

describe("campaigns UI — compact status chip", () => {
  it("StateBadge renders a single-line, compact, non-shrinking chip", () => {
    const badge = src.slice(
      src.indexOf("function StateBadge"),
      src.indexOf("function TrustBadge"),
    );
    expect(badge).toContain("text-[10px]");
    expect(badge).toContain("whitespace-nowrap");
    expect(badge).toContain("shrink-0");
  });
});

describe("campaigns UI — token deep link", () => {
  it("token identity is a keyboard-accessible in-app link with an aria-label", () => {
    expect(src).toContain('role="link"');
    expect(src).toContain("View ${name} token page");
    expect(src).toContain("tokenPageHref(mint)");
  });

  it("token navigation stops propagation so it never triggers the card link", () => {
    // The go() handler prevents default + stops propagation before navigating.
    expect(src).toMatch(/e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*navigate\(href\)/);
  });

  it("the card itself links to the campaign detail, not the token page", () => {
    expect(src).toContain("href={`/campaigns/${c.publicId}`}");
  });
});
