package com.laborflow.core.finance.application;

public class FinanceException extends RuntimeException {
    private final int status;
    private final String code;
    public FinanceException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }
    public int status() { return status; }
    public String code() { return code; }
    public static FinanceException invalid(String message) { return new FinanceException(400, "FINANCE_VALIDATION", message); }
    public static FinanceException conflict(String message) { return new FinanceException(409, "FINANCE_CONFLICT", message); }
    public static FinanceException missing() { return new FinanceException(404, "FINANCE_NOT_FOUND", "Requested finance record is unavailable."); }
}
