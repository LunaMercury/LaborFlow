package com.laborflow.core.common.error;

import com.laborflow.core.clients.application.DuplicateClientPhoneException;
import com.laborflow.core.workforce.application.DuplicateWorkerPhoneException;
import com.laborflow.core.workforce.application.InvalidWorkerPhoneException;
import com.laborflow.core.workforce.application.WorkerSeparationConflictException;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(WorkerSeparationConflictException.class)
    public ResponseEntity<WorkerSeparationConflictResponse> handleWorkerSeparationConflictException(
        WorkerSeparationConflictException exception
    ) {
        WorkerSeparationConflictResponse response = new WorkerSeparationConflictResponse(
            "WORKER_SEPARATION_CONFLICT",
            "동시 배치 주의 작업자가 포함되어 있습니다.",
            Instant.now(),
            exception.getConflicts()
        );

        return ResponseEntity.status(HttpStatus.CONFLICT).body(response);
    }

    @ExceptionHandler(DuplicateWorkerPhoneException.class)
    public ResponseEntity<ApiErrorResponse> handleDuplicateWorkerPhoneException(
        DuplicateWorkerPhoneException exception
    ) {
        ApiErrorResponse response = new ApiErrorResponse(
            "DUPLICATE_WORKER_PHONE",
            exception.getMessage(),
            Instant.now()
        );

        return ResponseEntity.status(HttpStatus.CONFLICT).body(response);
    }

    @ExceptionHandler(DuplicateClientPhoneException.class)
    public ResponseEntity<ApiErrorResponse> handleDuplicateClientPhoneException(
        DuplicateClientPhoneException exception
    ) {
        ApiErrorResponse response = new ApiErrorResponse(
            "DUPLICATE_CLIENT_PHONE",
            exception.getMessage(),
            Instant.now()
        );

        return ResponseEntity.status(HttpStatus.CONFLICT).body(response);
    }

    @ExceptionHandler(InvalidWorkerPhoneException.class)
    public ResponseEntity<ApiErrorResponse> handleInvalidWorkerPhoneException(
        InvalidWorkerPhoneException exception
    ) {
        ApiErrorResponse response = new ApiErrorResponse(
            "INVALID_WORKER_PHONE",
            exception.getMessage(),
            Instant.now()
        );

        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiErrorResponse> handleIllegalArgumentException(IllegalArgumentException exception) {
        ApiErrorResponse response = new ApiErrorResponse(
            "BAD_REQUEST",
            "Request could not be processed.",
            Instant.now()
        );

        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<ApiErrorResponse> handleRuntimeException(RuntimeException exception) {
        ApiErrorResponse response = new ApiErrorResponse(
            "INTERNAL_SERVER_ERROR",
            "Request could not be processed.",
            Instant.now()
        );

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
    }
}
