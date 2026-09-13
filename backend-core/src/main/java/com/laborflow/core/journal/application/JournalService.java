package com.laborflow.core.journal.application;

import com.laborflow.core.journal.dao.JournalDao;
import com.laborflow.core.journal.dao.JournalDao.AccountContext;
import com.laborflow.core.journal.dto.SalesJournalRequest;
import com.laborflow.core.journal.dto.SalesJournalResponse;
import com.laborflow.core.journal.dto.WorkJournalAttendanceResponse;
import com.laborflow.core.journal.dto.WorkJournalDetailResponse;
import com.laborflow.core.journal.dto.WorkJournalSaveRequest;
import com.laborflow.core.journal.dto.WorkJournalSummaryResponse;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class JournalService {
    private static final ZoneId BUSINESS_TIME_ZONE = ZoneId.of("Asia/Seoul");

    private final JournalDao journalDao;

    public JournalService(JournalDao journalDao) {
        this.journalDao = journalDao;
    }

    @Transactional(readOnly = true)
    public List<SalesJournalResponse> getSalesJournals(
        String loginId,
        LocalDate fromDate,
        LocalDate toDate,
        String query
    ) {
        validateDateRange(fromDate, toDate);
        AccountContext account = findAccount(loginId);
        return journalDao.findSalesJournals(
            account.agencyOwnerUuid(),
            fromDate,
            toDate,
            normalizeOptionalText(query)
        );
    }

    @Transactional(readOnly = true)
    public SalesJournalResponse getSalesJournal(String loginId, UUID journalUuid) {
        AccountContext account = findAccount(loginId);
        return journalDao.findSalesJournal(account.agencyOwnerUuid(), journalUuid)
            .orElseThrow(() -> new IllegalArgumentException("Sales journal was not found."));
    }

    @Transactional
    public SalesJournalResponse createSalesJournal(String loginId, SalesJournalRequest request) {
        AccountContext account = findAccount(loginId);
        LocalDateTime activityAt = requireActivityAt(request.activityAt());
        String content = requireContent(request.content());
        return journalDao.insertSalesJournal(
            account.agencyOwnerUuid(),
            account.accountUuid(),
            activityAt.atZone(BUSINESS_TIME_ZONE).toOffsetDateTime(),
            content
        );
    }

    @Transactional
    public SalesJournalResponse updateSalesJournal(
        String loginId,
        UUID journalUuid,
        SalesJournalRequest request
    ) {
        AccountContext account = findAccount(loginId);
        LocalDateTime activityAt = requireActivityAt(request.activityAt());
        String content = requireContent(request.content());
        int updatedRows = journalDao.updateSalesJournal(
            account.agencyOwnerUuid(),
            account.accountUuid(),
            journalUuid,
            activityAt.atZone(BUSINESS_TIME_ZONE).toOffsetDateTime(),
            content
        );
        if (updatedRows == 0) {
            throw new IllegalArgumentException("Sales journal was not found.");
        }
        return getSalesJournal(loginId, journalUuid);
    }

    @Transactional
    public void deleteSalesJournal(String loginId, UUID journalUuid) {
        AccountContext account = findAccount(loginId);
        if (journalDao.softDeleteSalesJournal(
            account.agencyOwnerUuid(),
            account.accountUuid(),
            journalUuid
        ) == 0) {
            throw new IllegalArgumentException("Sales journal was not found.");
        }
    }

    @Transactional(readOnly = true)
    public List<WorkJournalSummaryResponse> getWorkJournals(
        String loginId,
        LocalDate fromDate,
        LocalDate toDate,
        String clientQuery
    ) {
        validateDateRange(fromDate, toDate);
        AccountContext account = findAccount(loginId);
        return journalDao.findWorkJournals(
            account.agencyOwnerUuid(),
            fromDate,
            toDate,
            normalizeOptionalText(clientQuery)
        );
    }

    @Transactional(readOnly = true)
    public WorkJournalDetailResponse getWorkJournal(String loginId, UUID scheduleDayUuid) {
        AccountContext account = findAccount(loginId);
        WorkJournalDetailResponse detail = journalDao.findWorkJournalDetail(
            account.agencyOwnerUuid(),
            scheduleDayUuid
        ).orElseThrow(() -> new IllegalArgumentException("Scheduled work was not found."));
        List<WorkJournalAttendanceResponse> attendance = journalDao.findWorkJournalAttendance(
            account.agencyOwnerUuid(),
            scheduleDayUuid
        );
        int actualWorkerCount = attendance.stream()
            .filter(record -> "WORKED".equals(record.status()))
            .mapToInt(WorkJournalAttendanceResponse::workerCount)
            .sum();
        return new WorkJournalDetailResponse(
            detail.journalUuid(),
            detail.scheduleDayUuid(),
            detail.workDate(),
            detail.ownerName(),
            detail.siteName(),
            detail.address(),
            detail.workTitle(),
            detail.memo(),
            detail.createdAt(),
            detail.updatedAt(),
            actualWorkerCount,
            attendance
        );
    }

    @Transactional
    public WorkJournalDetailResponse saveWorkJournal(
        String loginId,
        UUID scheduleDayUuid,
        WorkJournalSaveRequest request
    ) {
        AccountContext account = findAccount(loginId);
        String memo = normalizeOptionalText(request.memo());
        if (journalDao.upsertWorkJournal(
            account.agencyOwnerUuid(),
            account.accountUuid(),
            scheduleDayUuid,
            memo
        ) == 0) {
            throw new IllegalArgumentException("Scheduled work was not found.");
        }
        return getWorkJournal(loginId, scheduleDayUuid);
    }

    @Transactional
    public void deleteWorkJournal(String loginId, UUID scheduleDayUuid) {
        AccountContext account = findAccount(loginId);
        if (journalDao.softDeleteWorkJournal(
            account.agencyOwnerUuid(),
            account.accountUuid(),
            scheduleDayUuid
        ) == 0) {
            throw new IllegalArgumentException("Work journal was not found.");
        }
    }

    private AccountContext findAccount(String loginId) {
        String normalizedLoginId = normalizeOptionalText(loginId);
        if (normalizedLoginId == null) {
            throw new IllegalArgumentException("Login ID is required.");
        }
        return journalDao.findAccountContext(normalizedLoginId)
            .orElseThrow(() -> new IllegalArgumentException("Active labor agency account was not found."));
    }

    private LocalDateTime requireActivityAt(LocalDateTime activityAt) {
        if (activityAt == null) {
            throw new IllegalArgumentException("Activity date and time are required.");
        }
        return activityAt;
    }

    private String requireContent(String content) {
        String normalizedContent = normalizeOptionalText(content);
        if (normalizedContent == null) {
            throw new IllegalArgumentException("Sales journal content is required.");
        }
        return normalizedContent;
    }

    private void validateDateRange(LocalDate fromDate, LocalDate toDate) {
        if (fromDate != null && toDate != null && toDate.isBefore(fromDate)) {
            throw new IllegalArgumentException("The end date must not be before the start date.");
        }
    }

    private String normalizeOptionalText(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
