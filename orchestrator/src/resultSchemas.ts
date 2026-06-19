import { z } from "zod";

export const workerResultStatusSchema = z.enum(["pending", "running", "succeeded", "failed", "skipped"]);

export const workerProposedEditSchema = z.object({
  path: z.string(),
  action: z.enum(["create", "update", "delete"]),
  summary: z.string(),
  instructions: z.array(z.string()),
});

export const workerResultPacketSchema = z.object({
  role: z.enum(["frontend", "rust", "java", "mobile"]),
  status: workerResultStatusSchema,
  changedFiles: z.array(z.string()),
  summary: z.string(),
  contractsChanged: z.array(z.string()),
  verificationRun: z.array(z.string()),
  risks: z.array(z.string()),
  questions: z.array(z.string()),
  proposedEdits: z.array(workerProposedEditSchema),
});

export type WorkerResultPacket = z.infer<typeof workerResultPacketSchema>;
