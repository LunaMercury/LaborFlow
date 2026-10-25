package com.laborflow.core.schedule.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.laborflow.core.clients.application.ClientsService;
import com.laborflow.core.clients.dto.ClientWorkSiteResponse;
import com.laborflow.core.schedule.dao.ScheduleDao;
import com.laborflow.core.schedule.dto.ScheduleAssignmentRequest;
import com.laborflow.core.schedule.dto.AssignmentHistoryEntry;
import com.laborflow.core.schedule.dto.ScheduleTaskResponse;
import com.laborflow.core.schedule.dto.UpdateScheduleTaskRequest;
import com.laborflow.core.schedule.dto.UpdateScheduleTaskRangeRequest;
import com.laborflow.core.workforce.application.WorkerSeparationConflictException;
import com.laborflow.core.workforce.application.WorkforceService;
import com.laborflow.core.workforce.dto.WorkerSeparationRuleResponse;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

class ScheduleServiceTest {
    private final ScheduleDao scheduleDao = mock(ScheduleDao.class);
    private final ClientsService clientsService = mock(ClientsService.class);
    private final WorkforceService workforceService = mock(WorkforceService.class);
    private final com.laborflow.core.cautions.application.AssignmentCautionService cautionService = mock(com.laborflow.core.cautions.application.AssignmentCautionService.class);
    private final ScheduleService service = new ScheduleService(
        scheduleDao,
        clientsService,
        workforceService,
        cautionService
    );

    private final UUID agencyOwnerUuid = UUID.randomUUID();
    private final UUID clientWorkSiteUuid = UUID.randomUUID();
    private final UUID ownerUuid = UUID.randomUUID();
    private final UUID scheduleDayUuid = UUID.randomUUID();
    private final UUID workerAUuid = UUID.randomUUID();
    private final UUID workerBUuid = UUID.randomUUID();
    private final LocalDate workDate = LocalDate.of(2026, 8, 31);

    @BeforeEach
    void setUp() {
        when(scheduleDao.findAgencyOwnerUuidByLoginId("test"))
            .thenReturn(Optional.of(agencyOwnerUuid));
        when(scheduleDao.scheduleDayBelongsToAgencyOwner(agencyOwnerUuid, scheduleDayUuid))
            .thenReturn(true);
        when(scheduleDao.farmOwnerBelongsToAgencyOwner(agencyOwnerUuid, ownerUuid))
            .thenReturn(true);
        when(scheduleDao.workerProfileBelongsToAgencyOwner(agencyOwnerUuid, workerAUuid))
            .thenReturn(true);
        when(scheduleDao.workerProfileBelongsToAgencyOwner(agencyOwnerUuid, workerBUuid))
            .thenReturn(true);
        when(clientsService.resolveWorkSite(
            "test",
            ownerUuid,
            clientWorkSiteUuid,
            "동문 농장",
            "동문로 1",
            ""
        )).thenReturn(new ClientWorkSiteResponse(clientWorkSiteUuid, "동문 농장", "동문로 1", ""));
        when(scheduleDao.findNearbyAssignedWorkerProfileUuids(
            agencyOwnerUuid,
            scheduleDayUuid,
            workDate,
            ownerUuid,
            clientWorkSiteUuid,
            "동문로 1",
            LocalTime.of(7, 0),
            LocalTime.of(17, 0)
        )).thenReturn(List.of());
    }

    @Test
    void returnsAssignmentHistoryUsingTheOwnedTargetAndExclusiveCursor() {
        ScheduleTaskResponse target = savedTask();
        LocalDate cursor = workDate.minusDays(10);
        AssignmentHistoryEntry entry = new AssignmentHistoryEntry(
            cursor.minusDays(1), UUID.randomUUID(), "마늘 뽑기", "동문 농장", 2
        );
        when(scheduleDao.findTask(agencyOwnerUuid, scheduleDayUuid, workDate))
            .thenReturn(Optional.of(target));
        when(scheduleDao.findAssignmentHistory(
            agencyOwnerUuid, target.workSiteId(), ownerUuid, "마늘 뽑기", cursor, 31
        )).thenReturn(List.of(entry));

        var result = service.getAssignmentHistory("test", scheduleDayUuid, workDate, cursor);

        assertThat(result.entries()).containsExactly(entry);
        assertThat(result.nextBeforeDate()).isNull();
        verify(scheduleDao, never()).replaceAssignments(
            org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), anyList()
        );
    }

    @Test
    void limitsHistoryToThirtyDatesAndProvidesAnExclusiveNextCursor() {
        ScheduleTaskResponse target = savedTask();
        var entries = IntStream.rangeClosed(1, 31)
            .mapToObj(day -> new AssignmentHistoryEntry(
                workDate.minusDays(day), UUID.randomUUID(), "마늘 뽑기", "동문 농장", 1
            )).toList();
        when(scheduleDao.findTask(agencyOwnerUuid, scheduleDayUuid, workDate))
            .thenReturn(Optional.of(target));
        when(scheduleDao.findAssignmentHistory(
            agencyOwnerUuid, target.workSiteId(), ownerUuid, "마늘 뽑기", workDate, 31
        )).thenReturn(entries);

        var result = service.getAssignmentHistory("test", scheduleDayUuid, workDate, null);

        assertThat(result.entries()).hasSize(30);
        assertThat(result.entries().getFirst().workDate()).isEqualTo(LocalDate.of(2026, 8, 30));
        assertThat(result.nextBeforeDate()).isEqualTo(LocalDate.of(2026, 8, 1));
    }

    @Test
    void rejectsUnknownOrOtherAgencyTargetBeforeReadingHistory() {
        when(scheduleDao.findTask(agencyOwnerUuid, scheduleDayUuid, workDate))
            .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getAssignmentHistory("test", scheduleDayUuid, workDate, null))
            .isInstanceOf(IllegalArgumentException.class);
        verify(scheduleDao, never()).findAssignmentHistory(
            org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyInt()
        );
    }

    @Test
    void rejectsCursorAfterTheTargetWorkDate() {
        when(scheduleDao.findTask(agencyOwnerUuid, scheduleDayUuid, workDate))
            .thenReturn(Optional.of(savedTask()));
        assertThatThrownBy(() -> service.getAssignmentHistory(
            "test", scheduleDayUuid, workDate, workDate.plusDays(1)
        )).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void blocksAssignmentWriteUntilConflictIsAcknowledged() {
        WorkerSeparationRuleResponse conflict = separationConflict();
        when(workforceService.findAssignmentSeparationConflicts(
            "test",
            List.of(workerAUuid, workerBUuid),
            List.of()
        )).thenReturn(List.of(conflict));

        assertThatThrownBy(() -> service.updateTask(
            "test",
            scheduleDayUuid,
            workDate,
            request(List.of())
        ))
            .isInstanceOf(WorkerSeparationConflictException.class)
            .satisfies(exception -> assertThat(
                ((WorkerSeparationConflictException) exception).getConflicts()
            ).containsExactly(conflict));

        verify(scheduleDao, never()).replaceAssignments(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any(),
            anyList()
        );
        verify(workforceService, never()).recordAssignmentSeparationOverrides(
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.any(),
            anyList()
        );
    }

    @Test
    void savesAssignmentAndAuditAfterExplicitAcknowledgement() {
        WorkerSeparationRuleResponse conflict = separationConflict();
        ScheduleTaskResponse savedTask = savedTask();
        when(workforceService.findAssignmentSeparationConflicts(
            "test",
            List.of(workerAUuid, workerBUuid),
            List.of()
        )).thenReturn(List.of(conflict));
        when(scheduleDao.findTask(agencyOwnerUuid, scheduleDayUuid, workDate))
            .thenReturn(Optional.of(savedTask));

        ScheduleTaskResponse result = service.updateTask(
            "test",
            scheduleDayUuid,
            workDate,
            request(List.of(conflict.ruleUuid()))
        );

        assertThat(result).isSameAs(savedTask);
        InOrder writeOrder = inOrder(scheduleDao);
        writeOrder.verify(scheduleDao).lockAssignmentSeparationScope(
            agencyOwnerUuid,
            workDate,
            ownerUuid,
            clientWorkSiteUuid,
            "동문로 1"
        );
        writeOrder.verify(scheduleDao).findNearbyAssignedWorkerProfileUuids(
            agencyOwnerUuid,
            scheduleDayUuid,
            workDate,
            ownerUuid,
            clientWorkSiteUuid,
            "동문로 1",
            LocalTime.of(7, 0),
            LocalTime.of(17, 0)
        );
        writeOrder.verify(scheduleDao).replaceAssignments(
            agencyOwnerUuid,
            scheduleDayUuid,
            request(List.of()).assignments()
        );
        verify(workforceService).recordAssignmentSeparationOverrides(
            "test",
            scheduleDayUuid,
            List.of(conflict.ruleUuid())
        );
    }

    @Test
    void updatesScheduleDetailsWithoutRevalidatingOrReplacingAssignments() {
        ScheduleTaskResponse savedTask = savedTask();
        when(scheduleDao.findTask(agencyOwnerUuid, scheduleDayUuid, workDate))
            .thenReturn(Optional.of(savedTask));

        ScheduleTaskResponse result = service.updateTask(
            "test",
            scheduleDayUuid,
            workDate,
            scheduleDetailsOnlyRequest()
        );

        assertThat(result).isSameAs(savedTask);
        verify(scheduleDao, never()).lockAssignmentSeparationScope(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.anyString()
        );
        verify(scheduleDao, never()).findNearbyAssignedWorkerProfileUuids(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any()
        );
        verify(scheduleDao, never()).replaceAssignments(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any(),
            anyList()
        );
        verify(workforceService, never()).findAssignmentSeparationConflicts(
            org.mockito.ArgumentMatchers.anyString(),
            anyList(),
            anyList()
        );
        verify(workforceService, never()).recordAssignmentSeparationOverrides(
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.any(),
            anyList()
        );
    }

    @Test
    void updatesEveryDayInGroupedScheduleBeforeReschedulingRange() {
        UUID secondScheduleDayUuid = UUID.randomUUID();
        when(scheduleDao.scheduleDayBelongsToAgencyOwner(agencyOwnerUuid, secondScheduleDayUuid))
            .thenReturn(true);

        service.updateTaskRange(
            "test",
            new UpdateScheduleTaskRangeRequest(
                List.of(scheduleDayUuid, secondScheduleDayUuid),
                LocalDate.of(2026, 9, 2),
                LocalDate.of(2026, 9, 4),
                ownerUuid,
                "마늘 뽑기",
                clientWorkSiteUuid,
                "동문 농장",
                "동문로 1",
                "",
                LocalTime.of(6, 30),
                LocalTime.of(17, 30),
                1,
                1,
                "",
                List.of("GARLIC_HARVEST")
            )
        );

        verify(scheduleDao).updateTask(
            agencyOwnerUuid,
            scheduleDayUuid,
            ownerUuid,
            clientWorkSiteUuid,
            "마늘 뽑기",
            "동문 농장",
            "동문로 1",
            LocalTime.of(6, 30),
            LocalTime.of(17, 30),
            1,
            1,
            null
        );
        verify(scheduleDao).updateTask(
            agencyOwnerUuid,
            secondScheduleDayUuid,
            ownerUuid,
            clientWorkSiteUuid,
            "마늘 뽑기",
            "동문 농장",
            "동문로 1",
            LocalTime.of(6, 30),
            LocalTime.of(17, 30),
            1,
            1,
            null
        );
        verify(scheduleDao).replaceTaskWorkTypes(
            agencyOwnerUuid,
            scheduleDayUuid,
            List.of("GARLIC_HARVEST")
        );
        verify(scheduleDao).replaceTaskWorkTypes(
            agencyOwnerUuid,
            secondScheduleDayUuid,
            List.of("GARLIC_HARVEST")
        );
        verify(scheduleDao).rescheduleTaskRange(
            agencyOwnerUuid,
            List.of(scheduleDayUuid, secondScheduleDayUuid),
            LocalDate.of(2026, 9, 2),
            LocalDate.of(2026, 9, 4)
        );
        verify(scheduleDao, never()).replaceAssignments(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any(),
            anyList()
        );
    }

    @Test
    void cautionConflictPreventsAssignmentAndTaskWrites() {
        when(scheduleDao.findTask(agencyOwnerUuid, scheduleDayUuid, workDate)).thenReturn(Optional.of(savedTask()));
        when(cautionService.validatePlacement("test", ownerUuid, List.of(workerAUuid, workerBUuid), List.of()))
            .thenThrow(new com.laborflow.core.cautions.application.AssignmentCautionConflictException(List.of()));
        assertThatThrownBy(() -> service.updateTask("test", scheduleDayUuid, workDate, request(List.of())))
            .isInstanceOf(com.laborflow.core.cautions.application.AssignmentCautionConflictException.class);
        verify(scheduleDao, never()).replaceAssignments(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), anyList());
        verify(scheduleDao, never()).replaceTaskWorkTypes(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), anyList());
    }

    @Test
    void transferCautionFailureLeavesBothOriginalAndTargetAssignmentsUntouched() {
        when(scheduleDao.findTask(agencyOwnerUuid, scheduleDayUuid, workDate)).thenReturn(Optional.of(savedTask()));
        when(cautionService.validatePlacement("test", ownerUuid, List.of(workerAUuid, workerBUuid), List.of()))
            .thenThrow(new com.laborflow.core.cautions.application.AssignmentCautionConflictException(List.of()));
        assertThatThrownBy(() -> service.updateTask("test", scheduleDayUuid, workDate, transferRequest()))
            .isInstanceOf(com.laborflow.core.cautions.application.AssignmentCautionConflictException.class);
        verify(scheduleDao, never()).replaceAssignments(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), anyList());
    }

    @Test
    void checkSaveTransfersTheWorkerWithoutChangingSourceDetailsOrHeadcount() {
        UUID sourceUuid = UUID.fromString("70000000-0000-4000-8000-000000000001");
        var source = taskWithAssignments(sourceUuid, List.of(assignment(workerAUuid)));
        when(scheduleDao.findTasks(agencyOwnerUuid, workDate)).thenReturn(List.of(savedTask(), source));
        when(scheduleDao.findTask(agencyOwnerUuid, scheduleDayUuid, workDate)).thenReturn(Optional.of(savedTask()));
        assertThat(service.updateTask("test", scheduleDayUuid, workDate, transferRequest()).id()).isEqualTo(scheduleDayUuid);
        verify(scheduleDao).replaceAssignments(agencyOwnerUuid, scheduleDayUuid, transferRequest().assignments());
        verify(scheduleDao).removeTransferredAssignments(agencyOwnerUuid, scheduleDayUuid, workDate, List.of(workerAUuid));
        verify(scheduleDao, never()).replaceAssignments(org.mockito.ArgumentMatchers.eq(agencyOwnerUuid), org.mockito.ArgumentMatchers.eq(sourceUuid), anyList());
        assertThat(source.title()).isEqualTo("마늘 뽑기");
    }

    @Test
    void transferPreservesTheExistingWorkerSeparationGate() {
        when(workforceService.findAssignmentSeparationConflicts("test", List.of(workerAUuid, workerBUuid), List.of())).thenReturn(List.of(separationConflict()));
        assertThatThrownBy(() -> service.updateTask("test", scheduleDayUuid, workDate, transferRequest()))
            .isInstanceOf(WorkerSeparationConflictException.class);
        verify(scheduleDao, never()).replaceAssignments(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), anyList());
    }

    @Test void existingWorkersDoNotRequireRepeatCautionConfirmationForOtherEdits() {
        when(scheduleDao.findTask(agencyOwnerUuid, scheduleDayUuid, workDate))
            .thenReturn(Optional.of(taskWithAssignments(scheduleDayUuid, List.of(assignment(workerAUuid), assignment(workerBUuid)))));
        service.updateTask("test", scheduleDayUuid, workDate, request(List.of()));
        verify(cautionService).validatePlacement("test", ownerUuid, List.of(), List.of());
    }

    @Test void transferOfAWorkerMissingFromTheTargetIsRejectedWithoutWrites() {
        var r = request(List.of());
        var invalid = new UpdateScheduleTaskRequest(r.ownerUuid(), r.title(), r.clientWorkSiteUuid(), r.siteName(), r.address(),
            r.siteMemo(), r.startTime(), r.endTime(), r.requiredMen(), r.requiredWomen(), r.memo(), r.workTypeCodes(), r.assignments(),
            List.of(), List.of(), List.of(UUID.fromString("20000000-0000-4000-8000-000000000099")));
        assertThatThrownBy(() -> service.updateTask("test", scheduleDayUuid, workDate, invalid)).isInstanceOf(IllegalArgumentException.class);
        verify(scheduleDao, never()).replaceAssignments(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), anyList());
    }

    private UpdateScheduleTaskRequest transferRequest() {
        var r = request(List.of());
        return new UpdateScheduleTaskRequest(r.ownerUuid(), r.title(), r.clientWorkSiteUuid(), r.siteName(), r.address(), r.siteMemo(),
            r.startTime(), r.endTime(), r.requiredMen(), r.requiredWomen(), r.memo(), r.workTypeCodes(), r.assignments(), List.of(), List.of(), List.of(workerAUuid));
    }

    @Test void noShowAndReplacementChangeCannotWriteBeforeCautionConfirmation() {
        var original = UUID.fromString("60000000-0000-4000-8000-000000000001");
        var account = UUID.fromString("10000000-0000-4000-8000-000000000001");
        var request = new com.laborflow.core.schedule.dto.ReplaceNoShowRequest(original, workerAUuid);
        when(scheduleDao.findAccountUuidByLoginId("test")).thenReturn(Optional.of(account));
        when(scheduleDao.findTask(agencyOwnerUuid, scheduleDayUuid, workDate)).thenReturn(Optional.of(savedTask()));
        when(cautionService.validatePlacement("test", ownerUuid, List.of(workerAUuid), List.of()))
            .thenThrow(new com.laborflow.core.cautions.application.AssignmentCautionConflictException(List.of()));
        assertThatThrownBy(() -> service.replaceNoShow("test", scheduleDayUuid, workDate, request))
            .isInstanceOf(com.laborflow.core.cautions.application.AssignmentCautionConflictException.class);
        assertThatThrownBy(() -> service.changeNoShowReplacement("test", scheduleDayUuid, workDate, request))
            .isInstanceOf(com.laborflow.core.cautions.application.AssignmentCautionConflictException.class);
        verify(scheduleDao, never()).replaceNoShow(agencyOwnerUuid, account, scheduleDayUuid, original, workerAUuid);
        verify(scheduleDao, never()).changeNoShowReplacement(agencyOwnerUuid, account, scheduleDayUuid, original, workerAUuid);
    }

    @Test void cautionAcknowledgementDoesNotBypassForeignScheduleOwnership() {
        when(scheduleDao.scheduleDayBelongsToAgencyOwner(agencyOwnerUuid, scheduleDayUuid)).thenReturn(false);
        assertThatThrownBy(() -> service.updateTask("test", scheduleDayUuid, workDate, transferRequest()))
            .isInstanceOf(IllegalArgumentException.class);
        verify(scheduleDao, never()).replaceAssignments(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), anyList());
        org.mockito.Mockito.verifyNoInteractions(cautionService);
    }

    private com.laborflow.core.schedule.dto.ScheduleAssignmentResponse assignment(UUID worker) {
        return new com.laborflow.core.schedule.dto.ScheduleAssignmentResponse(UUID.randomUUID(), null, worker, "registered", "", "", "men", 1,
            "07:00", "17:00", "planned", "pending", null, null, null, null);
    }

    private ScheduleTaskResponse taskWithAssignments(UUID id, List<com.laborflow.core.schedule.dto.ScheduleAssignmentResponse> assignments) {
        var t = savedTask();
        return new ScheduleTaskResponse(id, t.workSiteId(), t.clientWorkSiteUuid(), t.ownerUuid(), t.title(), t.ownerName(), t.siteName(),
            t.address(), t.siteMemo(), t.timeRange(), t.startTime(), t.endTime(), t.requiredMen(), t.requiredWomen(), t.workTypeCodes(), t.memo(), assignments);
    }

    private UpdateScheduleTaskRequest request(List<UUID> acknowledgedRuleUuids) {
        return new UpdateScheduleTaskRequest(
            ownerUuid,
            "마늘 뽑기",
            clientWorkSiteUuid,
            "동문 농장",
            "동문로 1",
            "",
            LocalTime.of(7, 0),
            LocalTime.of(17, 0),
            1,
            1,
            "",
            List.of(),
            List.of(
                new ScheduleAssignmentRequest(workerAUuid, "men", 1),
                new ScheduleAssignmentRequest(workerBUuid, "women", 1)
            ),
            acknowledgedRuleUuids
        );
    }

    private UpdateScheduleTaskRequest scheduleDetailsOnlyRequest() {
        return new UpdateScheduleTaskRequest(
            ownerUuid,
            "마늘 뽑기",
            clientWorkSiteUuid,
            "동문 농장",
            "동문로 1",
            "",
            LocalTime.of(7, 0),
            LocalTime.of(17, 0),
            1,
            1,
            "",
            List.of(),
            null,
            null
        );
    }

    private WorkerSeparationRuleResponse separationConflict() {
        return new WorkerSeparationRuleResponse(
            UUID.randomUUID(),
            workerAUuid,
            "김철수",
            workerBUuid,
            "박영희",
            "같은 현장 배치 전 확인"
        );
    }

    private ScheduleTaskResponse savedTask() {
        return new ScheduleTaskResponse(
            scheduleDayUuid,
            UUID.randomUUID(),
            clientWorkSiteUuid,
            ownerUuid,
            "마늘 뽑기",
            "김농주",
            "동문 농장",
            "동문로 1",
            "",
            "07:00 - 17:00",
            "07:00",
            "17:00",
            1,
            1,
            List.of(),
            "",
            List.of()
        );
    }

    @Test void invalidChargeRatesFailBeforeAnyScheduleWrites() {
        for (String amount : List.of("-1", "1.5", "1000000000000")) {
            var rates=new com.laborflow.core.schedule.dto.ScheduleChargeRates(new java.math.BigDecimal(amount),null);
            var request=new com.laborflow.core.schedule.dto.CreateScheduleTaskRequest(ownerUuid,null,null,null,
                workDate,workDate,"Fiction work",clientWorkSiteUuid,"Fiction site","Fiction address","",1,1,
                LocalTime.of(7,0),LocalTime.of(17,0),"",List.of(),rates);
            assertThatThrownBy(()->service.createTask("test",request)).isInstanceOf(IllegalArgumentException.class);
        }
        org.mockito.Mockito.verifyNoInteractions(clientsService);
        org.mockito.Mockito.verify(scheduleDao,never()).setCreatedTaskChargeRates(org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.any());
    }
}
