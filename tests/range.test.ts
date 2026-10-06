import { describe, it, expect } from "vitest";
import { parseRange } from "../worker/range";
describe("private audio seeking", () => {
  it("accepts the first single byte and partial request", () => {
    expect(parseRange("bytes=0-0", 100)).toEqual({ offset: 0, length: 1 });
    expect(parseRange("bytes=10-", 100)).toEqual({ offset: 10, length: 90 });
  });
  it("supports suffix requests and clamps the end", () => {
    expect(parseRange("bytes=-20", 100)).toEqual({ offset: 80, length: 20 });
    expect(parseRange("bytes=90-200", 100)).toEqual({ offset: 90, length: 10 });
  });
  it("rejects out of bounds, reversed and multiple ranges", () => {
    expect(parseRange("bytes=100-", 100)).toBeNull();
    expect(parseRange("bytes=3-1", 100)).toBeNull();
    expect(parseRange("bytes=0-1,3-4", 100)).toBeNull();
    expect(parseRange("bytes=-0", 100)).toBeNull();
  });
});
