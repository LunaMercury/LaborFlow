package com.laborflow.core.workforce.dto;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.time.LocalDate;

public record WorkerResponse(
    UUID profileUuid,
    String name,
    String nickname,
    String phone,
    Integer age,
    String gender,
    String memo,
    String pickupLocation,
    boolean isActive,
    int availableDaysMask,
    String availabilityMemo,
    String bankCode,
    String bankName,
    String accountNumber,
    String accountHolderName,
    String paymentVerificationStatus,
    UUID teamUuid,
    String teamName,
    String teamRole,
    int teamDisplayOrder,
    LocalDate lastWorkedDate,
    int totalWorkDays,
    List<String> workTypeCodes,
    Map<String, Integer> workTypeRatings
) {
}
