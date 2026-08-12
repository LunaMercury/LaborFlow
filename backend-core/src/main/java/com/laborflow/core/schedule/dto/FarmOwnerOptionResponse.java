package com.laborflow.core.schedule.dto;

import java.time.LocalTime;
import java.util.UUID;

public record FarmOwnerOptionResponse(
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
    LocalTime recentEndTime
) {
}
