package com.laborflow.core.attendance.dto;

import java.time.LocalDate;
import java.util.UUID;

public record AttendanceRecordResponse(
    UUID assignmentUuid,
    UUID attendanceUuid,
    UUID scheduleDayUuid,
    UUID workerProfileUuid,
    String participantType,
    String displayName,
    String pickupLocation,
    String area,
    LocalDate workDate,
    String ownerName,
    String workTitle,
    String siteName,
    String address,
    String taskNote,
    String plannedStartTime,
    String plannedEndTime,
    String actualStartTime,
    String actualEndTime,
    int breakMinutes,
    String status,
    String timeEntryType,
    boolean confirmed
) {
}
