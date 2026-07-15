package com.laborflow.core.attendance.dao;

import com.laborflow.core.attendance.dto.AttendanceRecordResponse;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AttendanceDao {
    Optional<AccountContext> findAccountContext(String loginId);

    Optional<AttendanceAssignmentContext> findAssignmentContext(UUID agencyOwnerUuid, UUID assignmentUuid);

    List<AttendanceRecordResponse> findRecords(UUID agencyOwnerUuid, LocalDate workDate);

    int upsertTaskNote(
        UUID agencyOwnerUuid,
        UUID accountUuid,
        UUID scheduleDayUuid,
        String note
    );

    int confirmPlanned(
        UUID agencyOwnerUuid,
        UUID accountUuid,
        String scope,
        UUID assignmentUuid,
        UUID scheduleDayUuid,
        LocalDate rangeStart,
        LocalDate rangeEnd
    );

    void refreshWorkerActivitySummary(UUID agencyOwnerUuid);

    void upsertRecord(
        UUID agencyOwnerUuid,
        UUID accountUuid,
        UUID assignmentUuid,
        OffsetDateTime actualStartAt,
        OffsetDateTime actualEndAt,
        int breakMinutes,
        String status,
        String timeEntryType
    );

    record AccountContext(UUID accountUuid, UUID agencyOwnerUuid) {
    }

    record AttendanceAssignmentContext(
        LocalDate workDate,
        LocalTime plannedStartTime,
        LocalTime plannedEndTime,
        LocalTime actualStartTime,
        LocalTime actualEndTime
    ) {
    }
}
