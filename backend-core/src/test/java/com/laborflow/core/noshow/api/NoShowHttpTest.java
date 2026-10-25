package com.laborflow.core.noshow.api;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.laborflow.core.common.error.GlobalExceptionHandler;
import com.laborflow.core.noshow.application.NoShowException;
import com.laborflow.core.noshow.application.NoShowService;
import com.laborflow.core.noshow.dto.NoShowDtos.Cancel;
import com.laborflow.core.noshow.dto.NoShowDtos.Create;
import com.laborflow.core.noshow.dto.NoShowDtos.Incident;
import com.laborflow.core.noshow.dto.NoShowDtos.Incidents;
import com.laborflow.core.noshow.dto.NoShowDtos.Revision;
import com.laborflow.core.noshow.dto.NoShowDtos.Update;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class NoShowHttpTest {
    private static final String BASE = "/api/no-show/incidents";
    private static final String LOGIN_ID = "sample-office";
    private static final LocalDate WORK_DATE = LocalDate.of(2024, 3, 15);
    private static final UUID ASSIGNMENT = UUID.fromString("10000000-0000-4000-8000-000000000001");
    private static final UUID INCIDENT = UUID.fromString("20000000-0000-4000-8000-000000000001");
    private static final UUID WORKER = UUID.fromString("30000000-0000-4000-8000-000000000001");
    private static final UUID DAY = UUID.fromString("40000000-0000-4000-8000-000000000001");
    private static final UUID ACCOUNT = UUID.fromString("50000000-0000-4000-8000-000000000001");
    private static final OffsetDateTime CREATED_AT = OffsetDateTime.parse("2024-03-15T08:00:00+09:00");
    private static final String PRIVATE_FAILURE = "SQL secret-token private worker phone 010-0000-1234";

    private NoShowService service;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        service = mock(NoShowService.class);
        mvc = MockMvcBuilders.standaloneSetup(new NoShowController(service))
            .setControllerAdvice(new GlobalExceptionHandler(), new NoShowExceptionHandler())
            .build();
    }

    @Test
    void getHistoryForwardsOfficeWorkerAndDateAndSerializesRevisionFacts() throws Exception {
        when(service.list(LOGIN_ID, WORKER, WORK_DATE))
            .thenReturn(new Incidents(List.of(incident(WORKER, "OPEN", "saved note"))));

        mvc.perform(request("list"))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.incidents[0].uuid").value(INCIDENT.toString()))
            .andExpect(jsonPath("$.incidents[0].originalAssignmentUuid").value(ASSIGNMENT.toString()))
            .andExpect(jsonPath("$.incidents[0].scheduleDayUuid").value(DAY.toString()))
            .andExpect(jsonPath("$.incidents[0].workerProfileUuid").value(WORKER.toString()))
            .andExpect(jsonPath("$.incidents[0].workDate").value(WORK_DATE.toString()))
            .andExpect(jsonPath("$.incidents[0].status").value("OPEN"))
            .andExpect(jsonPath("$.incidents[0].note").value("saved note"))
            .andExpect(jsonPath("$.incidents[0].revisions[0].action").value("CREATED"))
            .andExpect(jsonPath("$.incidents[0].revisions[0].note").value("first line\nsecond line"))
            .andExpect(jsonPath("$.incidents[0].revisions[0].performedByAccountUuid").value(ACCOUNT.toString()))
            .andExpect(jsonPath("$.incidents[0].revisions[0].createdAt").isNotEmpty());

        verify(service).list(LOGIN_ID, WORKER, WORK_DATE);
    }

    @Test
    void getDateHistorySupportsGuestWithoutWorkerQueryParameter() throws Exception {
        when(service.list(LOGIN_ID, null, WORK_DATE))
            .thenReturn(new Incidents(List.of(incident(null, "OPEN", null))));

        mvc.perform(get(BASE).param("loginId", LOGIN_ID).param("workDate", WORK_DATE.toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.incidents[0].workerProfileUuid").value(nullValue()))
            .andExpect(jsonPath("$.incidents[0].workerName").value("Guest"))
            .andExpect(jsonPath("$.incidents[0].note").value(nullValue()));

        verify(service).list(LOGIN_ID, null, WORK_DATE);
    }

    @Test
    void getWorkerHistoryAllowsOmittedDateAndEmptyResults() throws Exception {
        when(service.list(LOGIN_ID, WORKER, null)).thenReturn(new Incidents(List.of()));

        mvc.perform(get(BASE).param("loginId", LOGIN_ID).param("workerProfileUuid", WORKER.toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.incidents").isEmpty());

        verify(service).list(LOGIN_ID, WORKER, null);
    }

    @Test
    void postCreateBindsAssignmentAndNoteAndReturnsIncident() throws Exception {
        when(service.create(LOGIN_ID, new Create(ASSIGNMENT, "new note")))
            .thenReturn(incident(WORKER, "OPEN", "new note"));

        mvc.perform(request("create"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.uuid").value(INCIDENT.toString()))
            .andExpect(jsonPath("$.note").value("new note"))
            .andExpect(jsonPath("$.status").value("OPEN"));

        verify(service).create(LOGIN_ID, new Create(ASSIGNMENT, "new note"));
    }

    @Test
    void postCreateAllowsOmittedNoteForGuestIncident() throws Exception {
        when(service.create(LOGIN_ID, new Create(ASSIGNMENT, null)))
            .thenReturn(incident(null, "OPEN", null));

        mvc.perform(post(BASE).param("loginId", LOGIN_ID).contentType(MediaType.APPLICATION_JSON)
                .content("{\"assignmentUuid\":\"" + ASSIGNMENT + "\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.workerProfileUuid").value(nullValue()))
            .andExpect(jsonPath("$.note").value(nullValue()));

        verify(service).create(LOGIN_ID, new Create(ASSIGNMENT, null));
    }

    @Test
    void patchNoteBindsPathAndNoteAndReturnsUpdatedIncident() throws Exception {
        when(service.update(LOGIN_ID, INCIDENT, new Update("new note")))
            .thenReturn(incident(WORKER, "OPEN", "new note"));

        mvc.perform(request("update"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.uuid").value(INCIDENT.toString()))
            .andExpect(jsonPath("$.note").value("new note"));

        verify(service).update(LOGIN_ID, INCIDENT, new Update("new note"));
    }

    @Test
    void patchExplicitNullNoteRemainsNullInsteadOfString() throws Exception {
        when(service.update(LOGIN_ID, INCIDENT, new Update(null)))
            .thenReturn(incident(WORKER, "OPEN", null));

        mvc.perform(patch(BASE + "/" + INCIDENT).param("loginId", LOGIN_ID)
                .contentType(MediaType.APPLICATION_JSON).content("{\"note\":null}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.note").value(nullValue()));

        verify(service).update(LOGIN_ID, INCIDENT, new Update(null));
    }

    @Test
    void postCancelBindsPathAndReasonAndReturnsCancelledIncident() throws Exception {
        when(service.cancel(LOGIN_ID, INCIDENT, new Cancel("reason")))
            .thenReturn(incident(WORKER, "CANCELLED", "original note"));

        mvc.perform(request("cancel"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.uuid").value(INCIDENT.toString()))
            .andExpect(jsonPath("$.status").value("CANCELLED"))
            .andExpect(jsonPath("$.note").value("original note"))
            .andExpect(jsonPath("$.cancelledAt").isNotEmpty());

        verify(service).cancel(LOGIN_ID, INCIDENT, new Cancel("reason"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"list", "create", "update", "cancel"})
    void allRoutesReturnNoShowValidation400WithReadableSafeMessage(String route) throws Exception {
        String message = "해당 노쇼 기록 또는 배정을 찾을 수 없습니다.";
        stubFailure(route, new NoShowException(message));

        mvc.perform(request(route))
            .andExpect(status().isBadRequest())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.code").value("NO_SHOW_VALIDATION"))
            .andExpect(jsonPath("$.message").value(message))
            .andExpect(jsonPath("$.timestamp").isNotEmpty())
            .andExpect(jsonPath("$.incidents").doesNotExist())
            .andExpect(jsonPath("$.stackTrace").doesNotExist());
    }

    @ParameterizedTest
    @ValueSource(strings = {"list", "create", "update", "cancel"})
    void allRoutesHideInternalValidationDetailsAsNoShow400(String route) throws Exception {
        stubFailure(route, new IllegalArgumentException(PRIVATE_FAILURE));

        assertSafeFailure(request(route), 400, "NO_SHOW_VALIDATION", "조회 대상과 입력 내용을 확인해 주세요.");
    }

    @ParameterizedTest
    @ValueSource(strings = {"list", "create", "update", "cancel"})
    void allRoutesHideDatabaseDetailsAsNoShowConflict409(String route) throws Exception {
        stubFailure(route, new DataIntegrityViolationException(PRIVATE_FAILURE));

        assertSafeFailure(request(route), 409, "NO_SHOW_CONFLICT",
            "노쇼 기록을 저장하지 못했습니다. 최신 근태와 배정 상태를 확인한 뒤 다시 시도해 주세요.");
    }

    @ParameterizedTest
    @ValueSource(strings = {"list", "create", "update", "cancel"})
    void allRoutesHideUnexpectedDetailsAsNoShowUnavailable500(String route) throws Exception {
        stubFailure(route, new IllegalStateException(PRIVATE_FAILURE));

        assertSafeFailure(request(route), 500, "NO_SHOW_UNAVAILABLE",
            "노쇼 기록을 처리하지 못했습니다. 새로고침하여 저장 여부를 확인해 주세요.");
    }

    @ParameterizedTest
    @ValueSource(strings = {"worker-uuid", "date", "update-uuid", "cancel-uuid", "assignment-uuid",
        "create-json", "update-json", "cancel-json"})
    void malformedInputsUseScopedSafe400WithoutCallingService(String input) throws Exception {
        MockHttpServletRequestBuilder malformed = switch (input) {
            case "worker-uuid" -> get(BASE).param("workerProfileUuid", "not-a-uuid");
            case "date" -> get(BASE).param("workDate", "not-a-date");
            case "update-uuid" -> patch(BASE + "/not-a-uuid").contentType(MediaType.APPLICATION_JSON)
                .content("{\"note\":null}");
            case "cancel-uuid" -> post(BASE + "/not-a-uuid/cancel").contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"reason\"}");
            case "assignment-uuid" -> post(BASE).contentType(MediaType.APPLICATION_JSON)
                .content("{\"assignmentUuid\":\"not-a-uuid\"}");
            case "create-json" -> post(BASE).contentType(MediaType.APPLICATION_JSON).content("{not-json");
            case "update-json" -> patch(BASE + "/" + INCIDENT).contentType(MediaType.APPLICATION_JSON)
                .content("{not-json");
            case "cancel-json" -> post(BASE + "/" + INCIDENT + "/cancel").contentType(MediaType.APPLICATION_JSON)
                .content("{not-json");
            default -> throw new AssertionError("Unknown malformed input: " + input);
        };

        assertSafeFailure(malformed.param("loginId", LOGIN_ID), 400,
            "NO_SHOW_VALIDATION", "조회 대상과 입력 내용을 확인해 주세요.");
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(strings = {"list", "create", "update", "cancel"})
    void allRoutesRequireLoginWithScopedSafe400(String route) throws Exception {
        assertSafeFailure(requestWithoutLogin(route), 400,
            "NO_SHOW_VALIDATION", "조회 대상과 입력 내용을 확인해 주세요.");
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(strings = {"create", "update", "cancel"})
    void missingBodiesUseScopedSafe400WithoutCallingService(String route) throws Exception {
        MockHttpServletRequestBuilder missingBody = switch (route) {
            case "create" -> post(BASE);
            case "update" -> patch(BASE + "/" + INCIDENT);
            case "cancel" -> post(BASE + "/" + INCIDENT + "/cancel");
            default -> throw new AssertionError("Unknown body route: " + route);
        };

        assertSafeFailure(missingBody.param("loginId", LOGIN_ID).contentType(MediaType.APPLICATION_JSON),
            400, "NO_SHOW_VALIDATION", "조회 대상과 입력 내용을 확인해 주세요.");
        verifyNoInteractions(service);
    }

    private void assertSafeFailure(MockHttpServletRequestBuilder request, int expectedStatus,
        String code, String message) throws Exception {
        mvc.perform(request)
            .andExpect(status().is(expectedStatus))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.code").value(code))
            .andExpect(jsonPath("$.message").value(message))
            .andExpect(jsonPath("$.timestamp").isNotEmpty())
            .andExpect(jsonPath("$.stackTrace").doesNotExist())
            .andExpect(content().string(not(containsString("SQL"))))
            .andExpect(content().string(not(containsString("secret-token"))))
            .andExpect(content().string(not(containsString("010-0000-1234"))))
            .andExpect(content().string(not(containsString("not-a-uuid"))))
            .andExpect(content().string(not(containsString("not-a-date"))))
            .andExpect(content().string(not(containsString("not-json"))));
    }

    private MockHttpServletRequestBuilder request(String route) {
        return requestWithoutLogin(route).param("loginId", LOGIN_ID);
    }

    private MockHttpServletRequestBuilder requestWithoutLogin(String route) {
        return switch (route) {
            case "list" -> get(BASE)
                .param("workerProfileUuid", WORKER.toString()).param("workDate", WORK_DATE.toString());
            case "create" -> post(BASE).contentType(MediaType.APPLICATION_JSON)
                .content("{\"assignmentUuid\":\"" + ASSIGNMENT + "\",\"note\":\"new note\"}");
            case "update" -> patch(BASE + "/" + INCIDENT)
                .contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"new note\"}");
            case "cancel" -> post(BASE + "/" + INCIDENT + "/cancel")
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"reason\"}");
            default -> throw new AssertionError("Unknown test route: " + route);
        };
    }

    private void stubFailure(String route, RuntimeException failure) {
        switch (route) {
            case "list" -> doThrow(failure).when(service).list(LOGIN_ID, WORKER, WORK_DATE);
            case "create" -> doThrow(failure).when(service).create(LOGIN_ID, new Create(ASSIGNMENT, "new note"));
            case "update" -> doThrow(failure).when(service).update(LOGIN_ID, INCIDENT, new Update("new note"));
            case "cancel" -> doThrow(failure).when(service).cancel(LOGIN_ID, INCIDENT, new Cancel("reason"));
            default -> throw new AssertionError("Unknown test route: " + route);
        }
    }

    private Incident incident(UUID worker, String status, String note) {
        return new Incident(INCIDENT, ASSIGNMENT, DAY, WORK_DATE, worker,
            worker == null ? "Guest" : "Sample worker", "Sample client", "Sample site", "Harvest",
            status, note, null, null, null, CREATED_AT, CREATED_AT,
            "CANCELLED".equals(status) ? CREATED_AT : null,
            List.of(new Revision("CREATED", "first line\nsecond line", CREATED_AT, ACCOUNT)));
    }
}
