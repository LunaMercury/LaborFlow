package com.laborflow.core.workforce.application;

import com.laborflow.core.workforce.dto.WorkerSeparationRuleResponse;
import java.util.List;

public class WorkerSeparationConflictException extends RuntimeException {
    private final List<WorkerSeparationRuleResponse> conflicts;

    public WorkerSeparationConflictException(List<WorkerSeparationRuleResponse> conflicts) {
        super("Workers requiring separate assignment were found.");
        this.conflicts = List.copyOf(conflicts);
    }

    public List<WorkerSeparationRuleResponse> getConflicts() {
        return conflicts;
    }
}
