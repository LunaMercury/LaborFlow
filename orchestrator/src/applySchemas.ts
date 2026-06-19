import { z } from "zod";

export const applyPacketSchema = z.object({
  runId: z.string(),
  role: z.enum(["frontend", "rust", "java", "mobile"]),
  status: z.enum(["pending", "prepared", "applied", "failed"]),
  goal: z.string(),
  allowedPaths: z.array(z.string()),
  blockedPaths: z.array(z.string()),
  requiredVerification: z.array(z.string()),
  contracts: z.array(z.string()),
  policyChecks: z.array(z.string()),
  proposedEdits: z.array(
    z.object({
      path: z.string(),
      action: z.enum(["create", "update", "delete"]),
      summary: z.string(),
      instructions: z.array(z.string()),
    }),
  ),
});

export type ApplyPacket = z.infer<typeof applyPacketSchema>;
