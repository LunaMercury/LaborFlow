package com.laborflow.core;

import java.time.Instant;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class HealthController {
    @GetMapping("/api/health")
    Map<String, String> health() {
        return Map.of(
            "service", "backend-core",
            "status", "ok",
            "timestamp", Instant.now().toString()
        );
    }
}
