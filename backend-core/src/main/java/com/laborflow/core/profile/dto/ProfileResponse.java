package com.laborflow.core.profile.dto;

public record ProfileResponse(
    String loginId,
    String accountRole,
    String accountStatus,
    String ownerName,
    String agencyName,
    String phone,
    String email,
    String officePhone,
    String officeAddress,
    String businessRegistrationNumber,
    String bankName,
    String bankAccount,
    String bankAccountHolderName,
    boolean loginNotificationEnabled,
    boolean scheduleNotificationEnabled,
    String passwordUpdatedAt,
    String twoFactorStatus
) {
}
