package com.laborflow.core.workforce.dto;

import java.util.List;
import java.util.UUID;

public record WorkerResponse(
    UUID profileUuid,
    String name,
    String nickname,
    String phone,
    String gender,
    String pickupLocation,
    UUID teamUuid,
    String teamName,
    String teamRole,
    int teamDisplayOrder,
    List<String> workTypeCodes
) {
}
