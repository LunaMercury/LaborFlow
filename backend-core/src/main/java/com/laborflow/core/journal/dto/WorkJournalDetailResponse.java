package com.laborflow.core.journal.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record WorkJournalDetailResponse(
    UUID journalUuid,
    UUID scheduleDayUuid,
    LocalDate workDate,
    String ownerName,
    String siteName,
    String address,
    String workTitle,
    String memo,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt,
    int actualWorkerCount,
    List<WorkJournalAttendanceResponse> attendance
) {
}
