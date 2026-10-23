package com.laborflow.core.cautions.api;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.laborflow.core.cautions.application.*;
import com.laborflow.core.cautions.dto.AssignmentCautionResponse;
import com.laborflow.core.common.error.GlobalExceptionHandler;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.*;

class AssignmentCautionHttpTest {
    @RestController static class ConflictController {
        @GetMapping("/test/caution") Object conflict() {
            UUID id = UUID.fromString("10000000-0000-4000-8000-000000000001");
            throw new AssignmentCautionConflictException(List.of(new AssignmentCautionResponse(id, id, id, id,
                "가상 작업자", "가상 농가", "BOTH", "가상 사유\n줄바꿈", Instant.parse("2026-10-11T01:00:00Z"),
                Instant.parse("2026-10-11T01:00:00.123456Z"), null, null)));
        }
    }
    @Test void serializesWarningAs409WithFactsAndVersion() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(new ConflictController()).setControllerAdvice(new GlobalExceptionHandler()).build();
        var result = mvc.perform(get("/test/caution")).andExpect(status().isConflict())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.code").value("ASSIGNMENT_CAUTION_CONFLICT"))
            .andExpect(jsonPath("$.message").value("배치 주의 관계를 확인해 주세요."))
            .andExpect(jsonPath("$.conflicts[0].requestedBy").value("BOTH"))
            .andExpect(jsonPath("$.conflicts[0].memo").value("가상 사유\n줄바꿈"))
            .andExpect(jsonPath("$.conflicts[0].updatedAt").value("2026-10-11T01:00:00.123456Z"))
            .andReturn();
        Instant.parse(com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.timestamp"));
    }
    @Test void releaseUsesOfficeContextAndReturnsNoBody() throws Exception {
        var service = mock(AssignmentCautionService.class);
        UUID id = UUID.fromString("10000000-0000-4000-8000-000000000001");
        var mvc = MockMvcBuilders.standaloneSetup(new AssignmentCautionController(service)).setControllerAdvice(new GlobalExceptionHandler()).build();
        mvc.perform(delete("/api/assignment-cautions/" + id).param("loginId", "sample"))
            .andExpect(status().isNoContent()).andExpect(content().string(""));
        verify(service).release("sample", id);
    }
}
