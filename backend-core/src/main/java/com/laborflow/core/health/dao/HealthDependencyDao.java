package com.laborflow.core.health.dao;

import com.laborflow.core.health.dto.HealthDependencyStatus;

public interface HealthDependencyDao {
    HealthDependencyStatus check();
}
