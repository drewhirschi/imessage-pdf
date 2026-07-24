import { describe, it, expect } from "vitest";
import {
  imessageToUnixTimestamp,
  imessageToDate,
  unixToImessageTimestamp,
  isDifferentDay,
  isLargerThanTimestampGap,
  TIMESTAMP_GAP_MINUTES,
} from "./timestamp";

const APPLE_EPOCH = 978307200; // 2001-01-01 UTC in Unix seconds

describe("timestamp conversions", () => {
  it("imessageToUnixTimestamp: 0 ns maps to the Apple epoch", () => {
    expect(imessageToUnixTimestamp(0)).toBe(APPLE_EPOCH);
  });

  it("imessageToUnixTimestamp: adds nanoseconds as seconds", () => {
    // 60 seconds after the epoch
    expect(imessageToUnixTimestamp(60 * 1_000_000_000)).toBe(APPLE_EPOCH + 60);
  });

  it("unixToImessageTimestamp: Apple epoch maps back to 0 ns", () => {
    expect(unixToImessageTimestamp(APPLE_EPOCH)).toBe(0);
  });

  it("round-trips unix -> imessage -> unix", () => {
    const unix = APPLE_EPOCH + 12345; // some real unix seconds
    const ns = unixToImessageTimestamp(unix);
    expect(imessageToUnixTimestamp(ns)).toBe(unix);
  });

  it("round-trips imessage -> unix -> imessage", () => {
    const ns = 700_000_600_000_000_000; // realistic magnitude
    const unix = imessageToUnixTimestamp(ns);
    // conversion is lossy at ns scale; compare within a second
    expect(unixToImessageTimestamp(unix)).toBeCloseTo(ns, -9);
  });

  it("imessageToDate produces a valid Date at the Apple epoch", () => {
    const d = imessageToDate(0);
    expect(d.toISOString()).toBe("2001-01-01T00:00:00.000Z");
  });
});

describe("timestamp comparisons", () => {
  const base = unixToImessageTimestamp(APPLE_EPOCH + 3600); // 1am epoch-day

  it("isLargerThanTimestampGap true beyond the gap threshold", () => {
    const later = base + TIMESTAMP_GAP_MINUTES * 60 * 1_000_000_000;
    expect(isLargerThanTimestampGap(base, later)).toBe(true);
  });

  it("isLargerThanTimestampGap false within the gap threshold", () => {
    const later = base + 5 * 60 * 1_000_000_000; // 5 minutes
    expect(isLargerThanTimestampGap(base, later)).toBe(false);
  });

  it("isDifferentDay distinguishes calendar days", () => {
    const nextDay = base + 24 * 3600 * 1_000_000_000;
    expect(isDifferentDay(base, nextDay)).toBe(true);
    expect(isDifferentDay(base, base + 60 * 1_000_000_000)).toBe(false);
  });
});
