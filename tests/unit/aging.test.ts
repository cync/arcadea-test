import { describe, expect, it } from "vitest";
import { computeAging, STALE_THRESHOLD_DAYS } from "../../domain/Aging";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("computeAging", () => {
  it("reports 0 days for a Document that just changed status", () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    const result = computeAging(now, now);
    expect(result.days).toBe(0);
    expect(result.isStale).toBe(false);
  });

  it("reports 1 day for a Document that changed status a day ago", () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    const statusChangedAt = new Date(now.getTime() - DAY_MS);
    const result = computeAging(statusChangedAt, now);
    expect(result.days).toBe(1);
    expect(result.isStale).toBe(false);
  });

  it("is not stale at exactly the 3-day threshold — 'more than 3 days', not '3 or more'", () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    const statusChangedAt = new Date(now.getTime() - STALE_THRESHOLD_DAYS * DAY_MS);
    const result = computeAging(statusChangedAt, now);
    expect(result.days).toBe(3);
    expect(result.isStale).toBe(false);
  });

  it("is stale once aging exceeds the 3-day threshold", () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    const statusChangedAt = new Date(now.getTime() - 4 * DAY_MS);
    const result = computeAging(statusChangedAt, now);
    expect(result.days).toBe(4);
    expect(result.isStale).toBe(true);
  });

  it("defaults `now` to the current clock when omitted", () => {
    const statusChangedAt = new Date(Date.now() - DAY_MS);
    const result = computeAging(statusChangedAt);
    expect(result.days).toBe(1);
  });
});
