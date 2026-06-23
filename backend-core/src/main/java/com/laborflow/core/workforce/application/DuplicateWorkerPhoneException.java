package com.laborflow.core.workforce.application;

public class DuplicateWorkerPhoneException extends RuntimeException {
    public DuplicateWorkerPhoneException() {
        super("이미 이 번호는 등록되어있습니다.");
    }
}
