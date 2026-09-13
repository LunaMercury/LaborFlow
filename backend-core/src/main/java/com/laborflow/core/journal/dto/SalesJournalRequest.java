package com.laborflow.core.journal.dto;

import java.time.LocalDateTime;

public record SalesJournalRequest(
    LocalDateTime activityAt,
    String content
) {
}
