package com.laborflow.core.attendance.dto;

import java.time.LocalDate;
import java.util.UUID;

public record AttendanceScheduleDayResponse(
    UUID scheduleDayUuid,
    LocalDate workDate,
    String ownerName,
    String workTitle,
    String siteName,
    String address,
    String taskNote,
    String plannedStartTime,
    String plannedEndTime
) {
}
