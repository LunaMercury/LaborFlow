package com.laborflow.core.schedule.application;

import com.laborflow.core.schedule.dao.ScheduleDao;
import com.laborflow.core.schedule.dto.ScheduleAssignmentRequest;
import com.laborflow.core.schedule.dto.ScheduleTaskListResponse;
import com.laborflow.core.schedule.dto.ScheduleTaskResponse;
import com.laborflow.core.schedule.dto.UpdateScheduleTaskRequest;
import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ScheduleService {
    private final ScheduleDao scheduleDao;

    public ScheduleService(ScheduleDao scheduleDao) {
        this.scheduleDao = scheduleDao;
    }

    public ScheduleTaskListResponse getTasks(String loginId, LocalDate workDate) {
        UUID agencyOwnerUuid = findAgencyOwnerUuid(loginId);
        return new ScheduleTaskListResponse(scheduleDao.findTasks(agencyOwnerUuid, workDate));
    }

    @Transactional
    public ScheduleTaskResponse updateTask(
        String loginId,
        UUID workSiteUuid,
        LocalDate workDate,
        UpdateScheduleTaskRequest request
    ) {
        UUID agencyOwnerUuid = findAgencyOwnerUuid(loginId);
        if (!scheduleDao.workSiteBelongsToAgencyOwner(agencyOwnerUuid, workSiteUuid)) {
            throw new IllegalArgumentException("Work site was not found.");
        }

        int requiredMen = normalizeRequiredCount(request.requiredMen());
        int requiredWomen = normalizeRequiredCount(request.requiredWomen());
        List<String> workTypeCodes = normalizeWorkTypeCodes(request.workTypeCodes());
        List<ScheduleAssignmentRequest> assignments = normalizeAssignments(
            agencyOwnerUuid,
            request.assignments()
        );

        scheduleDao.updateTask(
            agencyOwnerUuid,
            workSiteUuid,
            normalizeRequiredText(request.title()),
            normalizeRequiredText(request.address()),
            requiredMen,
            requiredWomen,
            normalizeOptionalText(request.memo())
        );
        scheduleDao.replaceTaskWorkTypes(workSiteUuid, workTypeCodes);
        scheduleDao.replaceAssignments(agencyOwnerUuid, workSiteUuid, workDate, assignments);

        return scheduleDao.findTask(agencyOwnerUuid, workSiteUuid, workDate)
            .orElseThrow(() -> new IllegalArgumentException("Work site was not found."));
    }

    private UUID findAgencyOwnerUuid(String loginId) {
        return scheduleDao.findAgencyOwnerUuidByLoginId(normalizeLoginId(loginId))
            .orElseThrow(() -> new IllegalArgumentException("Labor agency owner was not found."));
    }

    private List<ScheduleAssignmentRequest> normalizeAssignments(
        UUID agencyOwnerUuid,
        List<ScheduleAssignmentRequest> assignments
    ) {
        return (assignments == null ? List.<ScheduleAssignmentRequest>of() : assignments).stream()
            .filter(assignment -> assignment.workerProfileUuid() != null)
            .map(assignment -> {
                if (!scheduleDao.workerProfileBelongsToAgencyOwner(agencyOwnerUuid, assignment.workerProfileUuid())) {
                    throw new IllegalArgumentException("Worker profile was not found.");
                }

                String area = "women".equalsIgnoreCase(assignment.area()) ? "women" : "men";
                return new ScheduleAssignmentRequest(assignment.workerProfileUuid(), area);
            })
            .distinct()
            .toList();
    }

    private int normalizeRequiredCount(int value) {
        if (value < 0 || value > 10000) {
            throw new IllegalArgumentException("Required worker count is invalid.");
        }

        return value;
    }

    private List<String> normalizeWorkTypeCodes(List<String> workTypeCodes) {
        return new LinkedHashSet<>(workTypeCodes == null ? List.<String>of() : workTypeCodes)
            .stream()
            .map(this::normalizeOptionalText)
            .filter(value -> value != null)
            .toList();
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
