package com.laborflow.core.common.config;

import java.time.Duration;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;

@Configuration
@EnableCaching
public class RedisCacheConfig {
    private static final Duration DEFAULT_CACHE_TTL = Duration.ofMinutes(5);

    @Bean
    public RedisCacheManager redisCacheManager(RedisConnectionFactory redisConnectionFactory) {
        RedisCacheConfiguration defaults = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(DEFAULT_CACHE_TTL)
            .disableCachingNullValues()
            .prefixCacheNameWith("laborflow:cache:");

        return RedisCacheManager.builder(redisConnectionFactory)
            .cacheDefaults(defaults)
            .transactionAware()
            .build();
    }
}
