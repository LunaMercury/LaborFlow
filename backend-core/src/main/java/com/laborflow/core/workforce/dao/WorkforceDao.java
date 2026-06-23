package com.laborflow.core.workforce.dao;

import com.laborflow.core.workforce.dto.WorkTypeResponse;
import com.laborflow.core.workforce.dto.WorkerResponse;
import java.util.List;
import java.util.UUID;

public interface WorkforceDao {
    List<WorkerResponse> findWorkersByLoginId(String loginId);

    List<WorkTypeResponse> findActiveWorkTypes();

    boolean workerProfileBelongsToLoginId(String loginId, UUID workerProfileUuid);

    void updateWorkerIdentity(UUID workerProfileUuid, String name, String nickname);

    boolean localPhoneExistsForOtherProfile(String loginId, UUID workerProfileUuid, String phoneHashSource);

    void updateWorkerPhone(UUID workerProfileUuid, String phone, String phoneHashSource);

    void updateWorkerPickupLocation(UUID workerProfileUuid, String pickupLocation);

    void replaceWorkerWorkTypes(UUID workerProfileUuid, List<String> workTypeCodes);
}
