package com.laborflow.core.finance.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import tools.jackson.databind.json.JsonMapper;

public final class FinanceJson {
    private static final JsonMapper MAPPER = JsonMapper.builder().build();
    private FinanceJson() { }
    public static String write(Object value) { return MAPPER.writeValueAsString(value); }
    public static <T> T read(String value, Class<T> type) { return MAPPER.readValue(value, type); }
    public static String hash(Object value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(write(value).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }
}
