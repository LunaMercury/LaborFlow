import type { WorkerResultPacket } from "./resultSchemas.js";

export function isApplyReviewBlocked(result: WorkerResultPacket) {
  return result.status === "failed" && result.risks.some((risk) => risk.startsWith("Apply review blocked:"));
}

export function getDisplayStatus(result: WorkerResultPacket) {
  return isApplyReviewBlocked(result) ? "blocked" : result.status;
}

export function countDisplayStatuses(results: WorkerResultPacket[]) {
  return results.reduce<Record<string, number>>((acc, result) => {
    const status = getDisplayStatus(result);
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
}

export function getBlockedRoles(results: WorkerResultPacket[]) {
  return results.filter(isApplyReviewBlocked).map((result) => result.role);
}

export function getFailedRoles(results: WorkerResultPacket[]) {
  return results
    .filter((result) => result.status === "failed" && !isApplyReviewBlocked(result))
    .map((result) => result.role);
}

export function getBlockedReasons(results: WorkerResultPacket[]) {
  const reasons = results.filter(isApplyReviewBlocked).flatMap((result) => {
    if (result.questions.length > 0) {
      return result.questions.map((question) => `${result.role}: unresolved question - ${question}`);
    }
    if (result.contractsChanged.length > 0) {
      return result.contractsChanged.map((contract) => `${result.role}: contract change - ${contract}`);
    }
    return [`${result.role}: apply review blocked before file changes`];
  });

  return Array.from(new Set(reasons));
}
