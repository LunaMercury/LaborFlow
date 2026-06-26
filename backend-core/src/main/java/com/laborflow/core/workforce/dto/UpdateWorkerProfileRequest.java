package com.laborflow.core.workforce.dto;

import java.util.List;
import java.util.Map;

public record UpdateWorkerProfileRequest(
    String name,
    String nickname,
    String phone,
    Integer age,
    String gender,
    String pickupLocation,
    String memo,
    List<String> workTypeCodes,
    Map<String, Integer> workTypeRatings
) {
}
