package com.laborflow.core.workforce.api;

import com.laborflow.core.workforce.application.WorkforceService;
import com.laborflow.core.workforce.dto.UpdateWorkerWorkTypesRequest;
import com.laborflow.core.workforce.dto.WorkTypeResponse;
import com.laborflow.core.workforce.dto.WorkerListResponse;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/workforce")
public class WorkforceController {
    private final WorkforceService workforceService;

    public WorkforceController(WorkforceService workforceService) {
        this.workforceService = workforceService;
    }

    @GetMapping("/workers")
    public WorkerListResponse getWorkers(@RequestParam(defaultValue = "test") String loginId) {
        return workforceService.getWorkers(loginId);
    }

    @GetMapping("/work-types")
    public List<WorkTypeResponse> getWorkTypes() {
        return workforceService.getWorkTypes();
    }

    @PutMapping("/worker-profiles/{profileUuid}/work-types")
    public WorkerListResponse updateWorkerWorkTypes(
        @PathVariable UUID profileUuid,
        @RequestParam(defaultValue = "test") String loginId,
        @RequestBody UpdateWorkerWorkTypesRequest request
    ) {
        workforceService.updateWorkerWorkTypes(loginId, profileUuid, request.workTypeCodes());
        return workforceService.getWorkers(loginId);
    }
}
