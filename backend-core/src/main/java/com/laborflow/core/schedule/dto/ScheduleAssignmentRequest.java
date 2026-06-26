package com.laborflow.core.schedule.dto;

import java.util.UUID;

public record ScheduleAssignmentRequest(
    UUID workerProfileUuid,
    String area,
    int workerCount
) {
}
