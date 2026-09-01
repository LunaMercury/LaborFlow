package com.laborflow.core.attendance.dto;

import java.util.List;

public record AttendanceRecordListResponse(
    List<AttendanceScheduleDayResponse> tasks,
    List<AttendanceRecordResponse> records
) {
}
