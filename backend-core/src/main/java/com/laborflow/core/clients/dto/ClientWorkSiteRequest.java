package com.laborflow.core.clients.dto;

import java.util.UUID;

public record ClientWorkSiteRequest(
    UUID uuid,
    String siteName,
    String farmAddress,
    String memo
) {
}
