package com.laborflow.core.noshow.api;

import com.laborflow.core.noshow.application.NoShowService;
import com.laborflow.core.noshow.dto.NoShowDtos.*;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/no-show/incidents")
public class NoShowController {
    private final NoShowService service;
    public NoShowController(NoShowService service) { this.service = service; }
    @GetMapping public Incidents list(@RequestParam String loginId,
        @RequestParam(required = false) UUID workerProfileUuid, @RequestParam(required = false) LocalDate workDate) {
        return service.list(loginId, workerProfileUuid, workDate);
    }
    @PostMapping public Incident create(@RequestParam String loginId, @RequestBody Create request) {
        return service.create(loginId, request);
    }
    @PatchMapping("/{uuid}") public Incident update(@RequestParam String loginId, @PathVariable UUID uuid, @RequestBody Update request) {
        return service.update(loginId, uuid, request);
    }
    @PostMapping("/{uuid}/cancel") public Incident cancel(@RequestParam String loginId, @PathVariable UUID uuid, @RequestBody Cancel request) {
        return service.cancel(loginId, uuid, request);
    }
}
