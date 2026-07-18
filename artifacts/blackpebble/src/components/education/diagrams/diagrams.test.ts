import { describe, it, expect } from "vitest";
import { DIAGRAM_LIBRARY } from "./library";
import { LESSON_DIAGRAM_IDS } from "@/lib/education/diagrams";

describe("academy diagram library", () => {
  it("has a component for every registered diagram id", () => {
    for (const id of LESSON_DIAGRAM_IDS) {
      expect(DIAGRAM_LIBRARY[id], id).toBeDefined();
      expect(typeof DIAGRAM_LIBRARY[id].Component, id).toBe("function");
    }
  });

  it("registers no extra diagram ids beyond the id list", () => {
    const libIds = Object.keys(DIAGRAM_LIBRARY).sort();
    const declared = [...LESSON_DIAGRAM_IDS].sort();
    expect(libIds).toEqual(declared);
  });

  it("gives every diagram a title and caption", () => {
    for (const id of LESSON_DIAGRAM_IDS) {
      expect(DIAGRAM_LIBRARY[id].title.length, id).toBeGreaterThan(0);
      expect(DIAGRAM_LIBRARY[id].caption.length, id).toBeGreaterThan(20);
    }
  });
});
