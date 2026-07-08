package com.laborflow.core.profile.dao;

import com.laborflow.core.profile.dto.ProfileResponse;
import java.util.Optional;

public interface ProfileDao {
    Optional<ProfileResponse> findProfileByLoginId(String loginId);

    void updateProfile(String loginId, ProfileUpdateValues values);

    void withdrawAccount(String loginId);
}
