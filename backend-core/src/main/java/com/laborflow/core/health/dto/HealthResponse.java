package com.laborflow.core.health.dto;

import java.time.Instant;
import java.util.List;

public record HealthResponse(
    String service,
    String status,
    Instant timestamp,
    List<HealthDependencyStatus> dependencies
) {
}
