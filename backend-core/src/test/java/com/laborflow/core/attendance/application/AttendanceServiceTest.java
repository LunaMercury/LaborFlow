package com.laborflow.core.attendance.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.laborflow.core.attendance.dao.AttendanceDao;
import com.laborflow.core.attendance.dao.AttendanceDao.AccountContext;
import com.laborflow.core.attendance.dao.AttendanceDao.AttendanceAssignmentContext;
import com.laborflow.core.attendance.dto.AttendanceRecordResponse;
import com.laborflow.core.attendance.dto.AttendanceScheduleDayResponse;
import com.laborflow.core.attendance.dto.ConfirmPlannedAttendanceRequest;
import com.laborflow.core.attendance.dto.UpdateAttendanceRecordRequest;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class AttendanceServiceTest {
    private static final String LOGIN_ID = "test";
    private static final ZoneId BUSINESS_TIME_ZONE = ZoneId.of("Asia/Seoul");
    private static final LocalDate WORK_DATE = LocalDate.of(2024, 3, 15);
    private static final UUID ACCOUNT_UUID = UUID.fromString("10000000-0000-0000-0000-000000000001");
    private static final UUID AGENCY_OWNER_UUID = UUID.fromString("20000000-0000-0000-0000-000000000001");
    private static final UUID ATTENDANCE_UUID = UUID.fromString("30000000-0000-0000-0000-000000000001");
    private static final UUID SCHEDULE_DAY_UUID = UUID.fromString("40000000-0000-0000-0000-000000000001");
    private static final UUID WORKER_PROFILE_UUID = UUID.fromString("50000000-0000-0000-0000-000000000001");

    private final AttendanceDao attendanceDao = mock(AttendanceDao.class);
    private final AttendanceService service = new AttendanceService(attendanceDao);

    @BeforeEach
    void setUp() {
        when(attendanceDao.findAccountContext(LOGIN_ID))
            .thenReturn(Optional.of(new AccountContext(ACCOUNT_UUID, AGENCY_OWNER_UUID)));
    }

    @Test
    void returnsScheduleDayEvenWhenNoWorkersAreAssigned() {
        LocalDate workDate = LocalDate.of(2026, 8, 18);
        AttendanceScheduleDayResponse scheduleDay = new AttendanceScheduleDayResponse(
            SCHEDULE_DAY_UUID,
            workDate,
            "숙소 옆집",
            "고추 수확",
            "",
            "영양숙소 옆집",
            "",
            "06:30",
            "17:30"
        );

        when(attendanceDao.findScheduleDays(AGENCY_OWNER_UUID, workDate))
            .thenReturn(List.of(scheduleDay));
        when(attendanceDao.findRecords(AGENCY_OWNER_UUID, workDate))
            .thenReturn(List.of());

        var response = service.getRecords(LOGIN_ID, workDate);

        assertThat(response.tasks()).containsExactly(scheduleDay);
        assertThat(response.records()).isEmpty();
    }

    @Test
    void normalizesSupportedStatusAndTimeEntryTypeBeforeSaving() {
        UUID assignmentUuid = assignmentUuid(1);
        AttendanceRecordResponse savedRecord = attendanceRecord(
            assignmentUuid,
            "08:10",
            "16:40",
            30,
            "WORKED",
            "ESTIMATED"
        );
        stubAssignment(
            assignmentUuid,
            assignmentContext(WORK_DATE, LocalTime.of(7, 0), LocalTime.of(17, 0), null, null),
            savedRecord
        );

        AttendanceRecordResponse result = service.updateRecord(
            LOGIN_ID,
            assignmentUuid,
            new UpdateAttendanceRecordRequest(
                LocalTime.of(8, 10),
                LocalTime.of(16, 40),
                30,
                " worked ",
                " estimated "
            )
        );

        assertThat(result).isEqualTo(savedRecord);
        verify(attendanceDao).upsertRecord(
            AGENCY_OWNER_UUID,
            ACCOUNT_UUID,
            assignmentUuid,
            OffsetDateTime.parse("2024-03-15T08:10:00+09:00"),
            OffsetDateTime.parse("2024-03-15T16:40:00+09:00"),
            30,
            "WORKED",
            "ESTIMATED"
        );
    }

    @Test
    void rejectsUnsupportedAttendanceStatusWithoutSaving() {
        UUID assignmentUuid = assignmentUuid(2);
        stubAssignmentContext(assignmentUuid, standardAssignmentContext());

        assertThatThrownBy(() -> service.updateRecord(
            LOGIN_ID,
            assignmentUuid,
            new UpdateAttendanceRecordRequest(null, null, 0, "ON_LEAVE", "UNKNOWN")
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("Attendance status is invalid.");

        assertNoRecordWasSaved();
    }

    @Test
    void rejectsUnsupportedTimeEntryTypeWithoutSaving() {
        UUID assignmentUuid = assignmentUuid(3);
        stubAssignmentContext(assignmentUuid, standardAssignmentContext());

        assertThatThrownBy(() -> service.updateRecord(
            LOGIN_ID,
            assignmentUuid,
            new UpdateAttendanceRecordRequest(
                LocalTime.of(7, 0),
                LocalTime.of(17, 0),
                60,
                "WORKED",
                "AUTOMATIC"
            )
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("Attendance time entry type is invalid.");

        assertNoRecordWasSaved();
    }

    @ParameterizedTest
    @ValueSource(strings = {"07:00", "06:59"})
    void rejectsEndTimeThatIsNotAfterStartTimeWithoutSaving(String endTime) {
        UUID assignmentUuid = assignmentUuid(4);
        stubAssignmentContext(assignmentUuid, standardAssignmentContext());

        assertThatThrownBy(() -> service.updateRecord(
            LOGIN_ID,
            assignmentUuid,
            new UpdateAttendanceRecordRequest(
                LocalTime.of(7, 0),
                LocalTime.parse(endTime),
                0,
                "WORKED",
                "EXACT"
            )
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("End time must be after start time.");

        assertNoRecordWasSaved();
    }

    @Test
    void rejectsFutureAttendanceWithoutSaving() {
        UUID assignmentUuid = assignmentUuid(5);
        LocalDate futureDate = LocalDate.now(BUSINESS_TIME_ZONE).plusDays(2);
        stubAssignmentContext(
            assignmentUuid,
            assignmentContext(futureDate, LocalTime.of(7, 0), LocalTime.of(17, 0), null, null)
        );

        assertThatThrownBy(() -> service.updateRecord(
            LOGIN_ID,
            assignmentUuid,
            new UpdateAttendanceRecordRequest(null, null, 60, "WORKED", "PLANNED")
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("Future attendance cannot be confirmed.");

        assertNoRecordWasSaved();
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 1440})
    void acceptsInclusiveBreakMinuteBoundaries(int breakMinutes) {
        UUID assignmentUuid = assignmentUuid(6);
        AttendanceRecordResponse savedRecord = attendanceRecord(
            assignmentUuid,
            "",
            "",
            breakMinutes,
            "DRAFT",
            "UNKNOWN"
        );
        stubAssignment(assignmentUuid, standardAssignmentContext(), savedRecord);

        AttendanceRecordResponse result = service.updateRecord(
            LOGIN_ID,
            assignmentUuid,
            new UpdateAttendanceRecordRequest(null, null, breakMinutes, "DRAFT", "UNKNOWN")
        );

        assertThat(result).isEqualTo(savedRecord);
        verify(attendanceDao).upsertRecord(
            AGENCY_OWNER_UUID,
            ACCOUNT_UUID,
            assignmentUuid,
            null,
            null,
            breakMinutes,
            "DRAFT",
            "UNKNOWN"
        );
    }

    @ParameterizedTest
    @ValueSource(ints = {-1, 1441})
    void rejectsBreakMinutesOutsideAllowedRangeWithoutSaving(int breakMinutes) {
        UUID assignmentUuid = assignmentUuid(7);
        stubAssignmentContext(assignmentUuid, standardAssignmentContext());

        assertThatThrownBy(() -> service.updateRecord(
            LOGIN_ID,
            assignmentUuid,
            new UpdateAttendanceRecordRequest(null, null, breakMinutes, "DRAFT", "UNKNOWN")
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("Break minutes are invalid.");

        assertNoRecordWasSaved();
    }

    @Test
    void defaultsMissingBreakMinutesToZero() {
        UUID assignmentUuid = assignmentUuid(8);
        AttendanceRecordResponse savedRecord = attendanceRecord(
            assignmentUuid,
            "",
            "",
            0,
            "DRAFT",
            "UNKNOWN"
        );
        stubAssignment(assignmentUuid, standardAssignmentContext(), savedRecord);

        service.updateRecord(
            LOGIN_ID,
            assignmentUuid,
            new UpdateAttendanceRecordRequest(null, null, null, "DRAFT", "UNKNOWN")
        );

        verify(attendanceDao).upsertRecord(
            AGENCY_OWNER_UUID,
            ACCOUNT_UUID,
            assignmentUuid,
            null,
            null,
            0,
            "DRAFT",
            "UNKNOWN"
        );
    }

    @ParameterizedTest
    @ValueSource(strings = {"ABSENT", "CANCELLED"})
    void clearsTimesAndBreakWhenTransitioningToNonWorkingStatus(String status) {
        UUID assignmentUuid = assignmentUuid(9);
        AttendanceRecordResponse savedRecord = attendanceRecord(
            assignmentUuid,
            "",
            "",
            0,
            status,
            "UNKNOWN"
        );
        stubAssignment(
            assignmentUuid,
            assignmentContext(
                WORK_DATE,
                LocalTime.of(7, 0),
                LocalTime.of(17, 0),
                LocalTime.of(7, 20),
                LocalTime.of(16, 50)
            ),
            savedRecord
        );

        AttendanceRecordResponse result = service.updateRecord(
            LOGIN_ID,
            assignmentUuid,
            new UpdateAttendanceRecordRequest(
                LocalTime.of(8, 0),
                LocalTime.of(12, 0),
                45,
                status,
                "EXACT"
            )
        );

        assertThat(result).isEqualTo(savedRecord);
        verify(attendanceDao).upsertRecord(
            AGENCY_OWNER_UUID,
            ACCOUNT_UUID,
            assignmentUuid,
            null,
            null,
            0,
            status,
            "UNKNOWN"
        );
    }

    @Test
    void supplementsMissingWorkedTimesFromPlannedSchedule() {
        UUID assignmentUuid = assignmentUuid(10);
        AttendanceRecordResponse savedRecord = attendanceRecord(
            assignmentUuid,
            "07:00",
            "17:00",
            60,
            "WORKED",
            "PLANNED"
        );
        stubAssignment(assignmentUuid, standardAssignmentContext(), savedRecord);

        AttendanceRecordResponse result = service.updateRecord(
            LOGIN_ID,
            assignmentUuid,
            new UpdateAttendanceRecordRequest(null, null, 60, "WORKED", null)
        );

        assertThat(result).isEqualTo(savedRecord);
        verify(attendanceDao).upsertRecord(
            AGENCY_OWNER_UUID,
            ACCOUNT_UUID,
            assignmentUuid,
            OffsetDateTime.parse("2024-03-15T07:00:00+09:00"),
            OffsetDateTime.parse("2024-03-15T17:00:00+09:00"),
            60,
            "WORKED",
            "PLANNED"
        );
    }

    @Test
    void preservesEnteredTimeAndSupplementsOnlyMissingSideFromPlan() {
        UUID assignmentUuid = assignmentUuid(11);
        AttendanceRecordResponse savedRecord = attendanceRecord(
            assignmentUuid,
            "08:20",
            "17:00",
            60,
            "WORKED",
            "EXACT"
        );
        stubAssignment(assignmentUuid, standardAssignmentContext(), savedRecord);

        AttendanceRecordResponse result = service.updateRecord(
            LOGIN_ID,
            assignmentUuid,
            new UpdateAttendanceRecordRequest(LocalTime.of(8, 20), null, 60, "WORKED", null)
        );

        assertThat(result).isEqualTo(savedRecord);
        verify(attendanceDao).upsertRecord(
            AGENCY_OWNER_UUID,
            ACCOUNT_UUID,
            assignmentUuid,
            OffsetDateTime.parse("2024-03-15T08:20:00+09:00"),
            OffsetDateTime.parse("2024-03-15T17:00:00+09:00"),
            60,
            "WORKED",
            "EXACT"
        );
    }

    @Test
    void treatsAssignmentOutsideCurrentAgencyScopeAsNotFoundWithoutSaving() {
        UUID assignmentUuid = assignmentUuid(12);
        when(attendanceDao.findAssignmentContext(AGENCY_OWNER_UUID, assignmentUuid))
            .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.updateRecord(
            LOGIN_ID,
            assignmentUuid,
            new UpdateAttendanceRecordRequest(null, null, 0, "DRAFT", "UNKNOWN")
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("Attendance assignment was not found.");

        verify(attendanceDao).findAssignmentContext(AGENCY_OWNER_UUID, assignmentUuid);
        assertNoRecordWasSaved();
    }

    @Test
    void rejectsInvalidPlannedConfirmationScopeWithoutSaving() {
        assertThatThrownBy(() -> service.confirmPlanned(
            LOGIN_ID,
            new ConfirmPlannedAttendanceRequest("MONTH", null, null, WORK_DATE)
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("Attendance confirmation scope is invalid.");

        assertNoPlannedAttendanceWasSaved();
    }

    @Test
    void requiresAssignmentForAssignmentScopedConfirmationWithoutSaving() {
        assertThatThrownBy(() -> service.confirmPlanned(
            LOGIN_ID,
            new ConfirmPlannedAttendanceRequest("ASSIGNMENT", null, null, null)
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("Assignment is required.");

        assertNoPlannedAttendanceWasSaved();
    }

    private void stubAssignment(
        UUID assignmentUuid,
        AttendanceAssignmentContext assignmentContext,
        AttendanceRecordResponse savedRecord
    ) {
        stubAssignmentContext(assignmentUuid, assignmentContext);
        when(attendanceDao.findRecords(AGENCY_OWNER_UUID, assignmentContext.workDate()))
            .thenReturn(List.of(savedRecord));
    }

    private void stubAssignmentContext(UUID assignmentUuid, AttendanceAssignmentContext assignmentContext) {
        when(attendanceDao.findAssignmentContext(AGENCY_OWNER_UUID, assignmentUuid))
            .thenReturn(Optional.of(assignmentContext));
    }

    private AttendanceAssignmentContext standardAssignmentContext() {
        return assignmentContext(
            WORK_DATE,
            LocalTime.of(7, 0),
            LocalTime.of(17, 0),
            null,
            null
        );
    }

    private AttendanceAssignmentContext assignmentContext(
        LocalDate workDate,
        LocalTime plannedStartTime,
        LocalTime plannedEndTime,
        LocalTime actualStartTime,
        LocalTime actualEndTime
    ) {
        return new AttendanceAssignmentContext(
            workDate,
            plannedStartTime,
            plannedEndTime,
            actualStartTime,
            actualEndTime
        );
    }

    private AttendanceRecordResponse attendanceRecord(
        UUID assignmentUuid,
        String actualStartTime,
        String actualEndTime,
        int breakMinutes,
        String status,
        String timeEntryType
    ) {
        return new AttendanceRecordResponse(
            assignmentUuid,
            ATTENDANCE_UUID,
            SCHEDULE_DAY_UUID,
            WORKER_PROFILE_UUID,
            "REGISTERED",
            "김철수",
            "동문주차장",
            "men",
            WORK_DATE,
            "김농주",
            "마늘 수확",
            "동문 농장",
            "동문로 1",
            "",
            "07:00",
            "17:00",
            actualStartTime,
            actualEndTime,
            breakMinutes,
            status,
            timeEntryType,
            !"DRAFT".equals(status)
        );
    }

    private UUID assignmentUuid(int suffix) {
        return UUID.fromString("60000000-0000-0000-0000-%012d".formatted(suffix));
    }

    private void assertNoRecordWasSaved() {
        verify(attendanceDao, never()).upsertRecord(
            any(),
            any(),
            any(),
            any(),
            any(),
            anyInt(),
            anyString(),
            anyString()
        );
        verify(attendanceDao, never()).refreshWorkerActivitySummary(any());
    }

    private void assertNoPlannedAttendanceWasSaved() {
        verify(attendanceDao, never()).confirmPlanned(
            any(),
            any(),
            anyString(),
            any(),
            any(),
            any(),
            any()
        );
        verify(attendanceDao, never()).refreshWorkerActivitySummary(any());
    }
}
