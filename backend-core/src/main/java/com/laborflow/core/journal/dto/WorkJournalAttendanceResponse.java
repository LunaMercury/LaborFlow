package com.laborflow.core.journal.dto;

public record WorkJournalAttendanceResponse(
    String displayName,
    String participantType,
    int workerCount,
    String status,
    String actualStartTime,
    String actualEndTime,
    Integer breakMinutes
) {
}
