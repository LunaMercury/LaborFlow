package com.laborflow.core.workforce.dto;

import java.util.List;
import java.util.Map;

public record UpdateWorkerWorkTypesRequest(
    List<String> workTypeCodes,
    Map<String, Integer> workTypeRatings
) {
}
