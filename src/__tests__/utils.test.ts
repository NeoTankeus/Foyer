import { describe, it, expect } from "vitest";
import { formatCurrency, calculateVariation, truncate } from "@/lib/utils";

describe("formatCurrency", () => {
  it("should format EUR correctly", () => {
    const result = formatCurrency(1234.56, "EUR", "fr-FR");
    expect(result).toContain("1");
    expect(result).toContain("234");
  });

  it("should handle zero", () => {
    const result = formatCurrency(0, "EUR");
    expect(result).toContain("0");
  });
});

describe("calculateVariation", () => {
  it("should calculate positive variation", () => {
    const result = calculateVariation(150, 100);
    expect(result).toBe(50);
  });

  it("should calculate negative variation", () => {
    const result = calculateVariation(50, 100);
    expect(result).toBe(-50);
  });

  it("should handle zero previous value", () => {
    const result = calculateVariation(100, 0);
    expect(result).toBe(100);
  });

  it("should handle both zero", () => {
    const result = calculateVariation(0, 0);
    expect(result).toBe(0);
  });
});

describe("truncate", () => {
  it("should truncate long strings", () => {
    const result = truncate("Hello World", 5);
    expect(result).toBe("Hello...");
  });

  it("should not truncate short strings", () => {
    const result = truncate("Hi", 10);
    expect(result).toBe("Hi");
  });
});
