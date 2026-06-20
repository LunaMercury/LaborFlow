package com.laborflow.core.health.dao;

import com.laborflow.core.health.dto.HealthDependencyStatus;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class RedisHealthDependencyDao implements HealthDependencyDao {
    private final StringRedisTemplate redisTemplate;

    public RedisHealthDependencyDao(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @Override
    public HealthDependencyStatus check() {
        try {
            String pong = redisTemplate.execute((RedisCallback<String>) connection -> connection.ping());
            return "PONG".equalsIgnoreCase(pong)
                ? new HealthDependencyStatus("redis", "ok")
                : new HealthDependencyStatus("redis", "unavailable");
        } catch (RuntimeException ignored) {
            return new HealthDependencyStatus("redis", "unavailable");
        }
    }
}
