package com.laborflow.core.attendance.application;

import com.laborflow.core.attendance.dao.AttendanceDao;
import com.laborflow.core.attendance.dao.AttendanceDao.AccountContext;
import com.laborflow.core.attendance.dao.AttendanceDao.AttendanceAssignmentContext;
import com.laborflow.core.attendance.dto.AttendanceRecordListResponse;
import com.laborflow.core.attendance.dto.AttendanceRecordResponse;
import com.laborflow.core.attendance.dto.AttendanceTaskNoteResponse;
import com.laborflow.core.attendance.dto.ConfirmPlannedAttendanceRequest;
import com.laborflow.core.attendance.dto.ConfirmPlannedAttendanceResponse;
import com.laborflow.core.attendance.dto.UpdateAttendanceRecordRequest;
import com.laborflow.core.attendance.dto.UpdateAttendanceTaskNoteRequest;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AttendanceService {
    private static final ZoneId BUSINESS_TIME_ZONE = ZoneId.of("Asia/Seoul");
    private static final Set<String> ATTENDANCE_STATUSES = Set.of("DRAFT", "WORKED", "ABSENT", "CANCELLED");
    private static final Set<String> TIME_ENTRY_TYPES = Set.of("PLANNED", "EXACT", "ESTIMATED", "UNKNOWN");

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

    @Transactional(readOnly = true)
    public AttendanceRecordListResponse getRecords(String loginId, LocalDate workDate) {
        AccountContext account = findAccount(loginId);
        LocalDate normalizedWorkDate = workDate == null
            ? LocalDate.now(BUSINESS_TIME_ZONE)
            : workDate;
        return new AttendanceRecordListResponse(
            attendanceDao.findRecords(account.agencyOwnerUuid(), normalizedWorkDate)
        );
    }

    @Transactional
    public AttendanceRecordResponse updateRecord(
        String loginId,
        UUID assignmentUuid,
        UpdateAttendanceRecordRequest request
    ) {
        AccountContext account = findAccount(loginId);
        AttendanceAssignmentContext assignment = attendanceDao.findAssignmentContext(
            account.agencyOwnerUuid(),
            assignmentUuid
        ).orElseThrow(() -> new IllegalArgumentException("Attendance assignment was not found."));
        String status = normalizeAttendanceStatus(request.status());

        if (assignment.workDate().isAfter(LocalDate.now(BUSINESS_TIME_ZONE))) {
            throw new IllegalArgumentException("Future attendance cannot be confirmed.");
        }

        LocalTime actualStartTime = request.actualStartTime();
        LocalTime actualEndTime = request.actualEndTime();
        int breakMinutes = request.breakMinutes() == null ? 0 : request.breakMinutes();
        if (breakMinutes < 0 || breakMinutes > 1440) {
            throw new IllegalArgumentException("Break minutes are invalid.");
        }

        if ("ABSENT".equals(status) || "CANCELLED".equals(status)) {
            actualStartTime = null;
            actualEndTime = null;
            breakMinutes = 0;
        } else if ("WORKED".equals(status)) {
            actualStartTime = firstNonNull(
                actualStartTime,
                assignment.actualStartTime(),
                assignment.plannedStartTime()
            );
            actualEndTime = firstNonNull(
                actualEndTime,
                assignment.actualEndTime(),
                assignment.plannedEndTime()
            );
        }

        if (actualStartTime != null && actualEndTime != null && !actualEndTime.isAfter(actualStartTime)) {
            throw new IllegalArgumentException("End time must be after start time.");
        }

        String timeEntryType = normalizeTimeEntryType(
            request.timeEntryType(),
            status,
            request.actualStartTime() != null || request.actualEndTime() != null
        );
        attendanceDao.upsertRecord(
            account.agencyOwnerUuid(),
            account.accountUuid(),
            assignmentUuid,
            toOffsetDateTime(assignment.workDate(), actualStartTime),
            toOffsetDateTime(assignment.workDate(), actualEndTime),
            breakMinutes,
            status,
            timeEntryType
        );
        attendanceDao.refreshWorkerActivitySummary(account.agencyOwnerUuid());

        return attendanceDao.findRecords(account.agencyOwnerUuid(), assignment.workDate()).stream()
            .filter(record -> record.assignmentUuid().equals(assignmentUuid))
            .findFirst()
            .orElseThrow(() -> new IllegalStateException("Updated attendance record was not found."));
    }

    @Transactional
    public AttendanceTaskNoteResponse updateTaskNote(
        String loginId,
        UUID scheduleDayUuid,
        UpdateAttendanceTaskNoteRequest request
    ) {
        AccountContext account = findAccount(loginId);
        String note = normalizeTaskNote(request.note());
        int updatedRows = attendanceDao.upsertTaskNote(
            account.agencyOwnerUuid(),
            account.accountUuid(),
            scheduleDayUuid,
            note
        );
        if (updatedRows == 0) {
            throw new IllegalArgumentException("Attendance schedule day was not found.");
        }
        return new AttendanceTaskNoteResponse(scheduleDayUuid, note == null ? "" : note);
    }

    private String normalizeScope(String value) {
        String normalizedValue = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
        return switch (normalizedValue) {
            case "ASSIGNMENT", "SCHEDULE_DAY", "DATE", "WEEK" -> normalizedValue;
            default -> throw new IllegalArgumentException("Attendance confirmation scope is invalid.");
        };
    }

    private AccountContext findAccount(String loginId) {
        return attendanceDao.findAccountContext(normalizeLoginId(loginId))
            .orElseThrow(() -> new IllegalArgumentException("Labor agency owner account was not found."));
    }

    private String normalizeAttendanceStatus(String value) {
        String normalizedValue = value == null ? "DRAFT" : value.trim().toUpperCase(Locale.ROOT);
        if (!ATTENDANCE_STATUSES.contains(normalizedValue)) {
            throw new IllegalArgumentException("Attendance status is invalid.");
        }
        return normalizedValue;
    }

    private String normalizeTaskNote(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalizedValue = value.trim();
        if (normalizedValue.length() > 4000) {
            throw new IllegalArgumentException("Attendance task note is too long.");
        }
        return normalizedValue;
    }

    private String normalizeTimeEntryType(String value, String status, boolean hasRequestedTime) {
        if ("ABSENT".equals(status) || "CANCELLED".equals(status)) {
            return "UNKNOWN";
        }
        if (value != null && !value.isBlank()) {
            String normalizedValue = value.trim().toUpperCase(Locale.ROOT);
            if (!TIME_ENTRY_TYPES.contains(normalizedValue)) {
                throw new IllegalArgumentException("Attendance time entry type is invalid.");
            }
            return normalizedValue;
        }
        if (hasRequestedTime) {
            return "EXACT";
        }
        return "WORKED".equals(status) ? "PLANNED" : "UNKNOWN";
    }

    private LocalTime firstNonNull(LocalTime... values) {
        for (LocalTime value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private OffsetDateTime toOffsetDateTime(LocalDate workDate, LocalTime time) {
        if (time == null) {
            return null;
        }
        return ZonedDateTime.of(workDate, time, BUSINESS_TIME_ZONE).toOffsetDateTime();
    }

    private String normalizeLoginId(String loginId) {
        if (loginId == null || loginId.isBlank()) {
            throw new IllegalArgumentException("Login id is required.");
        }
        return loginId.trim();
    }
}
