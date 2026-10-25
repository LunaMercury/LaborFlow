package com.laborflow.core.noshow.application;

public class NoShowException extends RuntimeException {
    public NoShowException(String safeMessage) { super(safeMessage); }
}
