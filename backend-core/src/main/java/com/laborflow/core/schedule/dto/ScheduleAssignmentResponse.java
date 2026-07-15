package com.laborflow.core.schedule.dto;

import java.util.UUID;

public record ScheduleAssignmentResponse(
    UUID assignmentUuid,
    UUID participantGroupUuid,
    UUID workerProfileUuid,
    String participantType,
    String displayName,
    String pickupLocation,
    String area,
    int workerCount,
    String plannedStartTime,
    String plannedEndTime,
    String attendanceStatus
) {
}
