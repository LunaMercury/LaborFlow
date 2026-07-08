package com.laborflow.core.profile.dao;

public record ProfileUpdateValues(
    String ownerName,
    String agencyName,
    String phone,
    String phoneHashSource,
    String email,
    String emailHashSource,
    String officePhone,
    String officePhoneHashSource,
    String officeAddress,
    String businessRegistrationNumber,
    String businessRegistrationNumberHashSource,
    String bankName,
    String bankAccount,
    String bankAccountHashSource,
    String bankAccountHolderName,
    boolean loginNotificationEnabled,
    boolean scheduleNotificationEnabled
) {
}
