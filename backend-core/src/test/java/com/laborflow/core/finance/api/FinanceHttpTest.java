package com.laborflow.core.finance.api;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.laborflow.core.common.error.GlobalExceptionHandler;
import com.laborflow.core.finance.application.FinanceException;
import com.laborflow.core.finance.application.FinanceService;
import com.laborflow.core.finance.dto.FinanceDtos.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class FinanceHttpTest {
    private FinanceService service;
    private MockMvc mvc;
    private static final UUID ID=UUID.fromString("10000000-0000-4000-8000-000000000001");
    @BeforeEach void setup() {
        service=mock(FinanceService.class);
        mvc=MockMvcBuilders.standaloneSetup(new FinanceController(service))
            .setControllerAdvice(new GlobalExceptionHandler(),new FinanceExceptionHandler()).build();
    }
    @Test void validationMessageIsReadableAndNotOverriddenByGlobalGenericHandler() throws Exception {
        when(service.getBalances("demo","PAYOUT","ALL")).thenThrow(FinanceException.invalid("Enter both charge and pay amounts."));
        mvc.perform(get("/api/finance/balances").param("loginId","demo").param("kind","PAYOUT"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("FINANCE_VALIDATION"))
            .andExpect(jsonPath("$.message").value("Enter both charge and pay amounts."));
    }
    @Test void staleAndForeignRecordsReturnConflictAndUnavailableWithoutRows() throws Exception {
        when(service.getWork("demo",ID)).thenThrow(FinanceException.missing());
        mvc.perform(get("/api/finance/work/"+ID).param("loginId","demo"))
            .andExpect(status().isNotFound()).andExpect(jsonPath("$.snapshot").doesNotExist());
        when(service.prepareWork("demo",ID)).thenThrow(FinanceException.conflict("Attendance changed. Refresh."));
        mvc.perform(post("/api/finance/work/"+ID+"/prepare").param("loginId","demo"))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.message").value("Attendance changed. Refresh."));
    }
    @Test void databaseErrorNeverExposesSqlOrPrivateRows() throws Exception {
        when(service.prepareWork("demo",ID)).thenThrow(new DataIntegrityViolationException("SQL secret account 12345 private row"));
        mvc.perform(post("/api/finance/work/"+ID+"/prepare").param("loginId","demo"))
            .andExpect(status().isConflict()).andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("12345"))))
            .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("SQL"))));
    }
    @Test void malformedAmountUuidOrMissingLoginUsesFinanceSpecificSafeErrors() throws Exception {
        mvc.perform(post("/api/finance/cash").param("loginId","demo").contentType(MediaType.APPLICATION_JSON)
            .content("{\"amount\":\"not-a-number\"}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("FINANCE_VALIDATION"));
        mvc.perform(get("/api/finance/work/not-a-uuid").param("loginId","demo"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("FINANCE_VALIDATION"));
        mvc.perform(get("/api/finance/settings"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("FINANCE_VALIDATION"));
    }
    @Test void cashBodyDeserializesUuidAmountsDateAndAllocationAndUsesOfficeContext() throws Exception {
        mvc.perform(post("/api/finance/cash").param("loginId","demo").contentType(MediaType.APPLICATION_JSON).content("""
            {"requestId":"10000000-0000-4000-8000-000000000001","kind":"DIRECT",
             "partyKey":"guest:10000000-0000-4000-8000-000000000001","cashDate":"2026-10-25",
             "amount":130000,"method":"CASH","memo":null,
             "allocations":[{"obligationUuid":"10000000-0000-4000-8000-000000000001","amount":130000}]}
            """)).andExpect(status().isOk());
        verify(service).recordCash(eq("demo"),argThat(r -> r.requestId().equals(ID) && r.kind().equals("DIRECT")
            && r.amount().compareTo(new BigDecimal("130000"))==0 && r.cashDate().equals(LocalDate.of(2026,10,25))
            && r.allocations().getFirst().obligationUuid().equals(ID)));
    }
    @Test void amountNullAndZeroRemainDifferentInJsonAndWorkDatesAreForwarded() throws Exception {
        when(service.listWork("demo",LocalDate.of(2026,10,1),LocalDate.of(2026,10,31)))
            .thenReturn(new WorkList(List.of(),new Summary(BigDecimal.ZERO,BigDecimal.ZERO,BigDecimal.ZERO,
                BigDecimal.ZERO,BigDecimal.ZERO,0,1,0,0,0,0)));
        mvc.perform(get("/api/finance/work").param("loginId","demo").param("fromDate","2026-10-01").param("toDate","2026-10-31"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.summary.officeCharge").value(0))
            .andExpect(jsonPath("$.summary.unconfirmedCount").value(1));
    }
    @Test void settledCashHistoryHasPartyAndSiteLabelsWithoutLookingUpOutstandingBalances() throws Exception {
        Cash cash=new Cash(ID,"PAYOUT",ID.toString(),LocalDate.of(2026,11,1),new BigDecimal("130000"),"CASH",null,
            List.of(new Allocation(ID,new BigDecimal("130000"),LocalDate.of(2026,10,25),"Saved field","Saved client")),
            null,ID,false,null,null,null,"Saved worker");
        when(service.listCash("demo","PAYOUT",null,null)).thenReturn(new CashList(List.of(cash)));
        mvc.perform(get("/api/finance/cash").param("loginId","demo").param("kind","PAYOUT"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].partyName").value("Saved worker"))
            .andExpect(jsonPath("$.items[0].allocations[0].workDate").value("2026-10-25"))
            .andExpect(jsonPath("$.items[0].allocations[0].siteName").value("Saved field"))
            .andExpect(jsonPath("$.items[0].allocations[0].clientName").value("Saved client"));
        verify(service,never()).getBalances(any(),any(),any());
    }
}
