package com.laborflow.core.schedule.dao;

import com.laborflow.core.schedule.dto.ScheduleAssignmentRequest;
import com.laborflow.core.schedule.dto.FarmOwnerOptionResponse;
import com.laborflow.core.schedule.dto.ScheduleTaskResponse;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ScheduleDao {
    Optional<UUID> findAgencyOwnerUuidByLoginId(String loginId);

    boolean scheduleDayBelongsToAgencyOwner(UUID agencyOwnerUuid, UUID scheduleDayUuid);

    boolean workerProfileBelongsToAgencyOwner(UUID agencyOwnerUuid, UUID workerProfileUuid);

    boolean farmOwnerBelongsToAgencyOwner(UUID agencyOwnerUuid, UUID farmOwnerUuid);

    List<FarmOwnerOptionResponse> findFarmOwners(UUID agencyOwnerUuid, String query);

    List<ScheduleTaskResponse> findTasks(UUID agencyOwnerUuid, LocalDate workDate);

    Optional<ScheduleTaskResponse> findTask(UUID agencyOwnerUuid, UUID scheduleDayUuid, LocalDate workDate);

    void updateTask(
        UUID agencyOwnerUuid,
        UUID scheduleDayUuid,
        UUID ownerUuid,
        String title,
        String address,
        int requiredMen,
        int requiredWomen,
        String memo
    );

    void replaceTaskWorkTypes(UUID agencyOwnerUuid, UUID scheduleDayUuid, List<String> workTypeCodes);

    void replaceAssignments(
        UUID agencyOwnerUuid,
        UUID scheduleDayUuid,
        List<ScheduleAssignmentRequest> assignments
    );

    void addGuestParticipants(
        UUID agencyOwnerUuid,
        UUID scheduleDayUuid,
        UUID participantGroupUuid,
        String area,
        int participantCount,
        String displayName,
        String pickupLocation,
        String introductionType,
        UUID introducedByWorkerProfileUuid,
        UUID settlementRecipientWorkerProfileUuid,
        LocalTime plannedStartTime,
        LocalTime plannedEndTime
    );

    UUID createTask(
        UUID agencyOwnerUuid,
        UUID farmOwnerUuid,
        LocalDate startDate,
        LocalDate endDate,
        String title,
        String siteName,
        String address,
        int requiredMen,
        int requiredWomen,
        LocalTime startTime,
        LocalTime endTime,
        String memo,
        List<String> workTypeCodes
    );

    void rescheduleTaskRange(
        UUID agencyOwnerUuid,
        List<UUID> scheduleDayUuids,
        LocalDate startDate,
        LocalDate endDate
    );

    void deleteTaskRange(UUID agencyOwnerUuid, List<UUID> scheduleDayUuids);
}
