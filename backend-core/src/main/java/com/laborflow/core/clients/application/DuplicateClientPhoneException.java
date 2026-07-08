package com.laborflow.core.clients.application;

public class DuplicateClientPhoneException extends RuntimeException {
    public DuplicateClientPhoneException() {
        super("이미 등록된 거래처 전화번호입니다.");
    }
}
