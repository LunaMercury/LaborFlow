package com.laborflow.core.journal.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.laborflow.core.journal.dao.JournalDao;
import com.laborflow.core.journal.dao.JournalDao.AccountContext;
import com.laborflow.core.journal.dto.SalesJournalRequest;
import com.laborflow.core.journal.dto.SalesJournalResponse;
import com.laborflow.core.journal.dto.WorkJournalAttendanceResponse;
import com.laborflow.core.journal.dto.WorkJournalDetailResponse;
import com.laborflow.core.journal.dto.WorkJournalSaveRequest;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class JournalServiceTest {
    private static final String LOGIN_ID = "test";
    private static final UUID ACCOUNT_UUID = UUID.fromString("10000000-0000-0000-0000-000000000001");
    private static final UUID AGENCY_OWNER_UUID = UUID.fromString("20000000-0000-0000-0000-000000000001");
    private static final UUID SCHEDULE_DAY_UUID = UUID.fromString("30000000-0000-0000-0000-000000000001");
    private static final UUID JOURNAL_UUID = UUID.fromString("40000000-0000-0000-0000-000000000001");

    private final JournalDao journalDao = mock(JournalDao.class);
    private final JournalService service = new JournalService(journalDao);

    @BeforeEach
    void setUp() {
        when(journalDao.findAccountContext(LOGIN_ID))
            .thenReturn(Optional.of(new AccountContext(ACCOUNT_UUID, AGENCY_OWNER_UUID)));
    }

    @Test
    void rejectsBlankSalesJournalWithoutWriting() {
        assertThatThrownBy(() -> service.createSalesJournal(
            LOGIN_ID,
            new SalesJournalRequest(LocalDateTime.of(2026, 9, 11, 14, 30), " \n\t ")
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("Sales journal content is required.");

        verify(journalDao, never()).insertSalesJournal(any(), any(), any(), any());
    }

    @Test
    void allowsMultipleSalesJournalsAtTheSameActivityTime() {
        LocalDateTime activityAt = LocalDateTime.of(2026, 9, 11, 14, 30);
        OffsetDateTime storedActivityAt = OffsetDateTime.parse("2026-09-11T14:30:00+09:00");
        when(journalDao.insertSalesJournal(
            AGENCY_OWNER_UUID,
            ACCOUNT_UUID,
            storedActivityAt,
            "첫 번째 기록"
        )).thenReturn(salesJournal(UUID.fromString("50000000-0000-0000-0000-000000000001"), "첫 번째 기록"));
        when(journalDao.insertSalesJournal(
            AGENCY_OWNER_UUID,
            ACCOUNT_UUID,
            storedActivityAt,
            "두 번째 기록"
        )).thenReturn(salesJournal(UUID.fromString("50000000-0000-0000-0000-000000000002"), "두 번째 기록"));

        SalesJournalResponse first = service.createSalesJournal(
            LOGIN_ID,
            new SalesJournalRequest(activityAt, "첫 번째 기록")
        );
        SalesJournalResponse second = service.createSalesJournal(
            LOGIN_ID,
            new SalesJournalRequest(activityAt, "두 번째 기록")
        );

        assertThat(first.uuid()).isNotEqualTo(second.uuid());
        verify(journalDao, times(2)).insertSalesJournal(
            any(),
            any(),
            any(),
            any()
        );
    }

    @Test
    void rejectsInvertedSalesJournalDateRangeBeforeReading() {
        assertThatThrownBy(() -> service.getSalesJournals(
            LOGIN_ID,
            LocalDate.of(2026, 9, 12),
            LocalDate.of(2026, 9, 11),
            "마늘"
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("The end date must not be before the start date.");

        verify(journalDao, never()).findSalesJournals(any(), any(), any(), any());
    }

    @Test
    void openingWorkJournalReadsCurrentSourceWithoutCreatingJournal() {
        when(journalDao.findWorkJournalDetail(AGENCY_OWNER_UUID, SCHEDULE_DAY_UUID))
            .thenReturn(Optional.of(workJournalDetail(null, "")));
        when(journalDao.findWorkJournalAttendance(AGENCY_OWNER_UUID, SCHEDULE_DAY_UUID))
            .thenReturn(List.of(
                attendance("김씨", "WORKED", "07:10", "16:20"),
                new WorkJournalAttendanceResponse(
                    "동행 작업자",
                    "guest",
                    3,
                    "WORKED",
                    "07:10",
                    "16:20",
                    60
                ),
                attendance("박씨", "UNRECORDED", null, null),
                attendance("이씨", "ABSENT", null, null)
            ));

        WorkJournalDetailResponse result = service.getWorkJournal(LOGIN_ID, SCHEDULE_DAY_UUID);

        assertThat(result.journalUuid()).isNull();
        assertThat(result.actualWorkerCount()).isEqualTo(4);
        assertThat(result.attendance())
            .extracting(WorkJournalAttendanceResponse::status)
            .containsExactly("WORKED", "WORKED", "UNRECORDED", "ABSENT");
        assertThat(result.attendance().getFirst().actualStartTime()).isEqualTo("07:10");
        verify(journalDao, never()).upsertWorkJournal(any(), any(), any(), any());
    }

    @Test
    void savesOnlyWorkJournalMemoAndReturnsCurrentSource() {
        when(journalDao.upsertWorkJournal(
            AGENCY_OWNER_UUID,
            ACCOUNT_UUID,
            SCHEDULE_DAY_UUID,
            "진행 내용\n남은 작업"
        )).thenReturn(1);
        when(journalDao.findWorkJournalDetail(AGENCY_OWNER_UUID, SCHEDULE_DAY_UUID))
            .thenReturn(Optional.of(workJournalDetail(JOURNAL_UUID, "진행 내용\n남은 작업")));
        when(journalDao.findWorkJournalAttendance(AGENCY_OWNER_UUID, SCHEDULE_DAY_UUID))
            .thenReturn(List.of());

        WorkJournalDetailResponse result = service.saveWorkJournal(
            LOGIN_ID,
            SCHEDULE_DAY_UUID,
            new WorkJournalSaveRequest("  진행 내용\n남은 작업  ")
        );

        assertThat(result.journalUuid()).isEqualTo(JOURNAL_UUID);
        assertThat(result.memo()).isEqualTo("진행 내용\n남은 작업");
        verify(journalDao).upsertWorkJournal(
            AGENCY_OWNER_UUID,
            ACCOUNT_UUID,
            SCHEDULE_DAY_UUID,
            "진행 내용\n남은 작업"
        );
    }

    @Test
    void doesNotWriteWorkJournalForMissingOrOtherAgencyScheduleDay() {
        when(journalDao.upsertWorkJournal(
            AGENCY_OWNER_UUID,
            ACCOUNT_UUID,
            SCHEDULE_DAY_UUID,
            "메모"
        )).thenReturn(0);

        assertThatThrownBy(() -> service.saveWorkJournal(
            LOGIN_ID,
            SCHEDULE_DAY_UUID,
            new WorkJournalSaveRequest("메모")
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("Scheduled work was not found.");

        verify(journalDao, never()).findWorkJournalDetail(any(), any());
    }

    @Test
    void deletingWorkJournalDoesNotDeleteScheduleOrAttendanceThroughService() {
        when(journalDao.softDeleteWorkJournal(
            AGENCY_OWNER_UUID,
            ACCOUNT_UUID,
            SCHEDULE_DAY_UUID
        )).thenReturn(1);

        service.deleteWorkJournal(LOGIN_ID, SCHEDULE_DAY_UUID);

        verify(journalDao).softDeleteWorkJournal(
            AGENCY_OWNER_UUID,
            ACCOUNT_UUID,
            SCHEDULE_DAY_UUID
        );
        verify(journalDao, never()).upsertWorkJournal(any(), any(), any(), any());
    }

    private WorkJournalDetailResponse workJournalDetail(UUID journalUuid, String memo) {
        return new WorkJournalDetailResponse(
            journalUuid,
            SCHEDULE_DAY_UUID,
            LocalDate.of(2026, 9, 11),
            "가상 농장주",
            "가상 현장",
            "가상 주소",
            "마늘 심기",
            memo,
            journalUuid == null ? null : OffsetDateTime.parse("2026-09-11T18:00:00+09:00"),
            journalUuid == null ? null : OffsetDateTime.parse("2026-09-11T18:10:00+09:00"),
            0,
            List.of()
        );
    }

    private SalesJournalResponse salesJournal(UUID journalUuid, String content) {
        OffsetDateTime activityAt = OffsetDateTime.parse("2026-09-11T14:30:00+09:00");
        return new SalesJournalResponse(journalUuid, activityAt, content, activityAt, activityAt);
    }

    private WorkJournalAttendanceResponse attendance(
        String name,
        String status,
        String startTime,
        String endTime
    ) {
        return new WorkJournalAttendanceResponse(name, "registered", 1, status, startTime, endTime, 60);
    }
}
