import { z } from "zod";

export const participationModeSchema = z.enum(["implement", "review", "skip"]);

export const managerDecisionSchema = z.object({
  summary: z.string(),
  frontendMode: participationModeSchema,
  rustMode: participationModeSchema,
  javaMode: participationModeSchema,
  mobileMode: participationModeSchema,
  integrationNotes: z.array(z.string()),
  exclusionReasons: z.object({
    frontend: z.string(),
    rust: z.string(),
    java: z.string(),
    mobile: z.string(),
  }),
});

export const specialistPlanSchema = z.object({
  role: z.enum(["frontend", "rust", "java", "mobile"]),
  participationMode: participationModeSchema,
  goal: z.string(),
  touchedAreas: z.array(z.string()),
  implementationSteps: z.array(z.string()),
  dependencies: z.array(z.string()),
  verification: z.array(z.string()),
  risks: z.array(z.string()),
});

export const verifierReportSchema = z.object({
  summary: z.string(),
  findings: z.array(z.string()),
  contractChecks: z.array(z.string()),
  recommendedVerification: z.array(z.string()),
  releaseBlockers: z.array(z.string()),
});

export type ManagerDecision = z.infer<typeof managerDecisionSchema>;
export type SpecialistPlan = z.infer<typeof specialistPlanSchema>;
export type VerifierReport = z.infer<typeof verifierReportSchema>;
