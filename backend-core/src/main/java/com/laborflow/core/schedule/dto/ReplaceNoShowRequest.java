package com.laborflow.core.schedule.dto;

import java.util.UUID;

public record ReplaceNoShowRequest(
    UUID originalAssignmentUuid,
    UUID replacementWorkerProfileUuid,
    java.util.List<com.laborflow.core.cautions.dto.CautionAcknowledgement> acknowledgedCautions
) {
    public ReplaceNoShowRequest(UUID originalAssignmentUuid, UUID replacementWorkerProfileUuid) {
        this(originalAssignmentUuid, replacementWorkerProfileUuid, java.util.List.of());
    }
}
