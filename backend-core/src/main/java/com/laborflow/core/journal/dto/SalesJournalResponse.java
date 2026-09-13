package com.laborflow.core.journal.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record SalesJournalResponse(
    UUID uuid,
    OffsetDateTime activityAt,
    String content,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {
}
