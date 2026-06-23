package com.laborflow.core.workforce.dto;

import java.util.List;
import java.util.UUID;

public record WorkerResponse(
    UUID profileUuid,
    String name,
    String nickname,
    String phone,
    String pickupLocation,
    List<String> workTypeCodes
) {
}
