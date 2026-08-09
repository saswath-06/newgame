import { describe, expect, it } from "vitest";
import {
  hashSeed,
  isValidRoomCode,
  generateRoomCode,
  mulberry32,
  randInt,
  roundSeed,
  shuffle,
} from "@/lib/random";

describe("hashSeed", () => {
  it("is deterministic", () => {
    expect(hashSeed("room:ABC123:0")).toBe(hashSeed("room:ABC123:0"));
  });

  it("differs across inputs", () => {
    expect(hashSeed("a")).not.toBe(hashSeed("b"));
    expect(roundSeed(42, 0)).not.toBe(roundSeed(42, 1));
  });
});

describe("mulberry32", () => {
  it("produces an identical sequence for the same seed", () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it("stays in [0, 1)", () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("randInt", () => {
  it("respects inclusive bounds", () => {
    const rng = mulberry32(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = randInt(rng, 2, 6);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(5);
  });
});

describe("shuffle", () => {
  it("is deterministic per seed and preserves elements", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffle(mulberry32(5), items);
    const b = shuffle(mulberry32(5), items);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([...items].sort());
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("room codes", () => {
  it("generates valid 6-char codes without ambiguous characters", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(isValidRoomCode(code)).toBe(true);
      expect(code).not.toMatch(/[01OI]/);
    }
  });

  it("rejects bad codes", () => {
    expect(isValidRoomCode("ABC12")).toBe(false);
    expect(isValidRoomCode("ABC10O")).toBe(false);
    expect(isValidRoomCode("abcdef")).toBe(false);
  });
});
