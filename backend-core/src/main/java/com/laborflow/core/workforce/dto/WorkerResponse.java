package com.laborflow.core.workforce.dto;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public record WorkerResponse(
    UUID profileUuid,
    String name,
    String nickname,
    String phone,
    Integer age,
    String gender,
    String memo,
    String pickupLocation,
    boolean isActive,
    int availableDaysMask,
    String availabilityMemo,
    UUID teamUuid,
    String teamName,
    String teamRole,
    int teamDisplayOrder,
    List<String> workTypeCodes,
    Map<String, Integer> workTypeRatings
) {
}
