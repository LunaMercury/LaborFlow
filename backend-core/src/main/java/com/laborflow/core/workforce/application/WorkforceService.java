package com.laborflow.core.workforce.application;

import com.laborflow.core.workforce.dao.WorkforceDao;
import com.laborflow.core.workforce.dto.CreateWorkerTeamRequest;
import com.laborflow.core.workforce.dto.CreateWorkerRequest;
import com.laborflow.core.workforce.dto.UpdateWorkerProfileRequest;
import com.laborflow.core.workforce.dto.WorkTypeResponse;
import com.laborflow.core.workforce.dto.WorkerListResponse;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
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
    public void createWorkerTeam(String loginId, CreateWorkerTeamRequest request) {
        String normalizedLoginId = normalizeLoginId(loginId);
        UUID agencyOwnerUuid = workforceDao.findAgencyOwnerUuidByLoginId(normalizedLoginId)
            .orElseThrow(() -> new IllegalArgumentException("Labor agency owner was not found."));
        TeamInput teamInput = normalizeTeamInput(normalizedLoginId, request);

        workforceDao.createWorkerTeam(agencyOwnerUuid, teamInput.teamName(), teamInput.workerProfileUuids());
    }

    @Transactional
    public void updateWorkerTeam(String loginId, UUID teamUuid, CreateWorkerTeamRequest request) {
        String normalizedLoginId = normalizeLoginId(loginId);
        UUID agencyOwnerUuid = workforceDao.findAgencyOwnerUuidByLoginId(normalizedLoginId)
            .orElseThrow(() -> new IllegalArgumentException("Labor agency owner was not found."));
        if (!workforceDao.workerTeamBelongsToLoginId(normalizedLoginId, teamUuid)) {
            throw new IllegalArgumentException("Worker team was not found.");
        }

        TeamInput teamInput = normalizeTeamInput(normalizedLoginId, request);
        workforceDao.updateWorkerTeam(
            agencyOwnerUuid,
            teamUuid,
            teamInput.teamName(),
            teamInput.workerProfileUuids()
        );
    }

    @Transactional
    public void createWorker(String loginId, CreateWorkerRequest request) {
        String normalizedLoginId = normalizeLoginId(loginId);
        UUID agencyOwnerUuid = workforceDao.findAgencyOwnerUuidByLoginId(normalizedLoginId)
            .orElseThrow(() -> new IllegalArgumentException("Labor agency owner was not found."));
        String localNickname = normalizeOptionalText(request.localNickname());
        String canonicalName = normalizeOptionalText(request.workerName());
        if (canonicalName == null && localNickname == null) {
            throw new IllegalArgumentException("Worker identity is required.");
        }

        String localName = canonicalName;
        String phoneHashSource = normalizePhoneHashSource(request.phone());
        String formattedPhone = formatPhone(phoneHashSource);
        String gender = normalizeGender(request.gender());
        Integer age = normalizeAge(request.age());
        String pickupLocation = normalizeOptionalText(request.pickupLocation());
        String privateMemo = normalizeOptionalText(request.memo());

        if (workforceDao.localPhoneExistsForOtherProfile(normalizedLoginId, new UUID(0L, 0L), phoneHashSource)) {
            throw new DuplicateWorkerPhoneException();
        }

        UUID workerUuid = workforceDao.findWorkerUuidByPhoneHashSource(phoneHashSource)
            .orElseGet(() -> workforceDao.insertWorker(canonicalName, gender, age));

        if (workforceDao.agencyWorkerProfileExists(agencyOwnerUuid, workerUuid)) {
            throw new DuplicateWorkerPhoneException();
        }

        workforceDao.upsertWorkerSensitiveProfile(workerUuid, formattedPhone, phoneHashSource);
        UUID workerProfileUuid = workforceDao.insertWorkerProfile(
            agencyOwnerUuid,
            workerUuid,
            localName,
            localNickname,
            formattedPhone,
            phoneHashSource,
            pickupLocation,
            privateMemo
        );
        List<String> workTypeCodes = normalizeWorkTypeCodes(request.workTypeCodes());
        workforceDao.replaceWorkerWorkTypes(
            workerProfileUuid,
            workTypeCodes,
            normalizeWorkTypeRatings(workTypeCodes, request.workTypeRatings())
        );
    }

    @Transactional
    public void updateWorkerProfile(String loginId, UUID workerProfileUuid, UpdateWorkerProfileRequest request) {
        String normalizedLoginId = normalizeLoginId(loginId);
        ensureWorkerProfileBelongsToLoginId(normalizedLoginId, workerProfileUuid);

        String normalizedName = normalizeOptionalText(request.name());
        String normalizedNickname = normalizeOptionalText(request.nickname());
        if (normalizedName == null && normalizedNickname == null) {
            throw new IllegalArgumentException("Worker identity is required.");
        }

        String normalizedPhone = normalizeRequiredText(request.phone());
        String normalizedPhoneHashSource = normalizePhoneHashSource(normalizedPhone);
        if (workforceDao.localPhoneExistsForOtherProfile(normalizedLoginId, workerProfileUuid, normalizedPhoneHashSource)) {
            throw new DuplicateWorkerPhoneException();
        }

        workforceDao.updateWorkerIdentity(workerProfileUuid, normalizedName, normalizedNickname);
        workforceDao.updateWorkerPhone(workerProfileUuid, formatPhone(normalizedPhoneHashSource), normalizedPhoneHashSource);
        workforceDao.updateWorkerCoreDetails(
            workerProfileUuid,
            normalizeGender(request.gender()),
            normalizeAge(request.age())
        );
        workforceDao.updateWorkerProfileDetails(
            workerProfileUuid,
            normalizeOptionalText(request.pickupLocation()),
            normalizeOptionalText(request.memo())
        );
        List<String> workTypeCodes = normalizeWorkTypeCodes(request.workTypeCodes());
        workforceDao.replaceWorkerWorkTypes(
            workerProfileUuid,
            workTypeCodes,
            normalizeWorkTypeRatings(workTypeCodes, request.workTypeRatings())
        );
    }

    @Transactional
    public void updateWorkerIdentity(String loginId, UUID workerProfileUuid, String name, String nickname) {
        String normalizedLoginId = normalizeLoginId(loginId);
        ensureWorkerProfileBelongsToLoginId(normalizedLoginId, workerProfileUuid);

        String normalizedName = normalizeOptionalText(name);
        String normalizedNickname = normalizeOptionalText(nickname);
        if (normalizedName == null && normalizedNickname == null) {
            throw new IllegalArgumentException("Worker identity is required.");
        }

        workforceDao.updateWorkerIdentity(workerProfileUuid, normalizedName, normalizedNickname);
    }

    @Transactional
    public void updateWorkerPhone(String loginId, UUID workerProfileUuid, String phone) {
        String normalizedLoginId = normalizeLoginId(loginId);
        ensureWorkerProfileBelongsToLoginId(normalizedLoginId, workerProfileUuid);

        String normalizedPhone = normalizeRequiredText(phone);
        String normalizedPhoneHashSource = normalizePhoneHashSource(normalizedPhone);

        if (workforceDao.localPhoneExistsForOtherProfile(normalizedLoginId, workerProfileUuid, normalizedPhoneHashSource)) {
            throw new DuplicateWorkerPhoneException();
        }

        workforceDao.updateWorkerPhone(workerProfileUuid, formatPhone(normalizedPhoneHashSource), normalizedPhoneHashSource);
    }

    @Transactional
    public void updateWorkerPickupLocation(String loginId, UUID workerProfileUuid, String pickupLocation) {
        String normalizedLoginId = normalizeLoginId(loginId);
        ensureWorkerProfileBelongsToLoginId(normalizedLoginId, workerProfileUuid);

        workforceDao.updateWorkerPickupLocation(workerProfileUuid, normalizeOptionalText(pickupLocation));
    }

    @Transactional
    public void updateWorkerGender(String loginId, UUID workerProfileUuid, String gender) {
        String normalizedLoginId = normalizeLoginId(loginId);
        ensureWorkerProfileBelongsToLoginId(normalizedLoginId, workerProfileUuid);

        workforceDao.updateWorkerGender(workerProfileUuid, normalizeGender(gender));
    }

    @Transactional
    public void updateWorkerWorkTypes(
        String loginId,
        UUID workerProfileUuid,
        List<String> workTypeCodes,
        Map<String, Integer> workTypeRatings
    ) {
        String normalizedLoginId = normalizeLoginId(loginId);
        ensureWorkerProfileBelongsToLoginId(normalizedLoginId, workerProfileUuid);

        List<String> normalizedWorkTypeCodes = normalizeWorkTypeCodes(workTypeCodes);
        workforceDao.replaceWorkerWorkTypes(
            workerProfileUuid,
            normalizedWorkTypeCodes,
            normalizeWorkTypeRatings(normalizedWorkTypeCodes, workTypeRatings)
        );
    }

    private List<String> normalizeWorkTypeCodes(List<String> workTypeCodes) {
        Set<String> uniqueWorkTypeCodes = new LinkedHashSet<>(workTypeCodes == null ? List.of() : workTypeCodes);

        return uniqueWorkTypeCodes.stream()
            .map(this::normalizeOptionalText)
            .filter(code -> code != null)
            .toList();
    }

    private List<UUID> normalizeWorkerProfileUuids(List<UUID> workerProfileUuids) {
        Set<UUID> uniqueWorkerProfileUuids = new LinkedHashSet<>(
            workerProfileUuids == null ? List.of() : workerProfileUuids
        );

        return uniqueWorkerProfileUuids.stream()
            .filter(uuid -> uuid != null)
            .toList();
    }

    private TeamInput normalizeTeamInput(String loginId, CreateWorkerTeamRequest request) {
        String teamName = normalizeRequiredText(request.teamName());
        List<UUID> workerProfileUuids = normalizeWorkerProfileUuids(request.workerProfileUuids());

        if (workerProfileUuids.isEmpty()) {
            throw new IllegalArgumentException("At least one team member is required.");
        }

        for (UUID workerProfileUuid : workerProfileUuids) {
            ensureWorkerProfileBelongsToLoginId(loginId, workerProfileUuid);
        }

        return new TeamInput(teamName, workerProfileUuids);
    }

    private Map<String, Integer> normalizeWorkTypeRatings(List<String> workTypeCodes, Map<String, Integer> workTypeRatings) {
        Map<String, Integer> ratings = workTypeRatings == null ? Map.of() : workTypeRatings;

        return workTypeCodes.stream()
            .collect(java.util.stream.Collectors.toMap(
                code -> code,
                code -> normalizeWorkTypeRating(ratings.get(code)),
                (left, right) -> right,
                java.util.LinkedHashMap::new
            ));
    }

    private int normalizeWorkTypeRating(Integer rating) {
        if (rating == null) {
            return 0;
        }

        return Math.max(0, Math.min(5, rating));
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

    private String normalizePhoneHashSource(String phone) {
        String phoneHashSource = normalizeRequiredText(phone).replaceAll("\\D", "");
        if (phoneHashSource.length() != 11) {
            throw new InvalidWorkerPhoneException();
        }

        return phoneHashSource;
    }

    private String formatPhone(String phoneHashSource) {
        return "%s-%s-%s".formatted(
            phoneHashSource.substring(0, 3),
            phoneHashSource.substring(3, 7),
            phoneHashSource.substring(7)
        );
    }

    private String normalizeGender(String gender) {
        return switch (gender == null ? "N" : gender.trim().toUpperCase()) {
            case "M", "MALE" -> "MALE";
            case "F", "FEMALE" -> "FEMALE";
            default -> "UNKNOWN";
        };
    }

    private Integer normalizeAge(Integer age) {
        if (age == null) {
            return null;
        }

        if (age < 0 || age > 150) {
            throw new IllegalArgumentException("Age is invalid.");
        }

        return age;
    }

    private String normalizeLoginId(String loginId) {
        if (loginId == null || loginId.isBlank()) {
            return "test";
        }

        return loginId.trim();
    }

    private record TeamInput(String teamName, List<UUID> workerProfileUuids) {
    }
}
