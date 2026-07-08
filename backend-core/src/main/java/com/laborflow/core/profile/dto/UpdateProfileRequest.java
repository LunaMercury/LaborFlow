package com.laborflow.core.profile.dto;

public record UpdateProfileRequest(
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
    Boolean loginNotificationEnabled,
    Boolean scheduleNotificationEnabled
) {
}
