package com.laborflow.core.clients.dto;

import java.util.UUID;

public record ClientWorkSiteResponse(
    UUID uuid,
    String siteName,
    String farmAddress,
    String workDescription,
    String workDateRange
) {
}
