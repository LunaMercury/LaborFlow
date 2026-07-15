package com.laborflow.core.attendance.dto;

import java.time.LocalDate;
import java.util.UUID;

public record ConfirmPlannedAttendanceRequest(
    String scope,
    UUID assignmentUuid,
    UUID scheduleDayUuid,
    LocalDate workDate
) {
}
