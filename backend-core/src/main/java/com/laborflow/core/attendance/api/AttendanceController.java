package com.laborflow.core.attendance.api;

import com.laborflow.core.attendance.application.AttendanceService;
import com.laborflow.core.attendance.dto.ConfirmPlannedAttendanceRequest;
import com.laborflow.core.attendance.dto.ConfirmPlannedAttendanceResponse;
import com.laborflow.core.attendance.dto.AttendanceRecordListResponse;
import com.laborflow.core.attendance.dto.AttendanceRecordResponse;
import com.laborflow.core.attendance.dto.AttendanceTaskNoteResponse;
import com.laborflow.core.attendance.dto.UpdateAttendanceRecordRequest;
import com.laborflow.core.attendance.dto.UpdateAttendanceTaskNoteRequest;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/attendance")
public class AttendanceController {
    private final AttendanceService attendanceService;

    public AttendanceController(AttendanceService attendanceService) {
        this.attendanceService = attendanceService;
    }

    @PostMapping("/confirm-planned")
    public ConfirmPlannedAttendanceResponse confirmPlanned(
        @RequestParam String loginId,
        @RequestBody ConfirmPlannedAttendanceRequest request
    ) {
        return attendanceService.confirmPlanned(loginId, request);
    }

    @GetMapping("/records")
    public AttendanceRecordListResponse getRecords(
        @RequestParam String loginId,
        @RequestParam LocalDate workDate
    ) {
        return attendanceService.getRecords(loginId, workDate);
    }

    @PatchMapping("/records/{assignmentUuid}")
    public AttendanceRecordResponse updateRecord(
        @PathVariable UUID assignmentUuid,
        @RequestParam String loginId,
        @RequestBody UpdateAttendanceRecordRequest request
    ) {
        return attendanceService.updateRecord(loginId, assignmentUuid, request);
    }

    @PatchMapping("/schedule-days/{scheduleDayUuid}/note")
    public AttendanceTaskNoteResponse updateTaskNote(
        @PathVariable UUID scheduleDayUuid,
        @RequestParam String loginId,
        @RequestBody UpdateAttendanceTaskNoteRequest request
    ) {
        return attendanceService.updateTaskNote(loginId, scheduleDayUuid, request);
    }
}
