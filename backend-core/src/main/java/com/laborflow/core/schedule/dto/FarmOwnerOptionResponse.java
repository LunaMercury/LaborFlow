package com.laborflow.core.schedule.dto;

import com.laborflow.core.clients.dto.ClientWorkSiteResponse;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

public record FarmOwnerOptionResponse(
    UUID profileUuid,
    UUID uuid,
    String displayName,
    String name,
    String nickname,
    String businessName,
    String phone,
    String recentTitle,
    String recentSiteName,
    String recentAddress,
    LocalTime recentStartTime,
    LocalTime recentEndTime,
    List<ClientWorkSiteResponse> workSites
) {
}
