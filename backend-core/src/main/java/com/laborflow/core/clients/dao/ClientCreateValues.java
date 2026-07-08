package com.laborflow.core.clients.dao;

public record ClientCreateValues(
    String name,
    String nickname,
    String businessName,
    String phone,
    String phoneHashSource,
    String bankAccount,
    String bankAccountHashSource,
    String memo
) {
}
