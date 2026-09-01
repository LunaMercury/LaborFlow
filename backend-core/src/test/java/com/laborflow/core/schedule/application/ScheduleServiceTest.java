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
import com.laborflow.core.schedule.dto.ScheduleTaskResponse;
import com.laborflow.core.schedule.dto.UpdateScheduleTaskRequest;
import com.laborflow.core.workforce.application.WorkerSeparationConflictException;
import com.laborflow.core.workforce.application.WorkforceService;
import com.laborflow.core.workforce.dto.WorkerSeparationRuleResponse;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

class ScheduleServiceTest {
    private final ScheduleDao scheduleDao = mock(ScheduleDao.class);
    private final ClientsService clientsService = mock(ClientsService.class);
    private final WorkforceService workforceService = mock(WorkforceService.class);
    private final ScheduleService service = new ScheduleService(
        scheduleDao,
        clientsService,
        workforceService
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
}
