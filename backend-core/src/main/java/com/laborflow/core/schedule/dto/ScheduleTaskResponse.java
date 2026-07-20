package com.laborflow.core.schedule.dto;

import java.util.List;
import java.util.UUID;

public record ScheduleTaskResponse(
    UUID id,
    UUID workSiteId,
    UUID ownerUuid,
    String title,
    String ownerName,
    String siteName,
    String address,
    String timeRange,
    String startTime,
    String endTime,
    int requiredMen,
    int requiredWomen,
    List<String> workTypeCodes,
    String memo,
    List<ScheduleAssignmentResponse> assignments
) {
}
