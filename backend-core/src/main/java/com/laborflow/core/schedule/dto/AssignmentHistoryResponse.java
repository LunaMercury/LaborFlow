package com.laborflow.core.schedule.dto;

import java.time.LocalDate;
import java.util.List;

public record AssignmentHistoryResponse(
    List<AssignmentHistoryEntry> entries,
    LocalDate nextBeforeDate
) {
}
