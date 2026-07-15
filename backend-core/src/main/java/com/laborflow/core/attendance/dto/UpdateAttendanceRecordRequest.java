package com.laborflow.core.attendance.dto;

import java.time.LocalTime;

public record UpdateAttendanceRecordRequest(
    LocalTime actualStartTime,
    LocalTime actualEndTime,
    Integer breakMinutes,
    String status,
    String timeEntryType
) {
}
