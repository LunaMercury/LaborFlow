package com.laborflow.core.clients.dto;

import java.util.List;

public record UpdateClientRequest(
    String name,
    String nickname,
    String businessName,
    String phone,
    String bankAccount,
    String memo,
    List<ClientWorkSiteRequest> workSites
) {
}
