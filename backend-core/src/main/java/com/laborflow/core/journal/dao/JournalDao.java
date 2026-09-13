package com.laborflow.core.journal.dao;

import com.laborflow.core.journal.dto.SalesJournalResponse;
import com.laborflow.core.journal.dto.WorkJournalAttendanceResponse;
import com.laborflow.core.journal.dto.WorkJournalDetailResponse;
import com.laborflow.core.journal.dto.WorkJournalSummaryResponse;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface JournalDao {
    Optional<AccountContext> findAccountContext(String loginId);

    List<SalesJournalResponse> findSalesJournals(
        UUID agencyOwnerUuid,
        LocalDate fromDate,
        LocalDate toDate,
        String query
    );

    Optional<SalesJournalResponse> findSalesJournal(UUID agencyOwnerUuid, UUID journalUuid);

    SalesJournalResponse insertSalesJournal(
        UUID agencyOwnerUuid,
        UUID accountUuid,
        OffsetDateTime activityAt,
        String content
    );

    int updateSalesJournal(
        UUID agencyOwnerUuid,
        UUID accountUuid,
        UUID journalUuid,
        OffsetDateTime activityAt,
        String content
    );

    int softDeleteSalesJournal(UUID agencyOwnerUuid, UUID accountUuid, UUID journalUuid);

    List<WorkJournalSummaryResponse> findWorkJournals(
        UUID agencyOwnerUuid,
        LocalDate fromDate,
        LocalDate toDate,
        String clientQuery
    );

    Optional<WorkJournalDetailResponse> findWorkJournalDetail(
        UUID agencyOwnerUuid,
        UUID scheduleDayUuid
    );

    List<WorkJournalAttendanceResponse> findWorkJournalAttendance(
        UUID agencyOwnerUuid,
        UUID scheduleDayUuid
    );

    int upsertWorkJournal(
        UUID agencyOwnerUuid,
        UUID accountUuid,
        UUID scheduleDayUuid,
        String memo
    );

    int softDeleteWorkJournal(UUID agencyOwnerUuid, UUID accountUuid, UUID scheduleDayUuid);

    record AccountContext(UUID accountUuid, UUID agencyOwnerUuid) {
    }
}
