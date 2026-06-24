package com.laborflow.core.schedule.dto;

import java.util.List;

public record UpdateScheduleTaskRequest(
    String title,
    String address,
    int requiredMen,
    int requiredWomen,
    String memo,
    List<String> workTypeCodes,
    List<ScheduleAssignmentRequest> assignments
) {
}
