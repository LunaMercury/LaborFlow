package com.laborflow.core.attendance.dao;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

public interface AttendanceDao {
    Optional<AccountContext> findAccountContext(String loginId);

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

    record AccountContext(UUID accountUuid, UUID agencyOwnerUuid) {
    }
}
