package com.laborflow.core.schedule.dto;

import java.util.List;
import java.util.UUID;

public record DeleteScheduleTaskRangeRequest(
    List<UUID> taskIds
) {
}
