package com.laborflow.core.workforce.dto;

public record CreateWorkerRequest(
    String localName,
    String workerName,
    String phone,
    Integer age,
    String gender,
    String pickupLocation,
    String memo
) {
}
