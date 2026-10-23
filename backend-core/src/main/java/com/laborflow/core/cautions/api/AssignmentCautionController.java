package com.laborflow.core.cautions.api;

import com.laborflow.core.cautions.application.AssignmentCautionService;
import com.laborflow.core.cautions.dto.AssignmentCautionResponse;
import com.laborflow.core.cautions.dto.SaveAssignmentCautionRequest;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/assignment-cautions")
public class AssignmentCautionController {
    private final AssignmentCautionService service;
    public AssignmentCautionController(AssignmentCautionService service) { this.service = service; }
    @GetMapping
    public List<AssignmentCautionResponse> list(@RequestParam String loginId,
        @RequestParam(required = false) UUID workerProfileUuid, @RequestParam(required = false) UUID clientProfileUuid,
        @RequestParam(required = false) UUID farmOwnerUuid) {
        return service.list(loginId, workerProfileUuid, clientProfileUuid, farmOwnerUuid);
    }
    @PostMapping
    public AssignmentCautionResponse create(@RequestParam String loginId, @RequestBody SaveAssignmentCautionRequest request) {
        return service.save(loginId, null, request);
    }
    @PutMapping("/{uuid}")
    public AssignmentCautionResponse update(@RequestParam String loginId, @PathVariable UUID uuid, @RequestBody SaveAssignmentCautionRequest request) {
        return service.save(loginId, uuid, request);
    }
    @DeleteMapping("/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void release(@RequestParam String loginId, @PathVariable UUID uuid) { service.release(loginId, uuid); }
}
