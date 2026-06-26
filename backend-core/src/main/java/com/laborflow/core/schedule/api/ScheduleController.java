package com.laborflow.core.schedule.api;

import com.laborflow.core.schedule.application.ScheduleService;
import com.laborflow.core.schedule.dto.ScheduleTaskListResponse;
import com.laborflow.core.schedule.dto.ScheduleTaskResponse;
import com.laborflow.core.schedule.dto.UpdateScheduleTaskRequest;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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

    @PutMapping("/tasks/{scheduleDayUuid}")
    public ScheduleTaskResponse updateTask(
        @PathVariable UUID scheduleDayUuid,
        @RequestParam(defaultValue = "test") String loginId,
        @RequestParam LocalDate workDate,
        @RequestBody UpdateScheduleTaskRequest request
    ) {
        return scheduleService.updateTask(loginId, scheduleDayUuid, workDate, request);
    }
}
