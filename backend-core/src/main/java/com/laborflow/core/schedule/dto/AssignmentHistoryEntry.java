package com.laborflow.core.schedule.dto;

import java.time.LocalDate;
import java.util.UUID;

public record AssignmentHistoryEntry(
    LocalDate workDate,
    UUID scheduleDayUuid,
    String title,
    String siteName,
    int assignmentCount
) {
}
