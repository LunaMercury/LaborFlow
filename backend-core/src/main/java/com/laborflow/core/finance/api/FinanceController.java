package com.laborflow.core.finance.api;

import com.laborflow.core.finance.application.FinanceService;
import com.laborflow.core.finance.dto.FinanceDtos.*;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/finance")
public class FinanceController {
    private final FinanceService service;
    public FinanceController(FinanceService service) { this.service=service; }
    @GetMapping("/work") public WorkList listWork(@RequestParam String loginId,
        @RequestParam(required=false) LocalDate fromDate,@RequestParam(required=false) LocalDate toDate) {
        return service.listWork(loginId,fromDate,toDate);
    }
    @PostMapping("/work/{scheduleDayUuid}/prepare") public Work prepare(@RequestParam String loginId,@PathVariable UUID scheduleDayUuid) {
        return service.prepareWork(loginId,scheduleDayUuid);
    }
    @GetMapping("/work/{workUuid}") public Work getWork(@RequestParam String loginId,@PathVariable UUID workUuid) {
        return service.getWork(loginId,workUuid);
    }
    @PutMapping("/work/{workUuid}") public Work saveWork(@RequestParam String loginId,@PathVariable UUID workUuid,@RequestBody SaveWork body) {
        return service.saveWork(loginId,workUuid,body);
    }
    @GetMapping("/balances") public Balances balances(@RequestParam String loginId,@RequestParam String kind,@RequestParam(defaultValue="ALL") String filter) {
        return service.getBalances(loginId,kind,filter);
    }
    @GetMapping("/cash") public CashList cash(@RequestParam String loginId,@RequestParam(required=false) String kind,
        @RequestParam(required=false) LocalDate fromDate,@RequestParam(required=false) LocalDate toDate) {
        return service.listCash(loginId,kind,fromDate,toDate);
    }
    @PostMapping("/cash") public Cash record(@RequestParam String loginId,@RequestBody RecordCash body) { return service.recordCash(loginId,body); }
    @PostMapping("/cash/{cashUuid}/cancel") public Cash cancel(@RequestParam String loginId,@PathVariable UUID cashUuid,@RequestBody CancelCash body) {
        return service.cancelCash(loginId,cashUuid,body);
    }
    @PostMapping("/cash/{cashUuid}/correct") public Cash correct(@RequestParam String loginId,@PathVariable UUID cashUuid,@RequestBody CorrectCash body) {
        return service.correctCash(loginId,cashUuid,body);
    }
    @GetMapping("/settings") public Settings settings(@RequestParam String loginId) { return service.getSettings(loginId); }
    @PutMapping("/settings") public Settings settings(@RequestParam String loginId,@RequestBody SaveSettings body) { return service.saveSettings(loginId,body); }
}
