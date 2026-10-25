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
    UUID clientWorkSiteUuid,
    String siteName,
    String address,
    String siteMemo,
    int requiredMen,
    int requiredWomen,
    LocalTime startTime,
    LocalTime endTime,
    String memo,
    List<String> workTypeCodes,
    ScheduleChargeRates chargeRates
) {
    public CreateScheduleTaskRequest(UUID ownerUuid, String ownerName, String ownerNickname, String ownerPhone,
        LocalDate startDate, LocalDate endDate, String title, UUID clientWorkSiteUuid, String siteName,
        String address, String siteMemo, int requiredMen, int requiredWomen, LocalTime startTime,
        LocalTime endTime, String memo, List<String> workTypeCodes) {
        this(ownerUuid, ownerName, ownerNickname, ownerPhone, startDate, endDate, title, clientWorkSiteUuid,
            siteName, address, siteMemo, requiredMen, requiredWomen, startTime, endTime, memo, workTypeCodes, null);
    }
}
