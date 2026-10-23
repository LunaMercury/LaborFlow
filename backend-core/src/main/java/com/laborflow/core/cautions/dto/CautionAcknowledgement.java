package com.laborflow.core.cautions.dto;

import java.time.Instant;
import java.util.UUID;

public record CautionAcknowledgement(UUID uuid, Instant updatedAt) { }
