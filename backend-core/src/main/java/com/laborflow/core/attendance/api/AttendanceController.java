package com.laborflow.core.attendance.api;

import com.laborflow.core.attendance.application.AttendanceService;
import com.laborflow.core.attendance.dto.ConfirmPlannedAttendanceRequest;
import com.laborflow.core.attendance.dto.ConfirmPlannedAttendanceResponse;
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
}
