package com.laborflow.core.health.dao;

import com.laborflow.core.health.dto.HealthDependencyStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class PostgresHealthDependencyDao implements HealthDependencyDao {
    private final JdbcTemplate jdbcTemplate;

    public PostgresHealthDependencyDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public HealthDependencyStatus check() {
        try {
            jdbcTemplate.queryForObject("select 1", Integer.class);
            return new HealthDependencyStatus("postgres", "ok");
        } catch (RuntimeException ignored) {
            return new HealthDependencyStatus("postgres", "unavailable");
        }
    }
}
