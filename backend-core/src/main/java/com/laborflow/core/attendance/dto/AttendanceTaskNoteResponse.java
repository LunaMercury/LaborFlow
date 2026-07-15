package com.laborflow.core.attendance.dto;

import java.util.UUID;

public record AttendanceTaskNoteResponse(UUID scheduleDayUuid, String note) {
}
