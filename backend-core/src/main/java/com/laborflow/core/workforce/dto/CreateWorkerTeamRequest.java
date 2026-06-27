package com.laborflow.core.workforce.dto;

import java.util.List;
import java.util.UUID;

public record CreateWorkerTeamRequest(
    String teamName,
    List<UUID> workerProfileUuids
) {
}
