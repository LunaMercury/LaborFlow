package com.laborflow.core.noshow.api;

import com.laborflow.core.common.error.ApiErrorResponse;
import com.laborflow.core.noshow.application.NoShowException;
import java.time.Instant;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes=NoShowController.class)
public class NoShowExceptionHandler {
    @ExceptionHandler({org.springframework.http.converter.HttpMessageNotReadableException.class,
        org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class,
        org.springframework.web.bind.MissingServletRequestParameterException.class, IllegalArgumentException.class})
    public ResponseEntity<ApiErrorResponse> input(Exception e) {
        return ResponseEntity.badRequest().body(new ApiErrorResponse("NO_SHOW_VALIDATION","조회 대상과 입력 내용을 확인해 주세요.",Instant.now()));
    }
    @ExceptionHandler(NoShowException.class)
    public ResponseEntity<ApiErrorResponse> validation(NoShowException e) {
        return ResponseEntity.badRequest().body(new ApiErrorResponse("NO_SHOW_VALIDATION",e.getMessage(),Instant.now()));
    }
    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ApiErrorResponse> database(DataAccessException e) {
        return ResponseEntity.status(409).body(new ApiErrorResponse("NO_SHOW_CONFLICT","노쇼 기록을 저장하지 못했습니다. 최신 근태와 배정 상태를 확인한 뒤 다시 시도해 주세요.",Instant.now()));
    }
    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<ApiErrorResponse> unexpected(RuntimeException e) {
        return ResponseEntity.internalServerError().body(new ApiErrorResponse("NO_SHOW_UNAVAILABLE","노쇼 기록을 처리하지 못했습니다. 새로고침하여 저장 여부를 확인해 주세요.",Instant.now()));
    }
}
