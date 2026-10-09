import type { ScheduleAssignment } from "../api/scheduleApi";

export function buildImportedAssignments(
  assignments: ScheduleAssignment[],
  availableWorkerIds: Set<string>,
  assignedToOtherTasks: Set<string>,
) {
  const men: string[] = [];
  const women: string[] = [];
  const workerCounts: Record<string, number> = {};
  const eligible = assignments.filter((assignment) =>
    assignment.workerProfileUuid && assignment.assignmentStatus !== "replaced",
  );
  for (const assignment of eligible) {
    const id = assignment.workerProfileUuid!;
    if (!availableWorkerIds.has(id) || assignedToOtherTasks.has(id) || id in workerCounts) continue;
    (assignment.area === "men" ? men : women).push(id);
    workerCounts[id] = assignment.workerCount || 1;
  }
  return {
    assignments: { men, women, workerCounts },
    sourceCount: eligible.length,
    importedCount: men.length + women.length,
  };
}
