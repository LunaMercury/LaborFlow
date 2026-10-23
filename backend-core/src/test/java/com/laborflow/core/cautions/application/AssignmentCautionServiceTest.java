package com.laborflow.core.cautions.application;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.laborflow.core.cautions.dao.AssignmentCautionDao;
import com.laborflow.core.cautions.dto.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class AssignmentCautionServiceTest {
    private final AssignmentCautionDao dao = mock(AssignmentCautionDao.class);
    private final AssignmentCautionService service = new AssignmentCautionService(dao);
    private final UUID office = UUID.fromString("10000000-0000-4000-8000-000000000001");
    private final UUID account = UUID.fromString("10000000-0000-4000-8000-000000000002");
    private final UUID worker = UUID.fromString("20000000-0000-4000-8000-000000000001");
    private final UUID client = UUID.fromString("30000000-0000-4000-8000-000000000001");
    private final UUID farm = UUID.fromString("40000000-0000-4000-8000-000000000001");
    private final UUID rule = UUID.fromString("50000000-0000-4000-8000-000000000001");
    private final Instant version = Instant.parse("2026-10-11T01:02:03.123456Z");
    private AssignmentCautionResponse caution(String requester, String memo) {
        return new AssignmentCautionResponse(rule, worker, client, farm, "가상 작업자", "가상 농가", requester, memo, version, version, account, account);
    }
    @BeforeEach void setup() {
        when(dao.findActor("sample")).thenReturn(Optional.of(new AssignmentCautionDao.Actor(office, account)));
        when(dao.workerBelongsToOffice(office, worker)).thenReturn(true);
        when(dao.clientBelongsToOffice(office, client)).thenReturn(true);
    }

    @ParameterizedTest @ValueSource(strings = {"CLIENT", "WORKER", "BOTH"})
    void acceptsThreeRequestersAndEmptyOptionalMemo(String requester) {
        when(dao.create(office, account, worker, client, requester, null)).thenReturn(rule);
        when(dao.findActive(office, worker, client, null, false)).thenReturn(List.of(caution(requester, null)));
        var result = service.save("sample", null, new SaveAssignmentCautionRequest(worker, client, requester, " \n "));
        assertThat(result.requestedBy()).isEqualTo(requester);
        assertThat(result.memo()).isNull();
        verify(dao).create(office, account, worker, client, requester, null);
    }

    @Test void workerAndClientViewsReadTheSameRelation() {
        var record = caution("BOTH", "가상 사유\n두 번째 줄");
        when(dao.findActive(office, worker, null, null, false)).thenReturn(List.of(record));
        when(dao.findActive(office, null, client, null, false)).thenReturn(List.of(record));
        assertThat(service.list("sample", worker, null, null)).containsExactly(record);
        assertThat(service.list("sample", null, client, null)).containsExactly(record);
    }

    @Test void rejectsForeignProfilesBeforeWritingAndDoesNotDiscloseReasons() {
        UUID unknown = UUID.fromString("20000000-0000-4000-8000-000000000099");
        assertThatThrownBy(() -> service.save("sample", null, new SaveAssignmentCautionRequest(unknown, client, "CLIENT", "가상 메모")))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.list("sample", null, unknown, null)).isInstanceOf(IllegalArgumentException.class);
        verify(dao, never()).create(any(), any(), any(), any(), anyString(), any());
        verify(dao, never()).findActive(any(), any(), any(), any(), anyBoolean());
    }

    @Test void rejectsInvalidRequesterAndOverlongMemoWithoutWrites() {
        assertThatThrownBy(() -> service.save("sample", null, new SaveAssignmentCautionRequest(worker, client, "BAN", null))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.save("sample", null, new SaveAssignmentCautionRequest(worker, client, "WORKER", "a".repeat(501)))).isInstanceOf(IllegalArgumentException.class);
        verify(dao, never()).create(any(), any(), any(), any(), anyString(), any());
    }

    @Test void updateCannotRetargetAnotherRelationOrAnotherOffice() {
        when(dao.findActive(office, worker, client, null, false)).thenReturn(List.of());
        assertThatThrownBy(() -> service.save("sample", rule, new SaveAssignmentCautionRequest(worker, client, "WORKER", "수정")))
            .isInstanceOf(IllegalArgumentException.class);
        verify(dao, never()).update(any(), any(), any(), anyString(), any());
        assertThatThrownBy(() -> service.release("sample", rule)).isInstanceOf(IllegalArgumentException.class);
        verify(dao).release(office, account, rule);
    }

    @Test void pendingCautionRejectsMissingOrStaleConfirmationAndPreservesDetails() {
        when(dao.findActive(office, null, null, farm, true)).thenReturn(List.of(caution("WORKER", "희망하지 않음")));
        assertThatThrownBy(() -> service.validatePlacement("sample", farm, List.of(worker), List.of()))
            .isInstanceOfSatisfying(AssignmentCautionConflictException.class, error -> assertThat(error.getConflicts()).containsExactly(caution("WORKER", "희망하지 않음")));
        assertThatThrownBy(() -> service.validatePlacement("sample", farm, List.of(worker), List.of(new CautionAcknowledgement(rule, version.minusSeconds(1)))))
            .isInstanceOf(AssignmentCautionConflictException.class);
        verify(dao, never()).recordAcknowledgement(any(), any(), any(), any(), anyString());
    }

    @Test void acknowledgementDoesNotReleaseRelationshipOrGrantFuturePermission() {
        var record = caution("CLIENT", null);
        when(dao.findActive(office, null, null, farm, true)).thenReturn(List.of(record));
        var accepted = service.validatePlacement("sample", farm, List.of(worker), List.of(new CautionAcknowledgement(rule, version)));
        assertThat(accepted).containsExactly(record);
        UUID day = UUID.fromString("60000000-0000-4000-8000-000000000001");
        service.record("sample", day, accepted, "ASSIGNMENT_SAVE");
        verify(dao).recordAcknowledgement(office, account, day, record, "ASSIGNMENT_SAVE");
        verify(dao, never()).release(any(), any(), any());
        assertThatThrownBy(() -> service.validatePlacement("sample", farm, List.of(worker), List.of())).isInstanceOf(AssignmentCautionConflictException.class);
    }

    @Test void otherClientOrWorkerDoesNotRaiseAnUnrelatedWarning() {
        when(dao.findActive(office, null, null, farm, true)).thenReturn(List.of(caution("BOTH", null)));
        UUID otherWorker = UUID.fromString("20000000-0000-4000-8000-000000000002");
        when(dao.workerBelongsToOffice(office, otherWorker)).thenReturn(true);
        assertThat(service.validatePlacement("sample", farm, List.of(otherWorker), List.of())).isEmpty();
        UUID otherFarm = UUID.fromString("40000000-0000-4000-8000-000000000002");
        when(dao.findActive(office, null, null, otherFarm, true)).thenReturn(List.of());
        assertThat(service.validatePlacement("sample", otherFarm, List.of(worker), List.of())).isEmpty();
    }

    @Test void emptyWorkerDraftKeepsAllExistingRelationsWithoutEvenReadingThem() {
        service.applyWorkerChanges("sample", worker, null);
        service.applyWorkerChanges("sample", worker, List.of());
        verifyNoInteractions(dao);
    }

    @Test void workerDraftUpdatesOnlyListedRelationsAndReleasesWithTheCurrentActor() {
        when(dao.findActive(office, worker, null, null, false)).thenReturn(List.of(caution("CLIENT", null)));
        when(dao.update(office, account, rule, "BOTH", "가상 수정")).thenReturn(true);
        service.applyWorkerChanges("sample", worker, List.of(new WorkerAssignmentCautionChangeRequest(rule, client, "BOTH", " 가상 수정 ", false)));
        verify(dao).update(office, account, rule, "BOTH", "가상 수정");
        verify(dao, never()).release(any(), any(), any());
        when(dao.release(office, account, rule)).thenReturn(true);
        service.applyWorkerChanges("sample", worker, List.of(new WorkerAssignmentCautionChangeRequest(rule, client, null, null, true)));
        verify(dao).release(office, account, rule);
    }

    @Test void workerDraftCreatesAnOptionalBlankMemoWithoutChangingOtherRelations() {
        service.applyWorkerChanges("sample", worker, List.of(new WorkerAssignmentCautionChangeRequest(null, client, "WORKER", " \n ", false)));
        verify(dao).create(office, account, worker, client, "WORKER", null);
        verify(dao, never()).release(any(), any(), any());
        verify(dao, never()).update(any(), any(), any(), any(), any());
    }

    @Test void forgedReleaseCannotRemoveAnotherWorkersRelationEvenInTheSameOffice() {
        when(dao.findActive(office, worker, null, null, false)).thenReturn(List.of());
        assertThatThrownBy(() -> service.applyWorkerChanges("sample", worker,
            List.of(new WorkerAssignmentCautionChangeRequest(rule, client, null, null, true))))
            .isInstanceOf(IllegalArgumentException.class);
        verify(dao, never()).release(any(), any(), any());
    }

    @Test void draftRejectsForeignClientsAndDuplicatesBeforeAnyWrite() {
        var valid = new WorkerAssignmentCautionChangeRequest(null, client, "CLIENT", null, false);
        var foreign = new WorkerAssignmentCautionChangeRequest(null, UUID.randomUUID(), "CLIENT", null, false);
        assertThatThrownBy(() -> service.applyWorkerChanges("sample", worker, List.of(valid, foreign)))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.applyWorkerChanges("sample", worker, List.of(valid, valid)))
            .isInstanceOf(IllegalArgumentException.class);
        verify(dao, never()).create(any(), any(), any(), any(), any(), any());
    }

    @Test void draftRejectsInvalidFieldsAndAnUnidentifiedReleaseWithoutWrites() {
        for (var invalid : List.of(
            new WorkerAssignmentCautionChangeRequest(null, client, "BAN", null, false),
            new WorkerAssignmentCautionChangeRequest(null, client, "CLIENT", "가".repeat(501), false),
            new WorkerAssignmentCautionChangeRequest(null, client, null, null, true))) {
            assertThatThrownBy(() -> service.applyWorkerChanges("sample", worker, List.of(invalid)))
                .isInstanceOf(IllegalArgumentException.class);
        }
        verify(dao, never()).create(any(), any(), any(), any(), any(), any());
        verify(dao, never()).release(any(), any(), any());
    }
}
