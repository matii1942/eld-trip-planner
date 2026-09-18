import { describe, expect, it } from "vitest";

import { CITIES, searchCities } from "./cities.js";

describe("the city list", () => {
  it("is not empty and uses 'City, ST' form", () => {
    expect(CITIES.length).toBeGreaterThan(100);
    for (const city of CITIES) {
      expect(city).toMatch(/^[A-Za-z. '\-]+, [A-Z]{2}$/);
    }
  });

  it("has no duplicates", () => {
    expect(new Set(CITIES).size).toBe(CITIES.length);
  });

  it("includes the cities the example trips use", () => {
    for (const city of [
      "Denver, CO",
      "Kansas City, MO",
      "Atlanta, GA",
      "Los Angeles, CA",
      "Phoenix, AZ",
      "Newark, NJ",
      "Dallas, TX",
      "Fort Worth, TX",
      "Houston, TX",
      "Chicago, IL",
      "Indianapolis, IN",
      "Miami, FL",
    ]) {
      expect(CITIES).toContain(city);
    }
  });
});

describe("searchCities", () => {
  it("ignores queries that are too short", () => {
    expect(searchCities("")).toEqual([]);
    expect(searchCities("d")).toEqual([]);
  });

  it("finds a city by the start of its name", () => {
    expect(searchCities("denver")).toContain("Denver, CO");
  });

  it("is case insensitive", () => {
    expect(searchCities("DENVER")).toContain("Denver, CO");
    expect(searchCities("DeNvEr")).toContain("Denver, CO");
  });

  it("puts prefix matches before substring matches", () => {
    const results = searchCities("den", 8);
    expect(results[0]).toBe("Denver, CO");
    expect(results.indexOf("Denver, CO")).toBeLessThan(results.indexOf("Providence, RI"));
  });

  it("returns both cities that share a name", () => {
    const results = searchCities("kansas city");
    expect(results).toContain("Kansas City, MO");
    expect(results).toContain("Kansas City, KS");
  });

  it("respects the limit", () => {
    expect(searchCities("a", 3).length).toBeLessThanOrEqual(3);
    expect(searchCities("san", 2).length).toBeLessThanOrEqual(2);
    expect(searchCities("new", 4).length).toBeLessThanOrEqual(4);
  });

  it("matches on the state too", () => {
    const results = searchCities(", tx", 5);
    expect(results.length).toBeGreaterThan(0);
    for (const city of results) expect(city.endsWith(", TX")).toBe(true);
  });

  it("returns nothing for a city it does not know", () => {
    expect(searchCities("xyzzyville")).toEqual([]);
  });

  it("never throws on odd input", () => {
    expect(() => searchCities(null)).not.toThrow();
    expect(() => searchCities(undefined)).not.toThrow();
    expect(() => searchCities("   ")).not.toThrow();
  });
});