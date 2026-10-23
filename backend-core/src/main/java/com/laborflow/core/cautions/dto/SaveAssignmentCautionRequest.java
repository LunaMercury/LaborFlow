package com.laborflow.core.cautions.dto;

import java.util.UUID;

public record SaveAssignmentCautionRequest(
    UUID workerProfileUuid, UUID clientProfileUuid, String requestedBy, String memo
) { }
