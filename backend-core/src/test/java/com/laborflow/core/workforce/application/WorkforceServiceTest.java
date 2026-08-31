package com.laborflow.core.workforce.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.laborflow.core.workforce.dao.WorkforceDao;
import com.laborflow.core.workforce.dto.WorkerSeparationRuleResponse;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class WorkforceServiceTest {
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
