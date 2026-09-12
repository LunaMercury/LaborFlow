package com.laborflow.core.workforce.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.laborflow.core.workforce.dao.WorkforceDao;
import com.laborflow.core.workforce.dto.CreateWorkTypeRequest;
import com.laborflow.core.workforce.dto.WorkTypeResponse;
import com.laborflow.core.workforce.dto.WorkerSeparationRuleResponse;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class WorkforceServiceTest {
    @Test
    void returnsOnlyWorkTypesVisibleToTheCurrentAgency() {
        WorkforceDao workforceDao = mock(WorkforceDao.class);
        WorkforceService service = new WorkforceService(workforceDao);
        UUID agencyOwnerUuid = UUID.randomUUID();
        List<WorkTypeResponse> visibleWorkTypes = List.of(
            new WorkTypeResponse("garlic_harvest", "마늘 수확"),
            new WorkTypeResponse("custom_1", "마늘 심기")
        );
        when(workforceDao.findAgencyOwnerUuidByLoginId("test"))
            .thenReturn(Optional.of(agencyOwnerUuid));
        when(workforceDao.findActiveWorkTypes(agencyOwnerUuid)).thenReturn(visibleWorkTypes);

        assertThat(service.getWorkTypes(" test ")).isEqualTo(visibleWorkTypes);
    }

    @Test
    void reusesAnExistingVisibleWorkTypeWithTheSameName() {
        WorkforceDao workforceDao = mock(WorkforceDao.class);
        WorkforceService service = new WorkforceService(workforceDao);
        UUID agencyOwnerUuid = UUID.randomUUID();
        UUID accountUuid = UUID.randomUUID();
        WorkTypeResponse existing = new WorkTypeResponse("garlic_harvest", "마늘 심기");
        when(workforceDao.findAgencyOwnerUuidByLoginId("test"))
            .thenReturn(Optional.of(agencyOwnerUuid));
        when(workforceDao.findAccountUuidByLoginId("test")).thenReturn(Optional.of(accountUuid));
        when(workforceDao.findVisibleWorkTypeByName(agencyOwnerUuid, "마늘 심기"))
            .thenReturn(Optional.of(existing));

        assertThat(service.createWorkType("test", new CreateWorkTypeRequest("  마늘 심기  ")))
            .isEqualTo(existing);
        verify(workforceDao, never()).insertAgencyWorkType(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any(),
            anyString(),
            anyString()
        );
    }

    @Test
    void createsAnAgencyOwnedWorkTypeWhenNoVisibleNameMatches() {
        WorkforceDao workforceDao = mock(WorkforceDao.class);
        WorkforceService service = new WorkforceService(workforceDao);
        UUID agencyOwnerUuid = UUID.randomUUID();
        UUID accountUuid = UUID.randomUUID();
        WorkTypeResponse created = new WorkTypeResponse("custom_generated", "마늘심기 - 밭마늘");
        when(workforceDao.findAgencyOwnerUuidByLoginId("test"))
            .thenReturn(Optional.of(agencyOwnerUuid));
        when(workforceDao.findAccountUuidByLoginId("test")).thenReturn(Optional.of(accountUuid));
        when(workforceDao.findVisibleWorkTypeByName(agencyOwnerUuid, "마늘심기 - 밭마늘"))
            .thenReturn(Optional.empty());
        when(workforceDao.insertAgencyWorkType(
            org.mockito.ArgumentMatchers.eq(agencyOwnerUuid),
            org.mockito.ArgumentMatchers.eq(accountUuid),
            org.mockito.ArgumentMatchers.startsWith("custom_"),
            org.mockito.ArgumentMatchers.eq("마늘심기 - 밭마늘")
        )).thenReturn(Optional.of(created));

        assertThat(service.createWorkType("test", new CreateWorkTypeRequest("마늘심기 - 밭마늘")))
            .isEqualTo(created);
    }

    @Test
    void rejectsBlankOrOversizedWorkTypeNamesWithoutSaving() {
        WorkforceDao workforceDao = mock(WorkforceDao.class);
        WorkforceService service = new WorkforceService(workforceDao);

        assertThatThrownBy(() -> service.createWorkType("test", new CreateWorkTypeRequest("  ")))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.createWorkType("test", new CreateWorkTypeRequest("가".repeat(101))))
            .isInstanceOf(IllegalArgumentException.class);
        verify(workforceDao, never()).insertAgencyWorkType(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any(),
            anyString(),
            anyString()
        );
    }

    @Test
    void findsOnlyConflictsThatIncludeTheTargetAssignment() {
        WorkforceDao workforceDao = mock(WorkforceDao.class);
        WorkforceService service = new WorkforceService(workforceDao);
        UUID agencyOwnerUuid = UUID.randomUUID();
        UUID targetWorkerUuid = UUID.randomUUID();
        UUID nearbyWorkerUuid = UUID.randomUUID();
        UUID unrelatedWorkerUuid = UUID.randomUUID();
        WorkerSeparationRuleResponse targetConflict = rule(targetWorkerUuid, nearbyWorkerUuid);
        WorkerSeparationRuleResponse nearbyOnlyConflict = rule(nearbyWorkerUuid, unrelatedWorkerUuid);

        when(workforceDao.findAgencyOwnerUuidByLoginId("test"))
            .thenReturn(Optional.of(agencyOwnerUuid));
        when(workforceDao.findWorkerSeparationRules(
            org.mockito.ArgumentMatchers.eq(agencyOwnerUuid),
            anyList()
        )).thenReturn(List.of(targetConflict, nearbyOnlyConflict));

        List<WorkerSeparationRuleResponse> conflicts = service.findAssignmentSeparationConflicts(
            "test",
            List.of(targetWorkerUuid),
            List.of(nearbyWorkerUuid, unrelatedWorkerUuid)
        );

        assertThat(conflicts).containsExactly(targetConflict);
    }

    private WorkerSeparationRuleResponse rule(UUID workerA, UUID workerB) {
        return new WorkerSeparationRuleResponse(
            UUID.randomUUID(),
            workerA,
            "작업자 A",
            workerB,
            "작업자 B",
            "동시 배치 주의"
        );
    }
}
