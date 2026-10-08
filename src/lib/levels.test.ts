import { describe, expect, it } from "vitest";
import { getMedicalTitle } from "./levels";

describe("getMedicalTitle", () => {
  it("levels 1-3 are Pre-Clinical Novice", () => {
    expect(getMedicalTitle(1)).toBe("Pre-Clinical Novice");
    expect(getMedicalTitle(3)).toBe("Pre-Clinical Novice");
  });
  it("levels 4-7 are Ward Apprentice", () => {
    expect(getMedicalTitle(4)).toBe("Ward Apprentice");
    expect(getMedicalTitle(7)).toBe("Ward Apprentice");
  });
  it("levels 8-12 are Resident in Training", () => {
    expect(getMedicalTitle(8)).toBe("Resident in Training");
    expect(getMedicalTitle(12)).toBe("Resident in Training");
  });
});
