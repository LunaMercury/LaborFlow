package com.laborflow.core.schedule.dao;

import com.laborflow.core.schedule.dto.ScheduleAssignmentRequest;
import com.laborflow.core.schedule.dto.ScheduleTaskResponse;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ScheduleDao {
    Optional<UUID> findAgencyOwnerUuidByLoginId(String loginId);

    boolean workSiteBelongsToAgencyOwner(UUID agencyOwnerUuid, UUID workSiteUuid);

    boolean workerProfileBelongsToAgencyOwner(UUID agencyOwnerUuid, UUID workerProfileUuid);

    List<ScheduleTaskResponse> findTasks(UUID agencyOwnerUuid, LocalDate workDate);

    Optional<ScheduleTaskResponse> findTask(UUID agencyOwnerUuid, UUID workSiteUuid, LocalDate workDate);

    void updateTask(
        UUID agencyOwnerUuid,
        UUID workSiteUuid,
        String title,
        String address,
        int requiredMen,
        int requiredWomen,
        String memo
    );

    void replaceTaskWorkTypes(UUID workSiteUuid, List<String> workTypeCodes);

    void replaceAssignments(
        UUID agencyOwnerUuid,
        UUID workSiteUuid,
        LocalDate workDate,
        List<ScheduleAssignmentRequest> assignments
    );
}
