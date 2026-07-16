import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Source-level guardrails for Community Campaigns UI. Components live in
 * campaign-ui.tsx (single source of truth); campaigns.tsx must consume them
 * rather than re-implementing TokenIdentity / StatusBadge / CreatorRow / etc.
 */
const root = dirname(fileURLToPath(import.meta.url));
const ui = readFileSync(join(root, "../components/campaign-ui.tsx"), "utf8");
const page = readFileSync(join(root, "../pages/campaigns.tsx"), "utf8");

describe("campaigns UI — shared component consolidation", () => {
  it("defines TokenIdentity / StateBadge / CreatorRow / TrustBadge / EscrowWallet / TokenContract / ProgressBar once in campaign-ui", () => {
    expect(ui.match(/export function TokenIdentity/g)?.length).toBe(1);
    expect(ui.match(/export function StateBadge/g)?.length).toBe(1);
    expect(ui.match(/export function CreatorRow/g)?.length).toBe(1);
    expect(ui.match(/export function TrustBadge/g)?.length).toBe(1);
    expect(ui.match(/export function EscrowWallet/g)?.length).toBe(1);
    expect(ui.match(/export function TokenContract/g)?.length).toBe(1);
    expect(ui.match(/export function ProgressBar/g)?.length).toBe(1);
  });

  it("campaigns page does not re-define those primitives", () => {
    expect(page).not.toMatch(/function TokenIdentity\s*\(/);
    expect(page).not.toMatch(/function StateBadge\s*\(/);
    expect(page).not.toMatch(/function CreatorRow\s*\(/);
    expect(page).not.toMatch(/function TrustBadge\s*\(/);
    expect(page).not.toMatch(/function AddressRow\s*\(/);
    expect(page).not.toMatch(/function ProgressBar\s*\(/);
  });

  it("TokenIdentity has no large-variant typography fork (identical browse/detail)", () => {
    expect(ui).not.toMatch(/large\s*\?/);
    expect(ui).not.toContain("text-2xl");
    expect(page).not.toContain("large");
  });
});

describe("campaigns UI — escrow terminology", () => {
  it("EscrowWallet wrapper locks the Escrow Wallet label + contribution copy", () => {
    expect(ui).toContain('label="Escrow Wallet"');
    expect(ui).toContain(
      "This is the only wallet that accepts campaign contributions.",
    );
    expect(ui).toContain("Never send SOL to this address.");
  });

  it("no longer uses old wallet labels in user-facing copy", () => {
    expect(ui + page).not.toContain("Campaign Funding Wallet");
    expect(ui + page).not.toContain(">Funding Wallet<");
    expect(ui + page).not.toContain("(only destination)");
  });
});

describe("campaigns UI — compact status chip", () => {
  it("StateBadge is single-line, compact, and non-shrinking", () => {
    const badge = ui.slice(
      ui.indexOf("export function StateBadge"),
      ui.indexOf("export function TrustBadge"),
    );
    expect(badge).toContain("text-[10px]");
    expect(badge).toContain("whitespace-nowrap");
    expect(badge).toContain("shrink-0");
  });
});

describe("campaigns UI — token + creator deep links", () => {
  it("token identity is a keyboard-accessible in-app link", () => {
    expect(ui).toContain('role="link"');
    expect(ui).toContain("View ${name} token page");
    expect(ui).toContain("tokenPageHref(mint)");
  });

  it("creator row links to BlackPebble profile, not X", () => {
    expect(ui).toContain("`/u/${username}`");
    expect(ui).toContain("View ${label} profile");
    expect(ui).not.toContain("x.com/");
    expect(ui).not.toContain("twitter.com/");
  });

  it("token + creator navigation stopPropagation so the card Link is not triggered", () => {
    expect(ui).toMatch(
      /e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*navigate\(/,
    );
  });

  it("the card itself links to the campaign detail, not the token page", () => {
    expect(page).toContain("href={`/campaigns/${c.publicId}`}");
  });

  it("trust lives beside the creator via CreatorRow (not floating alone below escrow)", () => {
    expect(page).toContain("<CreatorRow");
    // Floating TrustBadge under escrow was removed from the card footer.
    expect(page).not.toMatch(/mt-auto[\s\S]{0,200}<TrustBadge/);
  });
});
