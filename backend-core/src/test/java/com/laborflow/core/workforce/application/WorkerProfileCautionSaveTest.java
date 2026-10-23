package com.laborflow.core.workforce.application;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.laborflow.core.cautions.application.AssignmentCautionService;
import com.laborflow.core.cautions.dto.WorkerAssignmentCautionChangeRequest;
import com.laborflow.core.workforce.dao.WorkforceDao;
import com.laborflow.core.workforce.dto.UpdateWorkerProfileRequest;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.SimpleTransactionStatus;

class WorkerProfileCautionSaveTest {
    private final WorkforceDao dao = mock(WorkforceDao.class);
    private final AssignmentCautionService cautions = mock(AssignmentCautionService.class);
    private final PlatformTransactionManager transactions = mock(PlatformTransactionManager.class);
    private final SimpleTransactionStatus status = new SimpleTransactionStatus();
    private final UUID worker = UUID.randomUUID();
    private final List<WorkerAssignmentCautionChangeRequest> changes = List.of(
        new WorkerAssignmentCautionChangeRequest(null, UUID.randomUUID(), "BOTH", "가상 메모", false));

    private WorkforceService service() {
        when(dao.workerProfileBelongsToLoginId("sample", worker)).thenReturn(true);
        when(transactions.getTransaction(any(TransactionDefinition.class))).thenReturn(status);
        var factory = new ProxyFactory(new WorkforceService(dao, cautions));
        var interceptor = new TransactionInterceptor();
        interceptor.setTransactionManager(transactions);
        interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        factory.addAdvice(interceptor);
        return (WorkforceService) factory.getProxy();
    }

    private UpdateWorkerProfileRequest request(List<WorkerAssignmentCautionChangeRequest> draft) {
        return new UpdateWorkerProfileRequest("가상 작업자", null, "01000000000", null, "N", null, null,
            true, 127, null, null, null, null, null, false, List.of(), Map.of(), null, draft);
    }

    @Test void profileAndCautionChangesJoinTheSameCommit() {
        service().updateWorkerProfile("sample", worker, request(changes));
        verify(cautions).applyWorkerChanges("sample", worker, changes);
        verify(transactions).commit(status);
        verify(transactions, never()).rollback(any());
    }

    @Test void cautionFailureRollsBackTheProfileSaveInsteadOfCommittingOnlyProfileFields() {
        doThrow(new IllegalArgumentException("Caution was not found."))
            .when(cautions).applyWorkerChanges("sample", worker, changes);
        assertThatThrownBy(() -> service().updateWorkerProfile("sample", worker, request(changes)))
            .isInstanceOf(IllegalArgumentException.class);
        verify(transactions).rollback(status);
        verify(transactions, never()).commit(any());
    }

    @Test void legacyRequestWithNoCautionChangesStillSaves() {
        service().updateWorkerProfile("sample", worker, request(null));
        verify(cautions).applyWorkerChanges("sample", worker, null);
        verify(transactions).commit(status);
    }

    @Test void foreignWorkerCannotSaveCautionChanges() {
        var service = service();
        when(dao.workerProfileBelongsToLoginId("sample", worker)).thenReturn(false);
        assertThatThrownBy(() -> service.updateWorkerProfile("sample", worker, request(changes)))
            .isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(cautions);
        verify(transactions).rollback(status);
    }
}
