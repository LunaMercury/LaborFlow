package com.laborflow.core.common.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebCorsConfig implements WebMvcConfigurer {
    private final String allowedOrigins;
    private final String allowedOriginPatterns;

    public WebCorsConfig(
        @Value("${laborflow.web.allowed-origins:http://localhost:5580,http://127.0.0.1:5580}") String allowedOrigins,
        @Value("${laborflow.web.allowed-origin-patterns:http://localhost:*,http://127.0.0.1:*}") String allowedOriginPatterns
    ) {
        this.allowedOrigins = allowedOrigins;
        this.allowedOriginPatterns = allowedOriginPatterns;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
            .allowedOrigins(splitCsv(allowedOrigins))
            .allowedOriginPatterns(splitCsv(allowedOriginPatterns))
            .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
            .allowedHeaders("*")
            .maxAge(3600);
    }

    private String[] splitCsv(String value) {
        return value == null || value.isBlank()
            ? new String[0]
            : java.util.Arrays.stream(value.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isBlank())
                .toArray(String[]::new);
    }
}
