package com.laborflow.core.schedule.dto;

import java.util.List;
import java.util.UUID;

public record ScheduleTaskResponse(
    UUID id,
    String title,
    String ownerName,
    String siteName,
    String address,
    String timeRange,
    int requiredMen,
    int requiredWomen,
    List<String> workTypeCodes,
    String memo,
    List<ScheduleAssignmentResponse> assignments
) {
}
