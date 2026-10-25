package com.laborflow.core.finance.api;

import com.laborflow.core.finance.application.FinanceException;
import com.laborflow.core.finance.dto.FinanceDtos.Error;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes=FinanceController.class)
public class FinanceExceptionHandler {
    @ExceptionHandler(FinanceException.class) public ResponseEntity<Error> finance(FinanceException e) {
        return ResponseEntity.status(e.status()).body(new Error(e.code(),e.getMessage()));
    }
    @ExceptionHandler({HttpMessageNotReadableException.class,MethodArgumentTypeMismatchException.class,
        MissingServletRequestParameterException.class,IllegalArgumentException.class})
    public ResponseEntity<Error> input(Exception e) {
        return ResponseEntity.badRequest().body(new Error("FINANCE_VALIDATION","Check the supplied amounts, dates, UUIDs and required fields."));
    }
    @ExceptionHandler(DataAccessException.class) public ResponseEntity<Error> database(DataAccessException e) {
        return ResponseEntity.status(409).body(new Error("FINANCE_CONFLICT","Finance data could not be saved. Refresh and check the balance and source history."));
    }
    @ExceptionHandler(RuntimeException.class) public ResponseEntity<Error> unexpected(RuntimeException e) {
        return ResponseEntity.internalServerError().body(new Error("FINANCE_UNAVAILABLE","Finance is temporarily unavailable. Refresh and check the record before retrying."));
    }
}
