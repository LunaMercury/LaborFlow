package com.laborflow.core.health.dao;

import java.time.Clock;
import java.time.Instant;
import org.springframework.stereotype.Repository;

@Repository
public class SystemHealthStatusDao implements HealthStatusDao {
    private static final String SERVICE_NAME = "backend-core";

    private final Clock clock;

    public SystemHealthStatusDao() {
        this(Clock.systemUTC());
    }

    SystemHealthStatusDao(Clock clock) {
        this.clock = clock;
    }

    @Override
    public String getServiceName() {
        return SERVICE_NAME;
    }

    @Override
    public Instant getCurrentTimestamp() {
        return Instant.now(clock);
    }
}
