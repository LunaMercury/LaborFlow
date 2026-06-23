package com.laborflow.core.common.error;

import com.laborflow.core.workforce.application.DuplicateWorkerPhoneException;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {
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
