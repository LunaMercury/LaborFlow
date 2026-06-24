package com.laborflow.core.workforce.api;

import com.laborflow.core.workforce.application.WorkforceService;
import com.laborflow.core.workforce.dto.CreateWorkerRequest;
import com.laborflow.core.workforce.dto.UpdateWorkerIdentityRequest;
import com.laborflow.core.workforce.dto.UpdateWorkerPhoneRequest;
import com.laborflow.core.workforce.dto.UpdateWorkerPickupLocationRequest;
import com.laborflow.core.workforce.dto.UpdateWorkerGenderRequest;
import com.laborflow.core.workforce.dto.UpdateWorkerWorkTypesRequest;
import com.laborflow.core.workforce.dto.WorkTypeResponse;
import com.laborflow.core.workforce.dto.WorkerListResponse;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
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

    @PostMapping("/workers")
    public WorkerListResponse createWorker(
        @RequestParam(defaultValue = "test") String loginId,
        @RequestBody CreateWorkerRequest request
    ) {
        workforceService.createWorker(loginId, request);
        return workforceService.getWorkers(loginId);
    }

    @PatchMapping("/worker-profiles/{profileUuid}/identity")
    public WorkerListResponse updateWorkerIdentity(
        @PathVariable UUID profileUuid,
        @RequestParam(defaultValue = "test") String loginId,
        @RequestBody UpdateWorkerIdentityRequest request
    ) {
        workforceService.updateWorkerIdentity(loginId, profileUuid, request.name(), request.nickname());
        return workforceService.getWorkers(loginId);
    }

    @PatchMapping("/worker-profiles/{profileUuid}/phone")
    public WorkerListResponse updateWorkerPhone(
        @PathVariable UUID profileUuid,
        @RequestParam(defaultValue = "test") String loginId,
        @RequestBody UpdateWorkerPhoneRequest request
    ) {
        workforceService.updateWorkerPhone(loginId, profileUuid, request.phone());
        return workforceService.getWorkers(loginId);
    }

    @PatchMapping("/worker-profiles/{profileUuid}/pickup-location")
    public WorkerListResponse updateWorkerPickupLocation(
        @PathVariable UUID profileUuid,
        @RequestParam(defaultValue = "test") String loginId,
        @RequestBody UpdateWorkerPickupLocationRequest request
    ) {
        workforceService.updateWorkerPickupLocation(loginId, profileUuid, request.pickupLocation());
        return workforceService.getWorkers(loginId);
    }

    @PatchMapping("/worker-profiles/{profileUuid}/gender")
    public WorkerListResponse updateWorkerGender(
        @PathVariable UUID profileUuid,
        @RequestParam(defaultValue = "test") String loginId,
        @RequestBody UpdateWorkerGenderRequest request
    ) {
        workforceService.updateWorkerGender(loginId, profileUuid, request.gender());
        return workforceService.getWorkers(loginId);
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
