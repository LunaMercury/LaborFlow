package com.laborflow.core.health.dto;

public record HealthDependencyStatus(
    String name,
    String status
) {
    public boolean available() {
        return "ok".equals(status);
    }
}
