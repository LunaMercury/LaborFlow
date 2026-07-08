package com.laborflow.core.clients.dto;

import java.util.List;
import java.util.UUID;

public record ClientResponse(
    UUID profileUuid,
    UUID farmOwnerUuid,
    String name,
    String nickname,
    String businessName,
    String phone,
    String bankAccount,
    String memo,
    List<ClientWorkSiteResponse> workSites
) {
}
