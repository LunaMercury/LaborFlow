package com.laborflow.core.common.error;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.laborflow.core.clients.application.DuplicateClientPhoneException;
import com.laborflow.core.workforce.application.DuplicateWorkerPhoneException;
import com.laborflow.core.workforce.application.InvalidWorkerPhoneException;
import com.laborflow.core.workforce.application.WorkerSeparationConflictException;
import com.laborflow.core.workforce.dto.WorkerSeparationRuleResponse;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

class GlobalExceptionHandlerHttpContractTest {
    private static final String HIDDEN_VALIDATION_DETAIL = "validation-detail-must-not-leak";
    private static final String HIDDEN_RUNTIME_DETAIL = "runtime-detail-must-not-leak";
    private static final UUID RULE_UUID = UUID.fromString("10000000-0000-4000-8000-000000000001");
    private static final UUID WORKER_A_UUID = UUID.fromString("20000000-0000-4000-8000-000000000001");
    private static final UUID WORKER_B_UUID = UUID.fromString("30000000-0000-4000-8000-000000000001");

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new ThrowingController())
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();
    }

    @Test
    void returnsConflictDetailsForWorkerSeparationConflict() throws Exception {
        MvcResult result = expectError(
            mockMvc.perform(get("/test/errors/worker-separation")),
            409,
            "WORKER_SEPARATION_CONFLICT",
            "동시 배치 주의 작업자가 포함되어 있습니다."
        )
            .andExpect(jsonPath("$.conflicts").isArray())
            .andExpect(jsonPath("$.conflicts.length()").value(1))
            .andExpect(jsonPath("$.conflicts[0].ruleUuid").value(RULE_UUID.toString()))
            .andExpect(jsonPath("$.conflicts[0].workerProfileUuidA").value(WORKER_A_UUID.toString()))
            .andExpect(jsonPath("$.conflicts[0].workerNameA").value("가상 작업자 A"))
            .andExpect(jsonPath("$.conflicts[0].workerProfileUuidB").value(WORKER_B_UUID.toString()))
            .andExpect(jsonPath("$.conflicts[0].workerNameB").value("가상 작업자 B"))
            .andExpect(jsonPath("$.conflicts[0].reason").value("같은 현장 배치 전 확인"))
            .andReturn();

        assertResponseFields(result, "code", "message", "timestamp", "conflicts");
    }

    @Test
    void returnsConflictForDuplicateWorkerPhoneBeforeRuntimeFallback() throws Exception {
        MvcResult result = expectError(
            mockMvc.perform(get("/test/errors/duplicate-worker-phone")),
            409,
            "DUPLICATE_WORKER_PHONE",
            "이미 이 번호는 등록되어있습니다."
        ).andReturn();

        assertStandardErrorShape(result);
    }

    @Test
    void returnsConflictForDuplicateClientPhoneBeforeRuntimeFallback() throws Exception {
        MvcResult result = expectError(
            mockMvc.perform(get("/test/errors/duplicate-client-phone")),
            409,
            "DUPLICATE_CLIENT_PHONE",
            "이미 등록된 거래처 전화번호입니다."
        ).andReturn();

        assertStandardErrorShape(result);
    }

    @Test
    void returnsBadRequestForInvalidWorkerPhoneBeforeRuntimeFallback() throws Exception {
        MvcResult result = expectError(
            mockMvc.perform(get("/test/errors/invalid-worker-phone")),
            400,
            "INVALID_WORKER_PHONE",
            "전화번호는 숫자 11자리로 입력해주세요."
        ).andReturn();

        assertStandardErrorShape(result);
    }

    @Test
    void hidesIllegalArgumentExceptionDetailInBadRequestResponse() throws Exception {
        MvcResult result = expectError(
            mockMvc.perform(get("/test/errors/illegal-argument")),
            400,
            "BAD_REQUEST",
            "Request could not be processed."
        )
            .andExpect(content().string(org.hamcrest.Matchers.not(
                org.hamcrest.Matchers.containsString(HIDDEN_VALIDATION_DETAIL)
            )))
            .andReturn();

        assertStandardErrorShape(result);
    }

    @Test
    void hidesUnhandledRuntimeExceptionDetailInInternalServerErrorResponse() throws Exception {
        MvcResult result = expectError(
            mockMvc.perform(get("/test/errors/runtime")),
            500,
            "INTERNAL_SERVER_ERROR",
            "Request could not be processed."
        )
            .andExpect(content().string(org.hamcrest.Matchers.not(
                org.hamcrest.Matchers.containsString(HIDDEN_RUNTIME_DETAIL)
            )))
            .andReturn();

        assertStandardErrorShape(result);
    }

    private ResultActions expectError(
        ResultActions result,
        int expectedStatus,
        String expectedCode,
        String expectedMessage
    ) throws Exception {
        return result
            .andExpect(status().is(expectedStatus))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.code").value(expectedCode))
            .andExpect(jsonPath("$.message").value(expectedMessage))
            .andExpect(jsonPath("$.timestamp").isString());
    }

    private void assertStandardErrorShape(MvcResult result) throws Exception {
        assertResponseFields(result, "code", "message", "timestamp");
    }

    @SuppressWarnings("unchecked")
    private void assertResponseFields(MvcResult result, String... expectedFields) throws Exception {
        String body = result.getResponse().getContentAsString();
        Map<String, Object> response = JsonPath.parse(body).read("$", Map.class);
        String timestamp = JsonPath.read(body, "$.timestamp");

        assertThat(response.keySet()).containsExactlyInAnyOrderElementsOf(Set.of(expectedFields));
        assertThatCode(() -> Instant.parse(timestamp)).doesNotThrowAnyException();
    }

    @RestController
    @RequestMapping("/test/errors")
    static class ThrowingController {
        @GetMapping("/worker-separation")
        void workerSeparation() {
            throw new WorkerSeparationConflictException(List.of(new WorkerSeparationRuleResponse(
                RULE_UUID,
                WORKER_A_UUID,
                "가상 작업자 A",
                WORKER_B_UUID,
                "가상 작업자 B",
                "같은 현장 배치 전 확인"
            )));
        }

        @GetMapping("/duplicate-worker-phone")
        void duplicateWorkerPhone() {
            throw new DuplicateWorkerPhoneException();
        }

        @GetMapping("/duplicate-client-phone")
        void duplicateClientPhone() {
            throw new DuplicateClientPhoneException();
        }

        @GetMapping("/invalid-worker-phone")
        void invalidWorkerPhone() {
            throw new InvalidWorkerPhoneException();
        }

        @GetMapping("/illegal-argument")
        void illegalArgument() {
            throw new IllegalArgumentException(HIDDEN_VALIDATION_DETAIL);
        }

        @GetMapping("/runtime")
        void runtime() {
            throw new RuntimeException(HIDDEN_RUNTIME_DETAIL);
        }
    }
}
