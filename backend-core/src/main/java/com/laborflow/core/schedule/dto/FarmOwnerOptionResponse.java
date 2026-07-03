package com.laborflow.core.schedule.dto;

import java.util.UUID;

public record FarmOwnerOptionResponse(
    UUID uuid,
    String displayName,
    String businessName
) {
}
