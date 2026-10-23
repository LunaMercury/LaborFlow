package com.laborflow.core.cautions.dao;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

class JdbcAssignmentCautionDaoTest {
    @Test void persistenceFailuresCannotCarryARowMemoToTheGlobalExceptionLogger() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.update(anyString(), any(Object[].class)))
            .thenThrow(new DataIntegrityViolationException("synthetic-private-caution-row"));
        var dao = new JdbcAssignmentCautionDao(jdbc);
        UUID uuid = UUID.fromString("10000000-0000-4000-8000-000000000001");
        assertThatThrownBy(() -> dao.release(uuid, uuid, uuid))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("Assignment caution persistence failed.")
            .hasNoCause();
    }
}
