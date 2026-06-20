package com.laborflow.core.common.cache;

import org.springframework.stereotype.Component;

@Component
public class RedisKeyPolicy {
    private static final String PREFIX = "laborflow";

    public String cacheKey(String cacheName, String key) {
        return "%s:cache:%s:%s".formatted(PREFIX, cacheName, key);
    }

    public String lockKey(String lockName, String key) {
        return "%s:lock:%s:%s".formatted(PREFIX, lockName, key);
    }

    public String eventKey(String streamName) {
        return "%s:event:%s".formatted(PREFIX, streamName);
    }
}
