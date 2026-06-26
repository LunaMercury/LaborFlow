package com.laborflow.core.schedule.dto;

import java.util.UUID;

public record ScheduleAssignmentResponse(
    UUID workerProfileUuid,
    String area,
    int workerCount
) {
}
