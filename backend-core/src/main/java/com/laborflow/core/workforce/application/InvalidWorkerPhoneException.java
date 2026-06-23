package com.laborflow.core.workforce.application;

public class InvalidWorkerPhoneException extends RuntimeException {
    public InvalidWorkerPhoneException() {
        super("전화번호는 숫자 11자리로 입력해주세요.");
    }
}
