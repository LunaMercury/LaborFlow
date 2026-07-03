package com.laborflow.core.schedule.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record RescheduleTaskRangeRequest(
    List<UUID> taskIds,
    LocalDate startDate,
    LocalDate endDate
) {
}
