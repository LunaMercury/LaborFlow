import { z } from "zod";
import { participationModeSchema } from "./schemas.js";

export const workerTaskPacketSchema = z.object({
  role: z.enum(["frontend", "rust", "java", "mobile"]),
  participationMode: participationModeSchema,
  goal: z.string(),
  allowedPaths: z.array(z.string()),
  blockedPaths: z.array(z.string()),
  touchedAreas: z.array(z.string()),
  implementationSteps: z.array(z.string()),
  dependencies: z.array(z.string()),
  requiredVerification: z.array(z.string()),
  contracts: z.array(z.string()),
  policyChecks: z.array(z.string()),
  handoffOutput: z.array(z.string()),
});

export type WorkerTaskPacket = z.infer<typeof workerTaskPacketSchema>;
