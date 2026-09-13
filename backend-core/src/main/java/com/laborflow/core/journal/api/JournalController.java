package com.laborflow.core.journal.api;

import com.laborflow.core.journal.application.JournalService;
import com.laborflow.core.journal.dto.SalesJournalRequest;
import com.laborflow.core.journal.dto.SalesJournalResponse;
import com.laborflow.core.journal.dto.WorkJournalDetailResponse;
import com.laborflow.core.journal.dto.WorkJournalSaveRequest;
import com.laborflow.core.journal.dto.WorkJournalSummaryResponse;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/journals")
public class JournalController {
    private final JournalService journalService;

    public JournalController(JournalService journalService) {
        this.journalService = journalService;
    }

    @GetMapping("/sales")
    public List<SalesJournalResponse> getSalesJournals(
        @RequestParam String loginId,
        @RequestParam(required = false) LocalDate fromDate,
        @RequestParam(required = false) LocalDate toDate,
        @RequestParam(defaultValue = "") String query
    ) {
        return journalService.getSalesJournals(loginId, fromDate, toDate, query);
    }

    @GetMapping("/sales/{journalUuid}")
    public SalesJournalResponse getSalesJournal(
        @PathVariable UUID journalUuid,
        @RequestParam String loginId
    ) {
        return journalService.getSalesJournal(loginId, journalUuid);
    }

    @PostMapping("/sales")
    public SalesJournalResponse createSalesJournal(
        @RequestParam String loginId,
        @RequestBody SalesJournalRequest request
    ) {
        return journalService.createSalesJournal(loginId, request);
    }

    @PutMapping("/sales/{journalUuid}")
    public SalesJournalResponse updateSalesJournal(
        @PathVariable UUID journalUuid,
        @RequestParam String loginId,
        @RequestBody SalesJournalRequest request
    ) {
        return journalService.updateSalesJournal(loginId, journalUuid, request);
    }

    @DeleteMapping("/sales/{journalUuid}")
    public void deleteSalesJournal(
        @PathVariable UUID journalUuid,
        @RequestParam String loginId
    ) {
        journalService.deleteSalesJournal(loginId, journalUuid);
    }

    @GetMapping("/work")
    public List<WorkJournalSummaryResponse> getWorkJournals(
        @RequestParam String loginId,
        @RequestParam(required = false) LocalDate fromDate,
        @RequestParam(required = false) LocalDate toDate,
        @RequestParam(defaultValue = "") String clientQuery
    ) {
        return journalService.getWorkJournals(loginId, fromDate, toDate, clientQuery);
    }

    @GetMapping("/work/{scheduleDayUuid}")
    public WorkJournalDetailResponse getWorkJournal(
        @PathVariable UUID scheduleDayUuid,
        @RequestParam String loginId
    ) {
        return journalService.getWorkJournal(loginId, scheduleDayUuid);
    }

    @PutMapping("/work/{scheduleDayUuid}")
    public WorkJournalDetailResponse saveWorkJournal(
        @PathVariable UUID scheduleDayUuid,
        @RequestParam String loginId,
        @RequestBody WorkJournalSaveRequest request
    ) {
        return journalService.saveWorkJournal(loginId, scheduleDayUuid, request);
    }

    @DeleteMapping("/work/{scheduleDayUuid}")
    public void deleteWorkJournal(
        @PathVariable UUID scheduleDayUuid,
        @RequestParam String loginId
    ) {
        journalService.deleteWorkJournal(loginId, scheduleDayUuid);
    }
}
