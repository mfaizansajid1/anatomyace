export const MEDICAL_LEVEL_TIERS: { min: number; title: string }[] = [
  { min: 1, title: "Pre-Clinical Novice" },
  { min: 4, title: "Ward Apprentice" },
  { min: 8, title: "Resident in Training" },
  { min: 13, title: "Clinical Clerk" },
  { min: 20, title: "Senior Registrar" },
  { min: 30, title: "Consultant Anatomist" },
  { min: 50, title: "Professor of Anatomy" },
];

export function getMedicalTitle(level: number): string {
  let title = MEDICAL_LEVEL_TIERS[0].title;
  for (const t of MEDICAL_LEVEL_TIERS) if (level >= t.min) title = t.title;
  return title;
}
