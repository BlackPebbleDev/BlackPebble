import { describe, it, expect } from "vitest";
import { createRateLimiter, dedupeKey, createDeduper } from "./rate-limit.js";

describe("createRateLimiter", () => {
  it("allows up to max per window, then blocks", () => {
    const rl = createRateLimiter({ windowSec: 60, max: 2 });
    const t = 1_000_000;
    expect(rl.allow("u1", t)).toBe(true);
    expect(rl.allow("u1", t + 1000)).toBe(true);
    expect(rl.allow("u1", t + 2000)).toBe(false); // 3rd within 60s
  });

  it("allows again once the window slides past old hits", () => {
    const rl = createRateLimiter({ windowSec: 60, max: 1 });
    const t = 1_000_000;
    expect(rl.allow("u1", t)).toBe(true);
    expect(rl.allow("u1", t + 30_000)).toBe(false);
    expect(rl.allow("u1", t + 61_000)).toBe(true); // first hit expired
  });

  it("tracks keys independently", () => {
    const rl = createRateLimiter({ windowSec: 60, max: 1 });
    const t = 1_000_000;
    expect(rl.allow("a", t)).toBe(true);
    expect(rl.allow("b", t)).toBe(true);
    expect(rl.allow("a", t)).toBe(false);
  });

  it("reset clears a key", () => {
    const rl = createRateLimiter({ windowSec: 60, max: 1 });
    const t = 1_000_000;
    expect(rl.allow("a", t)).toBe(true);
    rl.reset("a");
    expect(rl.allow("a", t)).toBe(true);
  });
});

describe("dedupeKey / createDeduper", () => {
  it("joins parts with colons", () => {
    expect(dedupeKey("tier", 7, "Gold")).toBe("tier:7:Gold");
  });

  it("reports repeats after the first sighting", () => {
    const d = createDeduper();
    expect(d.seen("k")).toBe(false);
    expect(d.seen("k")).toBe(true);
    d.reset();
    expect(d.seen("k")).toBe(false);
  });
});
