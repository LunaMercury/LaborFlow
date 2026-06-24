package com.laborflow.core.schedule.dto;

import java.util.List;

public record ScheduleTaskListResponse(
    List<ScheduleTaskResponse> tasks
) {
}
