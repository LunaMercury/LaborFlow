package com.laborflow.core.schedule.dto;

import java.time.LocalTime;
import java.util.UUID;

public record AddGuestParticipantsRequest(
    String area,
    int participantCount,
    String displayName,
    String pickupLocation,
    String introductionType,
    UUID introducedByWorkerProfileUuid,
    UUID settlementRecipientWorkerProfileUuid,
    LocalTime plannedStartTime,
    LocalTime plannedEndTime
) {
}
