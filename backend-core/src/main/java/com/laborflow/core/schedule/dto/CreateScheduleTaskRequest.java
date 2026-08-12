package com.laborflow.core.schedule.dto;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

public record CreateScheduleTaskRequest(
    UUID ownerUuid,
    String ownerName,
    String ownerNickname,
    String ownerPhone,
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
) {
}
