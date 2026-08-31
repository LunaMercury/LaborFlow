package com.laborflow.core.common.error;

import com.laborflow.core.workforce.dto.WorkerSeparationRuleResponse;
import java.time.Instant;
import java.util.List;

public record WorkerSeparationConflictResponse(
    String code,
    String message,
    Instant timestamp,
    List<WorkerSeparationRuleResponse> conflicts
) {
}
