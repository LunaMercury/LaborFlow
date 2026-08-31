package com.laborflow.core.workforce.dto;

import java.util.UUID;

public record WorkerSeparationRuleResponse(
    UUID ruleUuid,
    UUID workerProfileUuidA,
    String workerNameA,
    UUID workerProfileUuidB,
    String workerNameB,
    String reason
) {
}
