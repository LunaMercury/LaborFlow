import { z } from "zod";

export const applyReviewDecisionSchema = z.object({
  runId: z.string(),
  role: z.enum(["frontend", "rust", "java", "mobile"]),
  status: z.enum(["approved", "blocked", "needs_manual_review"]),
  summary: z.string(),
  findings: z.array(z.string()),
  blockedReasons: z.array(z.string()),
  approvedEdits: z.array(z.string()),
  requiredVerification: z.array(z.string()),
});

export type ApplyReviewDecision = z.infer<typeof applyReviewDecisionSchema>;
