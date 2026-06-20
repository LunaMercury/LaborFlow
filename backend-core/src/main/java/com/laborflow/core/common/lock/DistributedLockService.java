package com.laborflow.core.common.lock;

import java.time.Duration;
import java.util.Optional;

public interface DistributedLockService {
    Optional<LockToken> tryAcquire(String lockName, String resourceKey, Duration ttl);

    void release(LockToken lockToken);
}
