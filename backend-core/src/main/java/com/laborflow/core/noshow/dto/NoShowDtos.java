package com.laborflow.core.noshow.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class NoShowDtos {
    private NoShowDtos() { }
    public record Create(UUID assignmentUuid, String note) { }
    public record Update(String note) { }
    public record Cancel(String reason) { }
    public record Revision(String action, String note, OffsetDateTime createdAt, UUID performedByAccountUuid) { }
    public record Incident(UUID uuid, UUID originalAssignmentUuid, UUID scheduleDayUuid, LocalDate workDate,
        UUID workerProfileUuid, String workerName, String ownerName, String siteName, String workTitle,
        String status, String note, UUID replacementWorkerProfileUuid, String replacementWorkerName,
        UUID replacementAssignmentUuid, OffsetDateTime createdAt, OffsetDateTime updatedAt,
        OffsetDateTime cancelledAt, List<Revision> revisions) { }
    public record Incidents(List<Incident> incidents) { }
}
