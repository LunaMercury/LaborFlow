package com.laborflow.core.schedule.api;

import com.laborflow.core.schedule.application.ScheduleService;
import com.laborflow.core.schedule.dto.AddGuestParticipantsRequest;
import com.laborflow.core.schedule.dto.CreateScheduleTaskRequest;
import com.laborflow.core.schedule.dto.DeleteScheduleTaskRangeRequest;
import com.laborflow.core.schedule.dto.FarmOwnerOptionResponse;
import com.laborflow.core.schedule.dto.RescheduleTaskRangeRequest;
import com.laborflow.core.schedule.dto.ReplaceNoShowRequest;
import com.laborflow.core.schedule.dto.ScheduleTaskListResponse;
import com.laborflow.core.schedule.dto.ScheduleTaskResponse;
import com.laborflow.core.schedule.dto.UpdateScheduleTaskRequest;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/schedule")
public class ScheduleController {
    private final ScheduleService scheduleService;

    public ScheduleController(ScheduleService scheduleService) {
        this.scheduleService = scheduleService;
    }

    @GetMapping("/tasks")
    public ScheduleTaskListResponse getTasks(
        @RequestParam(defaultValue = "test") String loginId,
        @RequestParam LocalDate workDate
    ) {
        return scheduleService.getTasks(loginId, workDate);
    }

    @GetMapping("/farm-owners")
    public List<FarmOwnerOptionResponse> getFarmOwners(
        @RequestParam(defaultValue = "test") String loginId,
        @RequestParam(defaultValue = "") String query
    ) {
        return scheduleService.getFarmOwners(loginId, query);
    }

    @PostMapping("/tasks")
    public ScheduleTaskResponse createTask(
        @RequestParam(defaultValue = "test") String loginId,
        @RequestBody CreateScheduleTaskRequest request
    ) {
        return scheduleService.createTask(loginId, request);
    }

    @PutMapping("/tasks/{scheduleDayUuid}")
    public ScheduleTaskResponse updateTask(
        @PathVariable UUID scheduleDayUuid,
        @RequestParam(defaultValue = "test") String loginId,
        @RequestParam LocalDate workDate,
        @RequestBody UpdateScheduleTaskRequest request
    ) {
        return scheduleService.updateTask(loginId, scheduleDayUuid, workDate, request);
    }

    @PostMapping("/tasks/{scheduleDayUuid}/guest-participants")
    public ScheduleTaskResponse addGuestParticipants(
        @PathVariable UUID scheduleDayUuid,
        @RequestParam String loginId,
        @RequestParam LocalDate workDate,
        @RequestBody AddGuestParticipantsRequest request
    ) {
        return scheduleService.addGuestParticipants(loginId, scheduleDayUuid, workDate, request);
    }

    @PutMapping("/tasks/{scheduleDayUuid}/guest-participants/{participantGroupUuid}")
    public ScheduleTaskResponse updateGuestParticipants(
        @PathVariable UUID scheduleDayUuid,
        @PathVariable UUID participantGroupUuid,
        @RequestParam String loginId,
        @RequestParam LocalDate workDate,
        @RequestBody AddGuestParticipantsRequest request
    ) {
        return scheduleService.updateGuestParticipants(
            loginId,
            scheduleDayUuid,
            participantGroupUuid,
            workDate,
            request
        );
    }

    @DeleteMapping("/tasks/{scheduleDayUuid}/guest-participants/{participantGroupUuid}")
    public ScheduleTaskResponse deleteGuestParticipants(
        @PathVariable UUID scheduleDayUuid,
        @PathVariable UUID participantGroupUuid,
        @RequestParam String loginId,
        @RequestParam LocalDate workDate
    ) {
        return scheduleService.deleteGuestParticipants(
            loginId,
            scheduleDayUuid,
            participantGroupUuid,
            workDate
        );
    }

    @PostMapping("/tasks/{scheduleDayUuid}/no-show-replacement")
    public ScheduleTaskResponse replaceNoShow(
        @PathVariable UUID scheduleDayUuid,
        @RequestParam String loginId,
        @RequestParam LocalDate workDate,
        @RequestBody ReplaceNoShowRequest request
    ) {
        return scheduleService.replaceNoShow(loginId, scheduleDayUuid, workDate, request);
    }

    @PutMapping("/tasks/{scheduleDayUuid}/no-show-replacement")
    public ScheduleTaskResponse changeNoShowReplacement(
        @PathVariable UUID scheduleDayUuid,
        @RequestParam String loginId,
        @RequestParam LocalDate workDate,
        @RequestBody ReplaceNoShowRequest request
    ) {
        return scheduleService.changeNoShowReplacement(loginId, scheduleDayUuid, workDate, request);
    }

    @DeleteMapping("/tasks/{scheduleDayUuid}/no-show-replacement/{originalAssignmentUuid}")
    public ScheduleTaskResponse cancelNoShow(
        @PathVariable UUID scheduleDayUuid,
        @PathVariable UUID originalAssignmentUuid,
        @RequestParam String loginId,
        @RequestParam LocalDate workDate
    ) {
        return scheduleService.cancelNoShow(
            loginId,
            scheduleDayUuid,
            originalAssignmentUuid,
            workDate
        );
    }

    @PutMapping("/tasks/range")
    public void rescheduleTaskRange(
        @RequestParam(defaultValue = "test") String loginId,
        @RequestBody RescheduleTaskRangeRequest request
    ) {
        scheduleService.rescheduleTaskRange(loginId, request);
    }

    @DeleteMapping("/tasks/range")
    public void deleteTaskRange(
        @RequestParam(defaultValue = "test") String loginId,
        @RequestBody DeleteScheduleTaskRangeRequest request
    ) {
        scheduleService.deleteTaskRange(loginId, request);
    }
}
