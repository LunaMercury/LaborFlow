package com.laborflow.core.cautions.dto;

import java.time.Instant;
import java.util.UUID;

public record AssignmentCautionResponse(
    UUID uuid, UUID workerProfileUuid, UUID clientProfileUuid, UUID farmOwnerUuid,
    String workerName, String clientName, String requestedBy, String memo,
    Instant createdAt, Instant updatedAt, UUID createdByAccountUuid, UUID updatedByAccountUuid
) { }
