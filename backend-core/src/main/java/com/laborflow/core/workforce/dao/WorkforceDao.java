package com.laborflow.core.workforce.dao;

import com.laborflow.core.workforce.dto.WorkTypeResponse;
import com.laborflow.core.workforce.dto.WorkerResponse;
import com.laborflow.core.workforce.dto.WorkerSeparationRuleRequest;
import com.laborflow.core.workforce.dto.WorkerSeparationRuleResponse;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

public interface WorkforceDao {
    List<WorkerResponse> findWorkersByLoginId(String loginId);

    List<WorkTypeResponse> findActiveWorkTypes();

    Optional<UUID> findAgencyOwnerUuidByLoginId(String loginId);

    Optional<UUID> findAccountUuidByLoginId(String loginId);

    Optional<UUID> findWorkerUuidByPhoneHashSource(String phoneHashSource);

    boolean workerProfileBelongsToLoginId(String loginId, UUID workerProfileUuid);

    boolean workerTeamBelongsToLoginId(String loginId, UUID teamUuid);

    boolean guestAssignmentBelongsToLoginId(String loginId, UUID assignmentUuid);

    Optional<UUID> findWorkerProfileUuidByPhoneHashSource(String loginId, String phoneHashSource);

    boolean agencyWorkerProfileExists(UUID agencyOwnerUuid, UUID workerUuid);

    UUID insertWorker(String canonicalName, String gender, Integer age);

    void upsertWorkerSensitiveProfile(UUID workerUuid, String phone, String phoneHashSource);

    UUID insertWorkerProfile(
        UUID agencyOwnerUuid,
        UUID workerUuid,
        String localName,
        String localNickname,
        String phone,
        String phoneHashSource,
        String pickupLocation,
        String privateMemo,
        boolean isActive,
        int availableDaysMask,
        String availabilityMemo
    );

    void updateWorkerIdentity(UUID workerProfileUuid, String name, String nickname);

    boolean localPhoneExistsForOtherProfile(String loginId, UUID workerProfileUuid, String phoneHashSource);

    void updateWorkerPhone(UUID workerProfileUuid, String phone, String phoneHashSource);

    void updateWorkerPickupLocation(UUID workerProfileUuid, String pickupLocation);

    void updateWorkerGender(UUID workerProfileUuid, String gender);

    void updateWorkerCoreDetails(UUID workerProfileUuid, String gender, Integer age);

    void updateWorkerProfileDetails(
        UUID workerProfileUuid,
        String pickupLocation,
        String privateMemo,
        boolean isActive,
        int availableDaysMask,
        String availabilityMemo
    );

    void upsertWorkerPaymentProfile(
        UUID workerProfileUuid,
        String bankCode,
        String bankName,
        String accountNumber,
        String accountNumberHashSource,
        String accountHolderName
    );

    void replaceWorkerWorkTypes(UUID workerProfileUuid, List<String> workTypeCodes, Map<String, Integer> workTypeRatings);

    void setWorkerNoShowRisk(UUID workerProfileUuid, boolean enabled);

    List<WorkerSeparationRuleResponse> findWorkerSeparationRules(UUID agencyOwnerUuid);

    List<WorkerSeparationRuleResponse> findWorkerSeparationRules(
        UUID agencyOwnerUuid,
        List<UUID> workerProfileUuids
    );

    void replaceWorkerSeparationRules(
        UUID agencyOwnerUuid,
        UUID accountUuid,
        UUID workerProfileUuid,
        List<WorkerSeparationRuleRequest> separationRules
    );

    void recordWorkerSeparationOverrides(
        UUID agencyOwnerUuid,
        UUID accountUuid,
        UUID scheduleDayUuid,
        List<UUID> separationRuleUuids
    );

    void linkGuestAssignmentToWorkerProfile(UUID assignmentUuid, UUID workerProfileUuid);

    UUID createWorkerTeam(UUID agencyOwnerUuid, String teamName, List<UUID> workerProfileUuids);

    void updateWorkerTeam(UUID agencyOwnerUuid, UUID teamUuid, String teamName, List<UUID> workerProfileUuids);

    void softDeleteWorkerProfile(String loginId, UUID workerProfileUuid);

    void softDeleteWorkerTeam(String loginId, UUID teamUuid);
}
