package com.laborflow.core.schedule.dao;

import com.laborflow.core.schedule.dto.ScheduleAssignmentRequest;
import com.laborflow.core.schedule.dto.ScheduleTaskResponse;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ScheduleDao {
    Optional<UUID> findAgencyOwnerUuidByLoginId(String loginId);

    boolean scheduleDayBelongsToAgencyOwner(UUID agencyOwnerUuid, UUID scheduleDayUuid);

    boolean workerProfileBelongsToAgencyOwner(UUID agencyOwnerUuid, UUID workerProfileUuid);

    List<ScheduleTaskResponse> findTasks(UUID agencyOwnerUuid, LocalDate workDate);

    Optional<ScheduleTaskResponse> findTask(UUID agencyOwnerUuid, UUID scheduleDayUuid, LocalDate workDate);

    void updateTask(
        UUID agencyOwnerUuid,
        UUID scheduleDayUuid,
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
}
