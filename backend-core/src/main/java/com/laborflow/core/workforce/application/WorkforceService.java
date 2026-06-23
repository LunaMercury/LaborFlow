package com.laborflow.core.workforce.application;

import com.laborflow.core.workforce.dao.WorkforceDao;
import com.laborflow.core.workforce.dto.WorkTypeResponse;
import com.laborflow.core.workforce.dto.WorkerListResponse;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WorkforceService {
    private final WorkforceDao workforceDao;

    public WorkforceService(WorkforceDao workforceDao) {
        this.workforceDao = workforceDao;
    }

    public WorkerListResponse getWorkers(String loginId) {
        return new WorkerListResponse(workforceDao.findWorkersByLoginId(normalizeLoginId(loginId)));
    }

    public List<WorkTypeResponse> getWorkTypes() {
        return workforceDao.findActiveWorkTypes();
    }

    @Transactional
    public void updateWorkerWorkTypes(String loginId, UUID workerProfileUuid, List<String> workTypeCodes) {
        String normalizedLoginId = normalizeLoginId(loginId);
        if (!workforceDao.workerProfileBelongsToLoginId(normalizedLoginId, workerProfileUuid)) {
            throw new IllegalArgumentException("Worker profile was not found.");
        }

        Set<String> uniqueWorkTypeCodes = new LinkedHashSet<>(workTypeCodes == null ? List.of() : workTypeCodes);
        workforceDao.replaceWorkerWorkTypes(workerProfileUuid, uniqueWorkTypeCodes.stream().toList());
    }

    private String normalizeLoginId(String loginId) {
        if (loginId == null || loginId.isBlank()) {
            return "test";
        }

        return loginId.trim();
    }
}
