import { describe, expect, it } from "vitest";
import { summarizeMonth } from "./budget";

const sources = [
  { source_id: "matheus", name: "Matheus", budget: 1200, position: 0 },
  { source_id: "maria", name: "Maria", budget: 500, position: 1 },
];

describe("summarizeMonth", () => {
  it("starts the month with R$ 1.700,00 split between Matheus and Maria", () => {
    const s = summarizeMonth(sources, []);
    expect(s.budget).toBe(1700);
    expect(s.sources.map((x) => [x.name, x.remaining])).toEqual([
      ["Matheus", 1200],
      ["Maria", 500],
    ]);
    expect(s.status).toBe("positive");
  });

  it("discounts each receipt only from the chosen source", () => {
    const s = summarizeMonth(sources, [
      { source_id: "matheus", total: 312.45 },
      { source_id: "maria", total: 80.1 },
      { source_id: "matheus", total: 0.1 },
    ]);
    expect(s.sources[0]!.remaining).toBe(887.45);
    expect(s.sources[1]!.remaining).toBe(419.9);
    expect(s.remaining).toBe(1307.35);
  });

  it("marks the month negative when spending passes the budget", () => {
    const s = summarizeMonth(sources, [
      { source_id: "matheus", total: 1000 },
      { source_id: "maria", total: 750.5 },
    ]);
    expect(s.sources[1]!.remaining).toBe(-250.5);
    expect(s.remaining).toBe(-50.5);
    expect(s.status).toBe("negative");
  });
});
