package com.laborflow.core.schedule.dto;

import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

public record UpdateScheduleTaskRequest(
    UUID ownerUuid,
    String title,
    String address,
    LocalTime startTime,
    LocalTime endTime,
    int requiredMen,
    int requiredWomen,
    String memo,
    List<String> workTypeCodes,
    List<ScheduleAssignmentRequest> assignments
) {
}
