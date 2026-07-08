package com.laborflow.core.profile.api;

import com.laborflow.core.profile.application.ProfileService;
import com.laborflow.core.profile.dto.ProfileResponse;
import com.laborflow.core.profile.dto.UpdateProfileRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/profile")
public class ProfileController {
    private final ProfileService profileService;

    public ProfileController(ProfileService profileService) {
        this.profileService = profileService;
    }

    @GetMapping
    public ProfileResponse getProfile(@RequestParam(defaultValue = "test") String loginId) {
        return profileService.getProfile(loginId);
    }

    @PutMapping
    public ProfileResponse updateProfile(
        @RequestParam(defaultValue = "test") String loginId,
        @RequestBody UpdateProfileRequest request
    ) {
        return profileService.updateProfile(loginId, request);
    }
}
