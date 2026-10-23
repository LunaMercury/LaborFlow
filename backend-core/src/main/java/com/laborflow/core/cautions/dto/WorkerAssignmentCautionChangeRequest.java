package com.laborflow.core.cautions.dto;

import java.util.UUID;

public record WorkerAssignmentCautionChangeRequest(
    UUID uuid,
    UUID clientProfileUuid,
    String requestedBy,
    String memo,
    boolean released
) { }
