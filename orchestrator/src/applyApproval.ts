import fs from "node:fs";
import path from "node:path";
import type { ApplyPacket } from "./applySchemas.js";
import { normalizeRepoRelativePath, assertSamePathSet } from "./pathSafety.js";
import { applyReviewDecisionSchema } from "./reviewSchemas.js";

function normalizePathList(paths: string[], label: string) {
  return paths.map((candidate) => {
    const normalized = normalizeRepoRelativePath(candidate);
    if (!normalized) {
      throw new Error(`${label} contains an unsafe repository-relative path: ${candidate}`);
    }
    return normalized;
  });
}

export function loadApprovedApplyReview(orchestratorRoot: string, runId: string, role: string) {
  const reviewPath = path.join(orchestratorRoot, "runs", runId, "applies", `${role}.review.json`);
  if (!fs.existsSync(reviewPath)) {
    throw new Error(`Approved apply review artifact is missing: ${reviewPath}`);
  }

  const review = applyReviewDecisionSchema.parse(JSON.parse(fs.readFileSync(reviewPath, "utf8")));
  if (review.runId !== runId || review.role !== role) {
    throw new Error(`Apply review artifact identity does not match ${runId}/${role}.`);
  }
  if (review.status !== "approved") {
    throw new Error(`Apply review status is ${review.status}, not approved.`);
  }

  return review;
}

export function assertPacketMatchesApprovedReview(packet: ApplyPacket, approvedEdits: string[]) {
  const proposedPaths = normalizePathList(packet.proposedEdits.map((edit) => edit.path), "Apply packet");
  const reviewedPaths = normalizePathList(approvedEdits, "Apply review");
  assertSamePathSet("Apply packet proposed edits", reviewedPaths, proposedPaths);
}
