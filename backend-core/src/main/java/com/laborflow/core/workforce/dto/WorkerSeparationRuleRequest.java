package com.laborflow.core.workforce.dto;

import java.util.UUID;

public record WorkerSeparationRuleRequest(
    UUID otherWorkerProfileUuid,
    String reason
) {
}
