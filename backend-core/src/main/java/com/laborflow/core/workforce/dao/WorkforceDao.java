package com.laborflow.core.workforce.dao;

import com.laborflow.core.workforce.dto.WorkTypeResponse;
import com.laborflow.core.workforce.dto.WorkerResponse;
import java.util.List;
import java.util.UUID;

public interface WorkforceDao {
    List<WorkerResponse> findWorkersByLoginId(String loginId);

    List<WorkTypeResponse> findActiveWorkTypes();

    boolean workerProfileBelongsToLoginId(String loginId, UUID workerProfileUuid);

    void replaceWorkerWorkTypes(UUID workerProfileUuid, List<String> workTypeCodes);
}
