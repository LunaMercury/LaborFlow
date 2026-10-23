package com.laborflow.core.cautions.application;

import com.laborflow.core.cautions.dto.AssignmentCautionResponse;
import java.util.List;

public class AssignmentCautionConflictException extends RuntimeException {
    private final List<AssignmentCautionResponse> conflicts;
    public AssignmentCautionConflictException(List<AssignmentCautionResponse> conflicts) {
        super("Assignment caution confirmation is required.");
        this.conflicts = List.copyOf(conflicts);
    }
    public List<AssignmentCautionResponse> getConflicts() { return conflicts; }
}
