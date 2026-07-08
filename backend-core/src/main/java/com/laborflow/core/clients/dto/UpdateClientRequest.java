package com.laborflow.core.clients.dto;

public record UpdateClientRequest(
    String name,
    String nickname,
    String businessName,
    String phone,
    String bankAccount,
    String memo
) {
}
