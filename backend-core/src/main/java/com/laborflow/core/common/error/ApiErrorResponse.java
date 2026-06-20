package com.laborflow.core.common.error;

import java.time.Instant;

public record ApiErrorResponse(
    String code,
    String message,
    Instant timestamp
) {
}
