package com.laborflow.core.noshow.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.laborflow.core.attendance.dao.AttendanceDao;
import com.laborflow.core.attendance.dao.AttendanceDao.AccountContext;
import com.laborflow.core.noshow.dao.NoShowDao;
import com.laborflow.core.noshow.dao.NoShowDao.Assignment;
import com.laborflow.core.noshow.dto.NoShowDtos.Cancel;
import com.laborflow.core.noshow.dto.NoShowDtos.Create;
import com.laborflow.core.noshow.dto.NoShowDtos.Incident;
import com.laborflow.core.noshow.dto.NoShowDtos.Update;
import com.laborflow.core.schedule.application.ScheduleService;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class NoShowServiceTest {
    private static final String LOGIN_ID = "sample-office";
    private static final String MISSING = "해당 노쇼 기록 또는 배정을 찾을 수 없습니다.";
    private static final LocalDate WORK_DATE = LocalDate.of(2024, 3, 15);
    private static final UUID OFFICE = UUID.fromString("10000000-0000-4000-8000-000000000001");
    private static final UUID ACCOUNT = UUID.fromString("20000000-0000-4000-8000-000000000001");
    private static final UUID ASSIGNMENT = UUID.fromString("30000000-0000-4000-8000-000000000001");
    private static final UUID DAY = UUID.fromString("40000000-0000-4000-8000-000000000001");
    private static final UUID WORKER = UUID.fromString("50000000-0000-4000-8000-000000000001");
    private static final UUID INCIDENT = UUID.fromString("60000000-0000-4000-8000-000000000001");
    private static final OffsetDateTime CREATED_AT = OffsetDateTime.parse("2024-03-15T08:00:00+09:00");

    private final NoShowDao dao = mock(NoShowDao.class);
    private final AttendanceDao attendance = mock(AttendanceDao.class);
    private final ScheduleService schedule = mock(ScheduleService.class);
    private final NoShowService service = new NoShowService(dao, attendance, schedule);

    @BeforeEach
    void setUp() {
        when(attendance.findAccountContext(LOGIN_ID))
            .thenReturn(Optional.of(new AccountContext(ACCOUNT, OFFICE)));
        when(dao.ownsWorker(OFFICE, WORKER)).thenReturn(true);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   "})
    void rejectsMissingLoginBeforeAccessingAnOffice(String loginId) {
        assertThatThrownBy(() -> service.list(loginId, WORKER, null))
            .isInstanceOf(NoShowException.class).hasMessage(MISSING);

        verifyNoInteractions(dao, attendance, schedule);
    }

    @Test
    void rejectsUnknownAccountWithoutAccessingIncidents() {
        when(attendance.findAccountContext("unknown")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.list("unknown", WORKER, null))
            .isInstanceOf(NoShowException.class).hasMessage(MISSING);

        verifyNoInteractions(dao, schedule);
    }

    @Test
    void listsOnlyOwnedWorkerHistoryWithTrimmedLoginAndBothFilters() {
        Incident previous = incident(WORKER, "OPEN", "saved");
        when(dao.ownsWorker(OFFICE, WORKER)).thenReturn(true);
        when(dao.list(OFFICE, WORKER, WORK_DATE)).thenReturn(List.of(previous));

        assertThat(service.list("  " + LOGIN_ID + "  ", WORKER, WORK_DATE).incidents())
            .containsExactly(previous);

        verify(attendance).findAccountContext(LOGIN_ID);
        verify(dao).ownsWorker(OFFICE, WORKER);
        verify(dao).list(OFFICE, WORKER, WORK_DATE);
        assertNoMutation();
    }

    @Test
    void rejectsWorkerFromAnotherOfficeBeforeListingHistory() {
        when(dao.ownsWorker(OFFICE, WORKER)).thenReturn(false);

        assertThatThrownBy(() -> service.list(LOGIN_ID, WORKER, WORK_DATE))
            .isInstanceOf(NoShowException.class).hasMessage(MISSING);

        verify(dao, never()).list(any(), any(), any());
        assertNoMutation();
    }

    @Test
    void listsDateWithoutWorkerOwnershipLookupIncludingGuests() {
        Incident guest = incident(null, "OPEN", null);
        when(dao.list(OFFICE, null, WORK_DATE)).thenReturn(List.of(guest));

        assertThat(service.list(LOGIN_ID, null, WORK_DATE).incidents()).containsExactly(guest);

        verify(dao, never()).ownsWorker(any(), any());
        verify(dao).list(OFFICE, null, WORK_DATE);
        assertNoMutation();
    }

    @Test
    void requiresWorkerOrDateForHistoryLookup() {
        assertThatThrownBy(() -> service.list(LOGIN_ID, null, null))
            .isInstanceOf(NoShowException.class).hasMessage("작업자 또는 조회 날짜를 선택해 주세요.");

        verifyNoInteractions(dao, schedule);
    }

    @Test
    void rejectsMissingCreateBodyOrAssignmentBeforeReadingAccounts() {
        assertThatThrownBy(() -> service.create(LOGIN_ID, null))
            .isInstanceOf(NoShowException.class).hasMessage(MISSING);
        assertThatThrownBy(() -> service.create(LOGIN_ID, new Create(null, null)))
            .isInstanceOf(NoShowException.class).hasMessage(MISSING);

        verifyNoInteractions(dao, attendance, schedule);
    }

    @Test
    void rejectsForeignAssignmentUsingCurrentOfficeScopeWithoutWriting() {
        when(dao.lockAssignment(OFFICE, ASSIGNMENT)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.create(LOGIN_ID, new Create(ASSIGNMENT, null)))
            .isInstanceOf(NoShowException.class).hasMessage(MISSING);

        verify(dao).lockOffice(OFFICE);
        verify(dao).lockAssignment(OFFICE, ASSIGNMENT);
        verify(dao, never()).byAssignment(any(), any());
        assertNoMutation();
    }

    @Test
    void rejectsForeignWorkerEvenWhenAssignmentWasFoundInCurrentOffice() {
        when(dao.lockAssignment(OFFICE, ASSIGNMENT))
            .thenReturn(Optional.of(assignment(WORKER, "PLANNED")));
        when(dao.ownsWorker(OFFICE, WORKER)).thenReturn(false);

        assertThatThrownBy(() -> service.create(LOGIN_ID, new Create(ASSIGNMENT, null)))
            .isInstanceOf(NoShowException.class).hasMessage(MISSING);

        verify(dao).ownsWorker(OFFICE, WORKER);
        verify(dao, never()).byAssignment(any(), any());
        assertNoMutation();
    }

    @ParameterizedTest
    @ValueSource(strings = {"update", "cancel"})
    void rejectsForeignIncidentBeforeChangingNoteOrCancelling(String operation) {
        when(dao.find(OFFICE, INCIDENT)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> invokeMutation(operation, "reason"))
            .isInstanceOf(NoShowException.class).hasMessage(MISSING);

        verify(dao).lockOffice(OFFICE);
        verify(dao).find(OFFICE, INCIDENT);
        verify(dao, never()).lockAssignment(any(), any());
        assertNoMutation();
    }

    @Test
    void rejectsFutureAssignmentUsingSeoulBusinessDateBeforeCheckingPriorIncident() {
        Assignment future = new Assignment(ASSIGNMENT, DAY, WORKER,
            LocalDate.now(ZoneId.of("Asia/Seoul")).plusDays(2), "PLANNED", null);
        when(dao.lockAssignment(OFFICE, ASSIGNMENT)).thenReturn(Optional.of(future));

        assertThatThrownBy(() -> service.create(LOGIN_ID, new Create(ASSIGNMENT, "reason")))
            .isInstanceOf(NoShowException.class).hasMessage("미래 날짜에는 노쇼를 기록할 수 없습니다.");

        verify(dao, never()).byAssignment(any(), any());
        assertNoMutation();
    }

    @ParameterizedTest
    @ValueSource(strings = {"PLANNED", "WORKED", "ABSENT"})
    void createsForSupportedAssignmentStatusesAndTrimsToInclusiveThousandCharacterLimit(String status) {
        String note = "n".repeat(1000);
        Assignment assignment = assignment(WORKER, status);
        Incident saved = stubCreation(assignment, note);

        assertThat(service.create(LOGIN_ID, new Create(ASSIGNMENT, "  " + note + "\n")))
            .isSameAs(saved);

        var order = inOrder(dao, attendance);
        order.verify(attendance).findAccountContext(LOGIN_ID);
        order.verify(dao).lockOffice(OFFICE);
        order.verify(dao).lockAssignment(OFFICE, ASSIGNMENT);
        order.verify(dao).ownsWorker(OFFICE, WORKER);
        order.verify(dao).byAssignment(OFFICE, ASSIGNMENT);
        order.verify(dao).create(OFFICE, ACCOUNT, assignment, note);
        order.verify(dao).markAbsent(OFFICE, ACCOUNT, assignment);
        order.verify(dao).revision(ACCOUNT, INCIDENT, "CREATED", note);
        order.verify(attendance).refreshWorkerActivitySummary(OFFICE);
        order.verify(dao).find(OFFICE, INCIDENT);
        verifyNoInteractions(schedule);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"  \t\n"})
    void normalizesMissingOrBlankCreateNoteToNull(String note) {
        Assignment assignment = assignment(WORKER, "PLANNED");
        Incident saved = stubCreation(assignment, null);

        assertThat(service.create(LOGIN_ID, new Create(ASSIGNMENT, note))).isSameAs(saved);

        verify(dao).create(OFFICE, ACCOUNT, assignment, null);
        verify(dao).revision(ACCOUNT, INCIDENT, "CREATED", null);
    }

    @ParameterizedTest
    @ValueSource(strings = {"create", "update", "cancel"})
    void rejectsMoreThanThousandNormalizedCharactersBeforeAnyOfficeAccess(String operation) {
        assertThatThrownBy(() -> invokeMutation(operation, " " + "n".repeat(1001) + " "))
            .isInstanceOf(NoShowException.class).hasMessage("메모와 사유는 1000자 이내로 입력해 주세요.");

        verifyNoInteractions(dao, attendance, schedule);
    }

    @ParameterizedTest
    @ValueSource(strings = {"CANCELLED", "REPLACED"})
    void rejectsNewIncidentForCancelledOrReplacedAssignment(String status) {
        when(dao.lockAssignment(OFFICE, ASSIGNMENT)).thenReturn(Optional.of(assignment(WORKER, status)));

        assertThatThrownBy(() -> service.create(LOGIN_ID, new Create(ASSIGNMENT, null)))
            .isInstanceOf(NoShowException.class)
            .hasMessage("취소되었거나 대체된 배정에는 노쇼를 새로 기록할 수 없습니다.");

        assertNoMutation();
    }

    @ParameterizedTest
    @ValueSource(strings = {"OPEN", "REPLACED"})
    void repeatedActiveMarkReturnsExistingIncidentWithoutSecondWrite(String status) {
        Incident previous = incident(WORKER, status, "original note");
        when(dao.lockAssignment(OFFICE, ASSIGNMENT))
            .thenReturn(Optional.of(assignment(WORKER, "REPLACED")));
        when(dao.byAssignment(OFFICE, ASSIGNMENT)).thenReturn(Optional.of(previous));

        assertThat(service.create(LOGIN_ID, new Create(ASSIGNMENT, "different note"))).isSameAs(previous);
        assertThat(service.create(LOGIN_ID, new Create(ASSIGNMENT, null))).isSameAs(previous);

        verify(dao, times(2)).lockOffice(OFFICE);
        verify(dao, times(2)).byAssignment(OFFICE, ASSIGNMENT);
        assertNoMutation();
    }

    @Test
    void initialMarkThenRetryCreatesAndMarksAbsentOnlyOnce() {
        Assignment assignment = assignment(WORKER, "PLANNED");
        Incident saved = stubCreation(assignment, "original note");
        when(dao.byAssignment(OFFICE, ASSIGNMENT)).thenReturn(Optional.empty(), Optional.of(saved));

        assertThat(service.create(LOGIN_ID, new Create(ASSIGNMENT, "original note"))).isSameAs(saved);
        assertThat(service.create(LOGIN_ID, new Create(ASSIGNMENT, "retry note"))).isSameAs(saved);

        verify(dao).create(OFFICE, ACCOUNT, assignment, "original note");
        verify(dao, times(1)).create(any(), any(), any(), any());
        verify(dao, times(1)).markAbsent(any(), any(), any());
        verify(dao).revision(ACCOUNT, INCIDENT, "CREATED", "original note");
        verify(dao, times(1)).revision(any(), any(), any(), any());
        verify(dao, never()).updateNote(any(), any(), any());
        verify(attendance, times(1)).refreshWorkerActivitySummary(OFFICE);
        verifyNoInteractions(schedule);
    }

    @Test
    void reopensCancelledIncidentThroughCreateAndRecordsNewRevision() {
        Assignment assignment = assignment(WORKER, "PLANNED");
        Incident saved = stubCreation(assignment, "reopened");
        when(dao.byAssignment(OFFICE, ASSIGNMENT))
            .thenReturn(Optional.of(incident(WORKER, "CANCELLED", "previous")));

        assertThat(service.create(LOGIN_ID, new Create(ASSIGNMENT, " reopened "))).isSameAs(saved);

        verify(dao).create(OFFICE, ACCOUNT, assignment, "reopened");
        verify(dao).markAbsent(OFFICE, ACCOUNT, assignment);
        verify(dao).revision(ACCOUNT, INCIDENT, "CREATED", "reopened");
        verify(attendance).refreshWorkerActivitySummary(OFFICE);
    }

    @Test
    void createsGuestIncidentWithoutWorkerProfile() {
        Assignment guest = assignment(null, "PLANNED");
        Incident saved = stubCreation(guest, "guest note");

        assertThat(service.create(LOGIN_ID, new Create(ASSIGNMENT, "guest note"))).isSameAs(saved);
        assertThat(saved.workerProfileUuid()).isNull();
        verify(dao).create(OFFICE, ACCOUNT, guest, "guest note");
        verify(dao).markAbsent(OFFICE, ACCOUNT, guest);
        verify(dao, never()).ownsWorker(any(), any());
    }

    @Test
    void updatesChangedNoteWithTrimmedThousandCharacterValueAndAccountRevision() {
        String note = "n".repeat(1000);
        Incident previous = incident(WORKER, "OPEN", "old");
        Incident saved = incident(WORKER, "OPEN", note);
        when(dao.find(OFFICE, INCIDENT)).thenReturn(Optional.of(previous), Optional.of(saved));

        assertThat(service.update(LOGIN_ID, INCIDENT, new Update(" " + note + " "))).isSameAs(saved);

        verify(dao).updateNote(OFFICE, INCIDENT, note);
        verify(dao).revision(ACCOUNT, INCIDENT, "NOTE_UPDATED", note);
        verify(attendance, never()).refreshWorkerActivitySummary(any());
        verifyNoInteractions(schedule);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"  \t\n"})
    void clearsExistingNoteToNullAndRecordsRevision(String note) {
        when(dao.find(OFFICE, INCIDENT)).thenReturn(
            Optional.of(incident(WORKER, "OPEN", "old")), Optional.of(incident(WORKER, "OPEN", null)));

        assertThat(service.update(LOGIN_ID, INCIDENT, new Update(note)).note()).isNull();

        verify(dao).updateNote(OFFICE, INCIDENT, null);
        verify(dao).revision(ACCOUNT, INCIDENT, "NOTE_UPDATED", null);
    }

    @Test
    void unchangedTrimmedNoteDoesNotWriteOrAppendRevision() {
        Incident previous = incident(WORKER, "OPEN", "unchanged");
        when(dao.find(OFFICE, INCIDENT)).thenReturn(Optional.of(previous));

        assertThat(service.update(LOGIN_ID, INCIDENT, new Update("  unchanged\n"))).isSameAs(previous);

        verify(dao, times(1)).find(OFFICE, INCIDENT);
        assertNoMutation();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"  \t\n"})
    void unchangedNullNoteDoesNotAppendRevision(String note) {
        Incident previous = incident(WORKER, "OPEN", null);
        when(dao.find(OFFICE, INCIDENT)).thenReturn(Optional.of(previous));

        assertThat(service.update(LOGIN_ID, INCIDENT, new Update(note))).isSameAs(previous);

        assertNoMutation();
    }

    @Test
    void rejectsMissingUpdateBodyBeforeOfficeAccess() {
        assertThatThrownBy(() -> service.update(LOGIN_ID, INCIDENT, null))
            .isInstanceOf(NoShowException.class).hasMessage("메모를 확인해 주세요.");

        verifyNoInteractions(dao, attendance, schedule);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"  \t\n"})
    void requiresNonblankCancellationReasonBeforeOfficeAccess(String reason) {
        assertThatThrownBy(() -> service.cancel(LOGIN_ID, INCIDENT, new Cancel(reason)))
            .isInstanceOf(NoShowException.class).hasMessage("노쇼 취소 사유를 입력해 주세요.");

        verifyNoInteractions(dao, attendance, schedule);
    }

    @Test
    void rejectsMissingCancellationBodyBeforeOfficeAccess() {
        assertThatThrownBy(() -> service.cancel(LOGIN_ID, INCIDENT, null))
            .isInstanceOf(NoShowException.class).hasMessage("노쇼 취소 사유를 입력해 주세요.");

        verifyNoInteractions(dao, attendance, schedule);
    }

    @Test
    void cancelsUsingOwnedAssignmentThenRecordsTrimmedReasonAndRefreshesSummary() {
        String reason = "r".repeat(1000);
        Incident previous = incident(WORKER, "REPLACED", "original note");
        Incident cancelled = incident(WORKER, "CANCELLED", "original note");
        when(dao.find(OFFICE, INCIDENT)).thenReturn(Optional.of(previous), Optional.of(cancelled));
        when(dao.lockAssignment(OFFICE, ASSIGNMENT))
            .thenReturn(Optional.of(assignment(WORKER, "REPLACED")));

        assertThat(service.cancel(LOGIN_ID, INCIDENT, new Cancel(" " + reason + "\n"))).isSameAs(cancelled);

        var order = inOrder(dao, schedule, attendance);
        order.verify(attendance).findAccountContext(LOGIN_ID);
        order.verify(dao).lockOffice(OFFICE);
        order.verify(dao).find(OFFICE, INCIDENT);
        order.verify(dao).lockAssignment(OFFICE, ASSIGNMENT);
        order.verify(schedule).cancelNoShow(LOGIN_ID, DAY, ASSIGNMENT, WORK_DATE);
        order.verify(dao).revision(ACCOUNT, INCIDENT, "CANCELLED", reason);
        order.verify(attendance).refreshWorkerActivitySummary(OFFICE);
        order.verify(dao).find(OFFICE, INCIDENT);
    }

    @Test
    void cannotCancelIfOriginalAssignmentIsOutsideOfficeOrMissing() {
        when(dao.find(OFFICE, INCIDENT)).thenReturn(Optional.of(incident(WORKER, "OPEN", null)));
        when(dao.lockAssignment(OFFICE, ASSIGNMENT)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.cancel(LOGIN_ID, INCIDENT, new Cancel("reason")))
            .isInstanceOf(NoShowException.class).hasMessage(MISSING);

        assertNoMutation();
    }

    @Test
    void translatesScheduleCancellationValidationIntoSafeMessageWithoutFollowingWrites() {
        stubCancellable();
        when(schedule.cancelNoShow(LOGIN_ID, DAY, ASSIGNMENT, WORK_DATE))
            .thenThrow(new IllegalArgumentException("SQL private worker phone 010-0000-1234"));

        assertThatThrownBy(() -> service.cancel(LOGIN_ID, INCIDENT, new Cancel("reason")))
            .isInstanceOf(NoShowException.class)
            .hasMessage("노쇼를 취소하지 못했습니다. 대체자의 근태 확정 여부와 원배정 상태를 확인해 주세요.");

        verify(schedule).cancelNoShow(LOGIN_ID, DAY, ASSIGNMENT, WORK_DATE);
        assertNoCancellationFollowUp();
    }

    @Test
    void propagatesUnexpectedCancellationFailureWithoutFollowingWrites() {
        stubCancellable();
        IllegalStateException failure = new IllegalStateException("simulated cancellation storage failure");
        when(schedule.cancelNoShow(LOGIN_ID, DAY, ASSIGNMENT, WORK_DATE)).thenThrow(failure);

        assertThatThrownBy(() -> service.cancel(LOGIN_ID, INCIDENT, new Cancel("reason"))).isSameAs(failure);

        assertNoCancellationFollowUp();
    }

    @Test
    void propagatesRevisionFailureAfterCancellationWithoutReportingSuccess() {
        stubCancellable();
        IllegalStateException failure = new IllegalStateException("simulated revision storage failure");
        doThrow(failure).when(dao).revision(ACCOUNT, INCIDENT, "CANCELLED", "reason");

        // Direct mock invocation checks propagation only, not database transaction rollback.
        assertThatThrownBy(() -> service.cancel(LOGIN_ID, INCIDENT, new Cancel("reason"))).isSameAs(failure);

        verify(schedule).cancelNoShow(LOGIN_ID, DAY, ASSIGNMENT, WORK_DATE);
        verify(dao).revision(ACCOUNT, INCIDENT, "CANCELLED", "reason");
        verify(attendance, never()).refreshWorkerActivitySummary(any());
        verify(dao, times(1)).find(OFFICE, INCIDENT);
    }

    @Test
    void repeatedCancellationOfCancelledIncidentDoesNotPerformSecondAction() {
        Incident previous = incident(WORKER, "CANCELLED", "saved note");
        when(dao.find(OFFICE, INCIDENT)).thenReturn(Optional.of(previous));

        assertThat(service.cancel(LOGIN_ID, INCIDENT, new Cancel("first reason"))).isSameAs(previous);
        assertThat(service.cancel(LOGIN_ID, INCIDENT, new Cancel("second reason"))).isSameAs(previous);

        verify(dao, times(2)).find(OFFICE, INCIDENT);
        verify(dao, never()).lockAssignment(any(), any());
        assertNoMutation();
    }

    private Incident invokeMutation(String operation, String note) {
        return switch (operation) {
            case "create" -> service.create(LOGIN_ID, new Create(ASSIGNMENT, note));
            case "update" -> service.update(LOGIN_ID, INCIDENT, new Update(note));
            case "cancel" -> service.cancel(LOGIN_ID, INCIDENT, new Cancel(note));
            default -> throw new AssertionError("Unknown test operation: " + operation);
        };
    }

    private Assignment assignment(UUID worker, String status) {
        return new Assignment(ASSIGNMENT, DAY, worker, WORK_DATE, status, null);
    }

    private Incident incident(UUID worker, String status, String note) {
        return new Incident(INCIDENT, ASSIGNMENT, DAY, WORK_DATE, worker,
            worker == null ? "Guest" : "Sample worker", "Sample client", "Sample site", "Harvest",
            status, note, null, null, null, CREATED_AT, CREATED_AT,
            "CANCELLED".equals(status) ? CREATED_AT : null, List.of());
    }

    private Incident stubCreation(Assignment assignment, String note) {
        Incident saved = incident(assignment.workerProfileUuid(), "OPEN", note);
        when(dao.lockAssignment(OFFICE, ASSIGNMENT)).thenReturn(Optional.of(assignment));
        when(dao.byAssignment(OFFICE, ASSIGNMENT)).thenReturn(Optional.empty());
        when(dao.create(OFFICE, ACCOUNT, assignment, note)).thenReturn(INCIDENT);
        when(dao.find(OFFICE, INCIDENT)).thenReturn(Optional.of(saved));
        return saved;
    }

    private void stubCancellable() {
        when(dao.find(OFFICE, INCIDENT)).thenReturn(Optional.of(incident(WORKER, "OPEN", null)));
        when(dao.lockAssignment(OFFICE, ASSIGNMENT))
            .thenReturn(Optional.of(assignment(WORKER, "ABSENT")));
    }

    private void assertNoCancellationFollowUp() {
        verify(dao, never()).revision(any(), any(), any(), any());
        verify(attendance, never()).refreshWorkerActivitySummary(any());
        verify(dao, times(1)).find(OFFICE, INCIDENT);
    }

    private void assertNoMutation() {
        verify(dao, never()).create(any(), any(), any(), any());
        verify(dao, never()).markAbsent(any(), any(), any());
        verify(dao, never()).updateNote(any(), any(), any());
        verify(dao, never()).revision(any(), any(), any(), any());
        verify(attendance, never()).refreshWorkerActivitySummary(any());
        verifyNoInteractions(schedule);
    }
}
