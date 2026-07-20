package com.laborflow.core.schedule.dto;

import java.util.UUID;

public record ReplaceNoShowRequest(
    UUID originalAssignmentUuid,
    UUID replacementWorkerProfileUuid
) {
}
