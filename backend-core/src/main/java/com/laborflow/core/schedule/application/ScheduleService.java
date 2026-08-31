package com.laborflow.core.schedule.application;

import com.laborflow.core.clients.application.ClientsService;
import com.laborflow.core.clients.dto.ClientWorkSiteResponse;
import com.laborflow.core.clients.dto.CreateClientRequest;
import com.laborflow.core.schedule.dao.ScheduleDao;
import com.laborflow.core.schedule.dto.AddGuestParticipantsRequest;
import com.laborflow.core.schedule.dto.CreateScheduleTaskRequest;
import com.laborflow.core.schedule.dto.DeleteScheduleTaskRangeRequest;
import com.laborflow.core.schedule.dto.FarmOwnerOptionResponse;
import com.laborflow.core.schedule.dto.RescheduleTaskRangeRequest;
import com.laborflow.core.schedule.dto.ReplaceNoShowRequest;
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
    private final ClientsService clientsService;

    public ScheduleService(ScheduleDao scheduleDao, ClientsService clientsService) {
        this.scheduleDao = scheduleDao;
        this.clientsService = clientsService;
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
        LocalDate startDate = request.startDate();
        LocalDate endDate = request.endDate();
        if (startDate == null || endDate == null || endDate.isBefore(startDate)) {
            throw new IllegalArgumentException("Schedule range is invalid.");
        }

        if (startDate.plusDays(369).isBefore(endDate)) {
            throw new IllegalArgumentException("Schedule range is too long.");
        }

        validateTimeRange(request.startTime(), request.endTime());
        String title = normalizeRequiredText(request.title());
        UUID ownerUuid = request.ownerUuid();
        if (ownerUuid == null) {
            ownerUuid = clientsService.createClientAndReturnFarmOwnerUuid(
                loginId,
                new CreateClientRequest(
                    request.ownerName(),
                    request.ownerNickname(),
                    null,
                    request.ownerPhone(),
                    null,
                    null,
                    List.of()
                )
            );
        } else if (!scheduleDao.farmOwnerBelongsToAgencyOwner(agencyOwnerUuid, ownerUuid)) {
            throw new IllegalArgumentException("Farm owner was not found.");
        } else {
            clientsService.addPhoneIfMissing(loginId, ownerUuid, request.ownerPhone());
        }

        ClientWorkSiteResponse clientWorkSite = clientsService.resolveWorkSite(
            loginId,
            ownerUuid,
            request.clientWorkSiteUuid(),
            request.siteName(),
            request.address(),
            request.siteMemo()
        );
        String address = normalizeRequiredText(clientWorkSite.farmAddress());

        UUID scheduleDayUuid = scheduleDao.createTask(
            agencyOwnerUuid,
            ownerUuid,
            clientWorkSite.uuid(),
            startDate,
            endDate,
            title,
            normalizeOptionalText(clientWorkSite.siteName()),
            address,
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
        validateTimeRange(request.startTime(), request.endTime());
        List<String> workTypeCodes = normalizeWorkTypeCodes(request.workTypeCodes());
        List<ScheduleAssignmentRequest> assignments = normalizeAssignments(
            agencyOwnerUuid,
            request.assignments()
        );
        UUID ownerUuid = request.ownerUuid();
        if (ownerUuid == null || !scheduleDao.farmOwnerBelongsToAgencyOwner(agencyOwnerUuid, ownerUuid)) {
            throw new IllegalArgumentException("Farm owner was not found.");
        }

        ClientWorkSiteResponse clientWorkSite = clientsService.resolveWorkSite(
            loginId,
            ownerUuid,
            request.clientWorkSiteUuid(),
            request.siteName(),
            request.address(),
            request.siteMemo()
        );

        scheduleDao.updateTask(
            agencyOwnerUuid,
            scheduleDayUuid,
            ownerUuid,
            clientWorkSite.uuid(),
            normalizeRequiredText(request.title()),
            normalizeOptionalText(clientWorkSite.siteName()),
            normalizeRequiredText(clientWorkSite.farmAddress()),
            request.startTime(),
            request.endTime(),
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
    public ScheduleTaskResponse updateGuestParticipants(
        String loginId,
        UUID scheduleDayUuid,
        UUID participantGroupUuid,
        LocalDate workDate,
        AddGuestParticipantsRequest request
    ) {
        UUID agencyOwnerUuid = findAgencyOwnerUuid(loginId);
        validateGuestParticipantRequest(agencyOwnerUuid, request);
        scheduleDao.updateGuestParticipants(
            agencyOwnerUuid,
            scheduleDayUuid,
            participantGroupUuid,
            "women".equalsIgnoreCase(request.area()) ? "women" : "men",
            request.participantCount(),
            normalizeOptionalText(request.displayName()),
            normalizeOptionalText(request.pickupLocation()),
            request.plannedStartTime(),
            request.plannedEndTime()
        );

        return scheduleDao.findTask(agencyOwnerUuid, scheduleDayUuid, workDate)
            .orElseThrow(() -> new IllegalArgumentException("Schedule day was not found."));
    }

    @Transactional
    public ScheduleTaskResponse deleteGuestParticipants(
        String loginId,
        UUID scheduleDayUuid,
        UUID participantGroupUuid,
        LocalDate workDate
    ) {
        UUID agencyOwnerUuid = findAgencyOwnerUuid(loginId);
        scheduleDao.deleteGuestParticipants(agencyOwnerUuid, scheduleDayUuid, participantGroupUuid);
        return scheduleDao.findTask(agencyOwnerUuid, scheduleDayUuid, workDate)
            .orElseThrow(() -> new IllegalArgumentException("Schedule day was not found."));
    }

    @Transactional
    public ScheduleTaskResponse replaceNoShow(
        String loginId,
        UUID scheduleDayUuid,
        LocalDate workDate,
        ReplaceNoShowRequest request
    ) {
        String normalizedLoginId = normalizeLoginId(loginId);
        UUID agencyOwnerUuid = findAgencyOwnerUuid(normalizedLoginId);
        if (!scheduleDao.scheduleDayBelongsToAgencyOwner(agencyOwnerUuid, scheduleDayUuid)) {
            throw new IllegalArgumentException("Schedule day was not found.");
        }
        if (request.originalAssignmentUuid() == null || request.replacementWorkerProfileUuid() == null) {
            throw new IllegalArgumentException("No-show replacement is invalid.");
        }
        if (!scheduleDao.workerProfileBelongsToAgencyOwner(
            agencyOwnerUuid,
            request.replacementWorkerProfileUuid()
        )) {
            throw new IllegalArgumentException("Replacement worker was not found.");
        }

        UUID accountUuid = scheduleDao.findAccountUuidByLoginId(normalizedLoginId)
            .orElseThrow(() -> new IllegalArgumentException("Account was not found."));
        scheduleDao.replaceNoShow(
            agencyOwnerUuid,
            accountUuid,
            scheduleDayUuid,
            request.originalAssignmentUuid(),
            request.replacementWorkerProfileUuid()
        );

        return scheduleDao.findTask(agencyOwnerUuid, scheduleDayUuid, workDate)
            .orElseThrow(() -> new IllegalArgumentException("Schedule day was not found."));
    }

    @Transactional
    public ScheduleTaskResponse changeNoShowReplacement(
        String loginId,
        UUID scheduleDayUuid,
        LocalDate workDate,
        ReplaceNoShowRequest request
    ) {
        NoShowRequestContext context = validateNoShowRequest(loginId, scheduleDayUuid, request);
        scheduleDao.changeNoShowReplacement(
            context.agencyOwnerUuid(),
            context.accountUuid(),
            scheduleDayUuid,
            request.originalAssignmentUuid(),
            request.replacementWorkerProfileUuid()
        );
        return scheduleDao.findTask(context.agencyOwnerUuid(), scheduleDayUuid, workDate)
            .orElseThrow(() -> new IllegalArgumentException("Schedule day was not found."));
    }

    @Transactional
    public ScheduleTaskResponse cancelNoShow(
        String loginId,
        UUID scheduleDayUuid,
        UUID originalAssignmentUuid,
        LocalDate workDate
    ) {
        String normalizedLoginId = normalizeLoginId(loginId);
        UUID agencyOwnerUuid = findAgencyOwnerUuid(normalizedLoginId);
        if (!scheduleDao.scheduleDayBelongsToAgencyOwner(agencyOwnerUuid, scheduleDayUuid)) {
            throw new IllegalArgumentException("Schedule day was not found.");
        }
        UUID accountUuid = scheduleDao.findAccountUuidByLoginId(normalizedLoginId)
            .orElseThrow(() -> new IllegalArgumentException("Account was not found."));
        scheduleDao.cancelNoShow(
            agencyOwnerUuid,
            accountUuid,
            scheduleDayUuid,
            originalAssignmentUuid
        );
        return scheduleDao.findTask(agencyOwnerUuid, scheduleDayUuid, workDate)
            .orElseThrow(() -> new IllegalArgumentException("Schedule day was not found."));
    }

    private NoShowRequestContext validateNoShowRequest(
        String loginId,
        UUID scheduleDayUuid,
        ReplaceNoShowRequest request
    ) {
        String normalizedLoginId = normalizeLoginId(loginId);
        UUID agencyOwnerUuid = findAgencyOwnerUuid(normalizedLoginId);
        if (!scheduleDao.scheduleDayBelongsToAgencyOwner(agencyOwnerUuid, scheduleDayUuid)) {
            throw new IllegalArgumentException("Schedule day was not found.");
        }
        if (request.originalAssignmentUuid() == null || request.replacementWorkerProfileUuid() == null) {
            throw new IllegalArgumentException("No-show replacement is invalid.");
        }
        if (!scheduleDao.workerProfileBelongsToAgencyOwner(
            agencyOwnerUuid,
            request.replacementWorkerProfileUuid()
        )) {
            throw new IllegalArgumentException("Replacement worker was not found.");
        }
        UUID accountUuid = scheduleDao.findAccountUuidByLoginId(normalizedLoginId)
            .orElseThrow(() -> new IllegalArgumentException("Account was not found."));
        return new NoShowRequestContext(accountUuid, agencyOwnerUuid);
    }

    private record NoShowRequestContext(UUID accountUuid, UUID agencyOwnerUuid) {
    }

    private void validateGuestParticipantRequest(
        UUID agencyOwnerUuid,
        AddGuestParticipantsRequest request
    ) {
        if (request.participantCount() < 1 || request.participantCount() > 100) {
            throw new IllegalArgumentException("Guest participant count is invalid.");
        }
        if (request.introducedByWorkerProfileUuid() != null
            && !scheduleDao.workerProfileBelongsToAgencyOwner(
                agencyOwnerUuid,
                request.introducedByWorkerProfileUuid()
            )) {
            throw new IllegalArgumentException("Introducing worker profile was not found.");
        }
        validateTimeRange(request.plannedStartTime(), request.plannedEndTime());
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
