package com.laborflow.core.attendance.application;

import com.laborflow.core.attendance.dao.AttendanceDao;
import com.laborflow.core.attendance.dao.AttendanceDao.AccountContext;
import com.laborflow.core.attendance.dto.ConfirmPlannedAttendanceRequest;
import com.laborflow.core.attendance.dto.ConfirmPlannedAttendanceResponse;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.Locale;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AttendanceService {
    private final AttendanceDao attendanceDao;

    public AttendanceService(AttendanceDao attendanceDao) {
        this.attendanceDao = attendanceDao;
    }

    @Transactional
    public ConfirmPlannedAttendanceResponse confirmPlanned(
        String loginId,
        ConfirmPlannedAttendanceRequest request
    ) {
        AccountContext account = attendanceDao.findAccountContext(normalizeLoginId(loginId))
            .orElseThrow(() -> new IllegalArgumentException("Labor agency owner account was not found."));
        String scope = normalizeScope(request.scope());
        UUID assignmentUuid = request.assignmentUuid();
        UUID scheduleDayUuid = request.scheduleDayUuid();
        LocalDate workDate = request.workDate();
        LocalDate rangeStart = workDate;
        LocalDate rangeEnd = workDate;

        if ("ASSIGNMENT".equals(scope) && assignmentUuid == null) {
            throw new IllegalArgumentException("Assignment is required.");
        }
        if ("SCHEDULE_DAY".equals(scope) && scheduleDayUuid == null) {
            throw new IllegalArgumentException("Schedule day is required.");
        }
        if (("DATE".equals(scope) || "WEEK".equals(scope)) && workDate == null) {
            throw new IllegalArgumentException("Work date is required.");
        }
        if ("WEEK".equals(scope)) {
            rangeStart = workDate.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            rangeEnd = rangeStart.plusDays(6);
        }

        int confirmedCount = attendanceDao.confirmPlanned(
            account.agencyOwnerUuid(),
            account.accountUuid(),
            scope,
            assignmentUuid,
            scheduleDayUuid,
            rangeStart,
            rangeEnd
        );
        attendanceDao.refreshWorkerActivitySummary(account.agencyOwnerUuid());
        return new ConfirmPlannedAttendanceResponse(confirmedCount);
    }

    private String normalizeScope(String value) {
        String normalizedValue = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
        return switch (normalizedValue) {
            case "ASSIGNMENT", "SCHEDULE_DAY", "DATE", "WEEK" -> normalizedValue;
            default -> throw new IllegalArgumentException("Attendance confirmation scope is invalid.");
        };
    }

    private String normalizeLoginId(String loginId) {
        return loginId == null || loginId.isBlank() ? "test" : loginId.trim();
    }
}
