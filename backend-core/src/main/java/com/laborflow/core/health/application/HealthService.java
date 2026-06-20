package com.laborflow.core.health.application;

import com.laborflow.core.health.dao.HealthDependencyDao;
import com.laborflow.core.health.dao.HealthStatusDao;
import com.laborflow.core.health.dto.HealthDependencyStatus;
import com.laborflow.core.health.dto.HealthResponse;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class HealthService {
    private final HealthStatusDao healthStatusDao;
    private final List<HealthDependencyDao> healthDependencyDaos;

    public HealthService(HealthStatusDao healthStatusDao, List<HealthDependencyDao> healthDependencyDaos) {
        this.healthStatusDao = healthStatusDao;
        this.healthDependencyDaos = List.copyOf(healthDependencyDaos);
    }

    public HealthResponse getHealth() {
        List<HealthDependencyStatus> dependencies = healthDependencyDaos.stream()
            .map(HealthDependencyDao::check)
            .toList();

        return new HealthResponse(
            healthStatusDao.getServiceName(),
            dependencies.stream().allMatch(HealthDependencyStatus::available) ? "ok" : "degraded",
            healthStatusDao.getCurrentTimestamp(),
            dependencies
        );
    }
}
