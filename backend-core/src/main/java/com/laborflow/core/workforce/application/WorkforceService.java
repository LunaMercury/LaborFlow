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
    public void updateWorkerIdentity(String loginId, UUID workerProfileUuid, String name, String nickname) {
        String normalizedLoginId = normalizeLoginId(loginId);
        ensureWorkerProfileBelongsToLoginId(normalizedLoginId, workerProfileUuid);

        String normalizedName = normalizeRequiredText(name);
        String normalizedNickname = normalizeOptionalText(nickname);
        workforceDao.updateWorkerIdentity(workerProfileUuid, normalizedName, normalizedNickname);
    }

    @Transactional
    public void updateWorkerPhone(String loginId, UUID workerProfileUuid, String phone) {
        String normalizedLoginId = normalizeLoginId(loginId);
        ensureWorkerProfileBelongsToLoginId(normalizedLoginId, workerProfileUuid);

        String normalizedPhone = normalizeRequiredText(phone);
        String normalizedPhoneHashSource = normalizedPhone.replaceAll("\\D", "");
        if (normalizedPhoneHashSource.isBlank()) {
            throw new IllegalArgumentException("Phone is required.");
        }

        if (workforceDao.localPhoneExistsForOtherProfile(normalizedLoginId, workerProfileUuid, normalizedPhoneHashSource)) {
            throw new DuplicateWorkerPhoneException();
        }

        workforceDao.updateWorkerPhone(workerProfileUuid, normalizedPhone, normalizedPhoneHashSource);
    }

    @Transactional
    public void updateWorkerPickupLocation(String loginId, UUID workerProfileUuid, String pickupLocation) {
        String normalizedLoginId = normalizeLoginId(loginId);
        ensureWorkerProfileBelongsToLoginId(normalizedLoginId, workerProfileUuid);

        workforceDao.updateWorkerPickupLocation(workerProfileUuid, normalizeOptionalText(pickupLocation));
    }

    @Transactional
    public void updateWorkerWorkTypes(String loginId, UUID workerProfileUuid, List<String> workTypeCodes) {
        String normalizedLoginId = normalizeLoginId(loginId);
        ensureWorkerProfileBelongsToLoginId(normalizedLoginId, workerProfileUuid);

        Set<String> uniqueWorkTypeCodes = new LinkedHashSet<>(workTypeCodes == null ? List.of() : workTypeCodes);
        workforceDao.replaceWorkerWorkTypes(workerProfileUuid, uniqueWorkTypeCodes.stream().toList());
    }

    private void ensureWorkerProfileBelongsToLoginId(String loginId, UUID workerProfileUuid) {
        if (!workforceDao.workerProfileBelongsToLoginId(loginId, workerProfileUuid)) {
            throw new IllegalArgumentException("Worker profile was not found.");
        }
    }

    private String normalizeRequiredText(String value) {
        String normalizedValue = normalizeOptionalText(value);
        if (normalizedValue == null) {
            throw new IllegalArgumentException("Required value is missing.");
        }

        return normalizedValue;
    }

    private String normalizeOptionalText(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        return value.trim();
    }

    private String normalizeLoginId(String loginId) {
        if (loginId == null || loginId.isBlank()) {
            return "test";
        }

        return loginId.trim();
    }
}
