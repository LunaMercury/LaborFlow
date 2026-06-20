package com.laborflow.core.health.dao;

import java.time.Instant;

public interface HealthStatusDao {
    String getServiceName();

    Instant getCurrentTimestamp();
}
