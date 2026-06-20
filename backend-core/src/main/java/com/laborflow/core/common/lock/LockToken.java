package com.laborflow.core.common.lock;

import java.time.Instant;

public record LockToken(
    String key,
    String token,
    Instant expiresAt
) {
}
