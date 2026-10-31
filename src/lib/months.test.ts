import { describe, expect, it } from "vitest";
import { competenceOf, cycleLabel, cyclePeriod, cycleState, daysLeftInCycle } from "./months";

describe("competenceOf", () => {
  it("puts Matheus's purchase on 24/10 in the cycle that started 22/10", () => {
    expect(competenceOf(new Date("2026-10-24T10:50:00-03:00"), 22)).toBe("2026-10");
  });

  it("puts Matheus's purchase on 21/10 in the previous cycle", () => {
    expect(competenceOf(new Date("2026-10-21T23:59:00-03:00"), 22)).toBe("2026-09");
  });

  it("keeps Matheus in the October cycle until 21/11", () => {
    expect(competenceOf(new Date("2026-11-21T12:00:00-03:00"), 22)).toBe("2026-10");
    expect(competenceOf(new Date("2026-11-22T00:05:00-03:00"), 22)).toBe("2026-11");
  });

  it("turns Maria's cycle over on day 1 in São Paulo time", () => {
    // 01/11 01:00 UTC is still 31/10 22:00 in São Paulo.
    expect(competenceOf(new Date("2026-11-01T01:00:00Z"), 1)).toBe("2026-10");
    expect(competenceOf(new Date("2026-11-01T00:10:00-03:00"), 1)).toBe("2026-11");
  });
});

describe("cyclePeriod", () => {
  it("runs Matheus's October cycle from 22/10 to 21/11", () => {
    expect(cyclePeriod("2026-10", 22)).toEqual({ start: "2026-10-22", end: "2026-11-21" });
    expect(cycleLabel("2026-10", 22)).toBe("22/out – 21/nov");
  });

  it("runs Maria's October cycle over the whole calendar month", () => {
    expect(cyclePeriod("2026-10", 1)).toEqual({ start: "2026-10-01", end: "2026-10-31" });
  });

  it("clamps a closing day past the end of a short month", () => {
    expect(cyclePeriod("2027-01", 31)).toEqual({ start: "2027-01-31", end: "2027-02-27" });
    expect(cyclePeriod("2027-02", 31)).toEqual({ start: "2027-02-28", end: "2027-03-30" });
  });
});

describe("cycleState", () => {
  const nov5 = new Date("2026-11-05T12:00:00-03:00");
  it("on 05/11 Matheus is still in October while Maria already closed October", () => {
    expect(cycleState("2026-10", 22, nov5)).toBe("active");
    expect(cycleState("2026-10", 1, nov5)).toBe("closed");
    expect(cycleState("2026-11", 22, nov5)).toBe("upcoming");
    expect(daysLeftInCycle("2026-10", 22, nov5)).toBe(16);
  });
});
