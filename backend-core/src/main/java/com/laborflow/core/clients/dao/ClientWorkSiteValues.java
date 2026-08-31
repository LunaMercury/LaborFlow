package com.laborflow.core.clients.dao;

import java.util.UUID;

public record ClientWorkSiteValues(
    UUID uuid,
    String siteName,
    String farmAddress,
    String memo,
    int displayOrder
) {
}
