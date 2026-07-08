package com.laborflow.core.profile.application;

import com.laborflow.core.profile.dao.ProfileDao;
import com.laborflow.core.profile.dao.ProfileUpdateValues;
import com.laborflow.core.profile.dto.ProfileResponse;
import com.laborflow.core.profile.dto.UpdateProfileRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProfileService {
    private final ProfileDao profileDao;

    public ProfileService(ProfileDao profileDao) {
        this.profileDao = profileDao;
    }

    public ProfileResponse getProfile(String loginId) {
        return profileDao.findProfileByLoginId(normalizeLoginId(loginId))
            .orElseThrow(() -> new IllegalArgumentException("Profile was not found."));
    }

    @Transactional
    public ProfileResponse updateProfile(String loginId, UpdateProfileRequest request) {
        String normalizedLoginId = normalizeLoginId(loginId);
        String ownerName = normalizeRequiredText(request.ownerName());
        String businessRegistrationNumber = normalizeBusinessRegistrationNumber(request.businessRegistrationNumber());
        String phone = normalizeRequiredPhone(request.phone(), 10, 11);
        String officePhone = normalizePhone(request.officePhone(), 8, 11);
        String bankAccount = normalizeBankAccount(request.bankAccount());
        String email = normalizeEmail(request.email());

        profileDao.updateProfile(
            normalizedLoginId,
            new ProfileUpdateValues(
                ownerName,
                normalizeOptionalText(request.agencyName()),
                phone,
                hashSource(phone),
                email,
                hashSource(email == null ? null : email.toLowerCase()),
                officePhone,
                hashSource(officePhone),
                normalizeOptionalText(request.officeAddress()),
                businessRegistrationNumber,
                hashSource(businessRegistrationNumber),
                normalizeOptionalText(request.bankName()),
                bankAccount,
                hashSource(bankAccount),
                normalizeOptionalText(request.bankAccountHolderName()),
                request.loginNotificationEnabled() == null || request.loginNotificationEnabled(),
                request.scheduleNotificationEnabled() == null || request.scheduleNotificationEnabled()
            )
        );

        return getProfile(normalizedLoginId);
    }

    @Transactional
    public void withdrawAccount(String loginId) {
        profileDao.withdrawAccount(normalizeLoginId(loginId));
    }

    private String normalizeLoginId(String loginId) {
        if (loginId == null || loginId.isBlank()) {
            return "test";
        }

        return loginId.trim();
    }

    private String normalizeRequiredText(String value) {
        String normalizedValue = normalizeOptionalText(value);
        if (normalizedValue == null) {
            throw new IllegalArgumentException("Required value is missing.");
        }

        return normalizedValue;
    }

    private String normalizeOptionalText(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        return value.trim();
    }

    private String normalizeEmail(String email) {
        String normalizedEmail = normalizeOptionalText(email);
        if (normalizedEmail == null) {
            return null;
        }

        if (!normalizedEmail.contains("@") || normalizedEmail.startsWith("@") || normalizedEmail.endsWith("@")) {
            throw new IllegalArgumentException("Email is invalid.");
        }

        return normalizedEmail;
    }

    private String normalizePhone(String phone, int minLength, int maxLength) {
        String normalizedPhone = normalizeOptionalText(phone);
        if (normalizedPhone == null) {
            return null;
        }

        String digits = normalizedPhone.replaceAll("\\D", "");
        if (digits.length() < minLength || digits.length() > maxLength) {
            throw new IllegalArgumentException("Phone number is invalid.");
        }

        return digits;
    }

    private String normalizeRequiredPhone(String phone, int minLength, int maxLength) {
        String normalizedPhone = normalizePhone(phone, minLength, maxLength);
        if (normalizedPhone == null) {
            throw new IllegalArgumentException("Phone number is required.");
        }

        return normalizedPhone;
    }

    private String normalizeBusinessRegistrationNumber(String businessRegistrationNumber) {
        String normalizedNumber = normalizeOptionalText(businessRegistrationNumber);
        if (normalizedNumber == null) {
            return null;
        }

        String digits = normalizedNumber.replaceAll("\\D", "");
        if (digits.length() != 10) {
            throw new IllegalArgumentException("Business registration number is invalid.");
        }

        return digits;
    }

    private String normalizeBankAccount(String bankAccount) {
        String normalizedAccount = normalizeOptionalText(bankAccount);
        if (normalizedAccount == null) {
            return null;
        }

        String digits = normalizedAccount.replaceAll("\\D", "");
        if (digits.length() < 8 || digits.length() > 20) {
            throw new IllegalArgumentException("Bank account number is invalid.");
        }

        return digits;
    }

    private String hashSource(String value) {
        return value == null ? null : value;
    }
}
