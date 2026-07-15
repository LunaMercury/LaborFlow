package com.laborflow.core.schedule.application;

import com.laborflow.core.schedule.dao.ScheduleDao;
import com.laborflow.core.schedule.dto.AddGuestParticipantsRequest;
import com.laborflow.core.schedule.dto.CreateScheduleTaskRequest;
import com.laborflow.core.schedule.dto.DeleteScheduleTaskRangeRequest;
import com.laborflow.core.schedule.dto.FarmOwnerOptionResponse;
import com.laborflow.core.schedule.dto.RescheduleTaskRangeRequest;
import com.laborflow.core.schedule.dto.ScheduleAssignmentRequest;
import com.laborflow.core.schedule.dto.ScheduleTaskListResponse;
import com.laborflow.core.schedule.dto.ScheduleTaskResponse;
import com.laborflow.core.schedule.dto.UpdateScheduleTaskRequest;
import java.time.LocalDate;
import java.time.LocalTime;
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

    public List<FarmOwnerOptionResponse> getFarmOwners(String loginId, String query) {
        UUID agencyOwnerUuid = findAgencyOwnerUuid(loginId);
        return scheduleDao.findFarmOwners(agencyOwnerUuid, normalizeOptionalText(query));
    }

    @Transactional
    public ScheduleTaskResponse createTask(String loginId, CreateScheduleTaskRequest request) {
        UUID agencyOwnerUuid = findAgencyOwnerUuid(loginId);
        if (request.ownerUuid() == null || !scheduleDao.farmOwnerBelongsToAgencyOwner(agencyOwnerUuid, request.ownerUuid())) {
            throw new IllegalArgumentException("Farm owner was not found.");
        }

        LocalDate startDate = request.startDate();
        LocalDate endDate = request.endDate();
        if (startDate == null || endDate == null || endDate.isBefore(startDate)) {
            throw new IllegalArgumentException("Schedule range is invalid.");
        }

        if (startDate.plusDays(369).isBefore(endDate)) {
            throw new IllegalArgumentException("Schedule range is too long.");
        }

        validateTimeRange(request.startTime(), request.endTime());
        UUID scheduleDayUuid = scheduleDao.createTask(
            agencyOwnerUuid,
            request.ownerUuid(),
            startDate,
            endDate,
            normalizeRequiredText(request.title()),
            normalizeOptionalText(request.siteName()),
            normalizeRequiredText(request.address()),
            normalizeRequiredCount(request.requiredMen()),
            normalizeRequiredCount(request.requiredWomen()),
            request.startTime(),
            request.endTime(),
            normalizeOptionalText(request.memo()),
            normalizeWorkTypeCodes(request.workTypeCodes())
        );

        return scheduleDao.findTask(agencyOwnerUuid, scheduleDayUuid, startDate)
            .orElseThrow(() -> new IllegalArgumentException("Schedule day was not found."));
    }

    @Transactional
    public ScheduleTaskResponse updateTask(
        String loginId,
        UUID scheduleDayUuid,
        LocalDate workDate,
        UpdateScheduleTaskRequest request
    ) {
        UUID agencyOwnerUuid = findAgencyOwnerUuid(loginId);
        if (!scheduleDao.scheduleDayBelongsToAgencyOwner(agencyOwnerUuid, scheduleDayUuid)) {
            throw new IllegalArgumentException("Schedule day was not found.");
        }

        int requiredMen = normalizeRequiredCount(request.requiredMen());
        int requiredWomen = normalizeRequiredCount(request.requiredWomen());
        List<String> workTypeCodes = normalizeWorkTypeCodes(request.workTypeCodes());
        List<ScheduleAssignmentRequest> assignments = normalizeAssignments(
            agencyOwnerUuid,
            request.assignments()
        );
        UUID ownerUuid = request.ownerUuid();
        if (ownerUuid != null && !scheduleDao.farmOwnerBelongsToAgencyOwner(agencyOwnerUuid, ownerUuid)) {
            throw new IllegalArgumentException("Farm owner was not found.");
        }

        scheduleDao.updateTask(
            agencyOwnerUuid,
            scheduleDayUuid,
            ownerUuid,
            normalizeRequiredText(request.title()),
            normalizeRequiredText(request.address()),
            requiredMen,
            requiredWomen,
            normalizeOptionalText(request.memo())
        );
        scheduleDao.replaceTaskWorkTypes(agencyOwnerUuid, scheduleDayUuid, workTypeCodes);
        scheduleDao.replaceAssignments(agencyOwnerUuid, scheduleDayUuid, assignments);

        return scheduleDao.findTask(agencyOwnerUuid, scheduleDayUuid, workDate)
            .orElseThrow(() -> new IllegalArgumentException("Schedule day was not found."));
    }

    @Transactional
    public ScheduleTaskResponse addGuestParticipants(
        String loginId,
        UUID scheduleDayUuid,
        LocalDate workDate,
        AddGuestParticipantsRequest request
    ) {
        UUID agencyOwnerUuid = findAgencyOwnerUuid(loginId);
        if (!scheduleDao.scheduleDayBelongsToAgencyOwner(agencyOwnerUuid, scheduleDayUuid)) {
            throw new IllegalArgumentException("Schedule day was not found.");
        }

        int participantCount = request.participantCount() <= 0 ? 1 : request.participantCount();
        if (participantCount > 100) {
            throw new IllegalArgumentException("Guest participant count is invalid.");
        }
        String introductionType = normalizeIntroductionType(request.introductionType());
        UUID introducedByWorkerProfileUuid = request.introducedByWorkerProfileUuid();
        if ("WORKER".equals(introductionType)) {
            if (introducedByWorkerProfileUuid == null
                || !scheduleDao.workerProfileBelongsToAgencyOwner(agencyOwnerUuid, introducedByWorkerProfileUuid)) {
                throw new IllegalArgumentException("Introducing worker profile was not found.");
            }
        } else {
            introducedByWorkerProfileUuid = null;
        }
        UUID settlementRecipientWorkerProfileUuid = request.settlementRecipientWorkerProfileUuid();
        if (settlementRecipientWorkerProfileUuid != null
            && !scheduleDao.workerProfileBelongsToAgencyOwner(agencyOwnerUuid, settlementRecipientWorkerProfileUuid)) {
            throw new IllegalArgumentException("Settlement recipient worker profile was not found.");
        }
        validateTimeRange(request.plannedStartTime(), request.plannedEndTime());

        scheduleDao.addGuestParticipants(
            agencyOwnerUuid,
            scheduleDayUuid,
            UUID.randomUUID(),
            "women".equalsIgnoreCase(request.area()) ? "women" : "men",
            participantCount,
            normalizeOptionalText(request.displayName()),
            normalizeOptionalText(request.pickupLocation()),
            introductionType,
            introducedByWorkerProfileUuid,
            settlementRecipientWorkerProfileUuid,
            request.plannedStartTime(),
            request.plannedEndTime()
        );

        return scheduleDao.findTask(agencyOwnerUuid, scheduleDayUuid, workDate)
            .orElseThrow(() -> new IllegalArgumentException("Schedule day was not found."));
    }

    @Transactional
    public void rescheduleTaskRange(String loginId, RescheduleTaskRangeRequest request) {
        UUID agencyOwnerUuid = findAgencyOwnerUuid(loginId);
        List<UUID> taskIds = normalizeTaskIds(request.taskIds());
        LocalDate startDate = request.startDate();
        LocalDate endDate = request.endDate();

        if (startDate == null || endDate == null || endDate.isBefore(startDate)) {
            throw new IllegalArgumentException("Schedule range is invalid.");
        }

        if (startDate.plusDays(369).isBefore(endDate)) {
            throw new IllegalArgumentException("Schedule range is too long.");
        }

        scheduleDao.rescheduleTaskRange(agencyOwnerUuid, taskIds, startDate, endDate);
    }

    @Transactional
    public void deleteTaskRange(String loginId, DeleteScheduleTaskRangeRequest request) {
        UUID agencyOwnerUuid = findAgencyOwnerUuid(loginId);
        List<UUID> taskIds = normalizeTaskIds(request.taskIds());
        scheduleDao.deleteTaskRange(agencyOwnerUuid, taskIds);
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
                return new ScheduleAssignmentRequest(
                    assignment.workerProfileUuid(),
                    area,
                    normalizeWorkerCount(assignment.workerCount())
                );
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

    private int normalizeWorkerCount(int value) {
        if (value <= 0) {
            return 1;
        }

        if (value > 100) {
            throw new IllegalArgumentException("Assigned worker count is invalid.");
        }

        return value;
    }

    private void validateTimeRange(LocalTime startTime, LocalTime endTime) {
        if (startTime != null && endTime != null && !endTime.isAfter(startTime)) {
            throw new IllegalArgumentException("Schedule time range is invalid.");
        }
    }

    private List<String> normalizeWorkTypeCodes(List<String> workTypeCodes) {
        return new LinkedHashSet<>(workTypeCodes == null ? List.<String>of() : workTypeCodes)
            .stream()
            .map(this::normalizeOptionalText)
            .filter(value -> value != null)
            .toList();
    }

    private List<UUID> normalizeTaskIds(List<UUID> taskIds) {
        List<UUID> normalizedTaskIds = new LinkedHashSet<>(taskIds == null ? List.<UUID>of() : taskIds)
            .stream()
            .filter(taskId -> taskId != null)
            .toList();

        if (normalizedTaskIds.isEmpty()) {
            throw new IllegalArgumentException("At least one schedule day is required.");
        }

        return normalizedTaskIds;
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

    private String normalizeIntroductionType(String value) {
        String normalizedValue = value == null ? "NONE" : value.trim().toUpperCase();
        return switch (normalizedValue) {
            case "NONE", "WORKER", "EXTERNAL", "UNKNOWN" -> normalizedValue;
            default -> throw new IllegalArgumentException("Introduction type is invalid.");
        };
    }

    private String normalizeLoginId(String loginId) {
        if (loginId == null || loginId.isBlank()) {
            return "test";
        }

        return loginId.trim();
    }
}
