package com.laborflow.core.profile.dao;

import com.laborflow.core.profile.dto.ProfileResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcProfileDao implements ProfileDao {
    private final JdbcTemplate jdbcTemplate;

    public JdbcProfileDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public Optional<ProfileResponse> findProfileByLoginId(String loginId) {
        List<ProfileResponse> profiles = jdbcTemplate.query(
            """
            SELECT
                a.login_id,
                COALESCE(r.role_codes, '') AS role_codes,
                a.status AS account_status,
                o.name AS owner_name,
                COALESCE(o.agency_name, '') AS agency_name,
                COALESCE(s.phone_encrypted, '') AS phone,
                COALESCE(s.email_encrypted, '') AS email,
                COALESCE(s.office_phone_encrypted, '') AS office_phone,
                COALESCE(s.office_address_encrypted, '') AS office_address,
                COALESCE(s.business_registration_number_encrypted, '') AS business_registration_number,
                COALESCE(s.bank_name, '') AS bank_name,
                COALESCE(s.bank_account_encrypted, '') AS bank_account,
                COALESCE(s.bank_account_holder_name, '') AS bank_account_holder_name,
                COALESCE(a.login_notification_enabled, true) AS login_notification_enabled,
                COALESCE(a.schedule_notification_enabled, true) AS schedule_notification_enabled,
                a.updated_at::date::text AS password_updated_at
            FROM public.app_account a
            JOIN public.labor_agency_owner o
                ON o.uuid = a.labor_agency_owner_uuid
            LEFT JOIN public.labor_agency_owner_sensitive_profile s
                ON s.owner_uuid = o.uuid
            LEFT JOIN (
                SELECT account_uuid, string_agg(role_code, ',' ORDER BY role_code) AS role_codes
                FROM public.app_account_role
                GROUP BY account_uuid
            ) r ON r.account_uuid = a.uuid
            WHERE lower(a.login_id) = lower(?)
                AND a.status <> 'ARCHIVED'
            """,
            (resultSet, rowNumber) -> mapProfile(resultSet),
            loginId
        );

        return profiles.stream().findFirst();
    }

    @Override
    public void updateProfile(String loginId, ProfileUpdateValues values) {
        UUID ownerUuid = findOwnerUuidByLoginId(loginId)
            .orElseThrow(() -> new IllegalArgumentException("Profile was not found."));

        jdbcTemplate.update(
            """
            UPDATE public.app_account
            SET login_notification_enabled = ?,
                schedule_notification_enabled = ?
            WHERE lower(login_id) = lower(?)
                AND status <> 'ARCHIVED'
            """,
            values.loginNotificationEnabled(),
            values.scheduleNotificationEnabled(),
            loginId
        );

        jdbcTemplate.update(
            """
            UPDATE public.labor_agency_owner
            SET name = ?,
                agency_name = ?,
                business_registration_number_hash =
                    CASE WHEN ? IS NULL THEN NULL ELSE encode(digest(?, 'sha256'), 'hex') END
            WHERE uuid = ?
            """,
            values.ownerName(),
            values.agencyName(),
            values.businessRegistrationNumberHashSource(),
            values.businessRegistrationNumberHashSource(),
            ownerUuid
        );

        upsertSensitiveProfile(ownerUuid, values);
    }

    @Override
    public void withdrawAccount(String loginId) {
        UUID ownerUuid = findOwnerUuidByLoginId(loginId)
            .orElseThrow(() -> new IllegalArgumentException("Profile was not found."));

        jdbcTemplate.update(
            """
            UPDATE public.app_account
            SET status = 'ARCHIVED',
                must_change_password = true
            WHERE lower(login_id) = lower(?)
                AND status <> 'ARCHIVED'
            """,
            loginId
        );

        jdbcTemplate.update(
            """
            UPDATE public.labor_agency_owner
            SET status = 'ARCHIVED'
            WHERE uuid = ?
                AND status <> 'ARCHIVED'
            """,
            ownerUuid
        );
    }

    private Optional<UUID> findOwnerUuidByLoginId(String loginId) {
        List<UUID> ownerUuids = jdbcTemplate.query(
            """
            SELECT labor_agency_owner_uuid
            FROM public.app_account
            WHERE lower(login_id) = lower(?)
                AND labor_agency_owner_uuid IS NOT NULL
                AND status <> 'ARCHIVED'
            """,
            (resultSet, rowNumber) -> resultSet.getObject("labor_agency_owner_uuid", UUID.class),
            loginId
        );

        return ownerUuids.stream().findFirst();
    }

    private void upsertSensitiveProfile(UUID ownerUuid, ProfileUpdateValues values) {
        jdbcTemplate.update(
            """
            INSERT INTO public.labor_agency_owner_sensitive_profile (
                owner_uuid,
                phone_encrypted,
                phone_hash,
                bank_account_encrypted,
                bank_account_hash,
                email_encrypted,
                email_hash,
                business_registration_number_encrypted,
                extra_sensitive_information_encrypted,
                office_phone_encrypted,
                office_phone_hash,
                office_address_encrypted,
                bank_name,
                bank_account_holder_name
            )
            VALUES (
                ?,
                ?,
                CASE WHEN ? IS NULL THEN NULL ELSE encode(digest(?, 'sha256'), 'hex') END,
                ?,
                CASE WHEN ? IS NULL THEN NULL ELSE encode(digest(?, 'sha256'), 'hex') END,
                ?,
                CASE WHEN ? IS NULL THEN NULL ELSE encode(digest(?, 'sha256'), 'hex') END,
                ?,
                NULL,
                ?,
                CASE WHEN ? IS NULL THEN NULL ELSE encode(digest(?, 'sha256'), 'hex') END,
                ?,
                ?,
                ?
            )
            ON CONFLICT (owner_uuid) DO UPDATE
            SET phone_encrypted = EXCLUDED.phone_encrypted,
                phone_hash = EXCLUDED.phone_hash,
                bank_account_encrypted = EXCLUDED.bank_account_encrypted,
                bank_account_hash = EXCLUDED.bank_account_hash,
                email_encrypted = EXCLUDED.email_encrypted,
                email_hash = EXCLUDED.email_hash,
                business_registration_number_encrypted = EXCLUDED.business_registration_number_encrypted,
                office_phone_encrypted = EXCLUDED.office_phone_encrypted,
                office_phone_hash = EXCLUDED.office_phone_hash,
                office_address_encrypted = EXCLUDED.office_address_encrypted,
                bank_name = EXCLUDED.bank_name,
                bank_account_holder_name = EXCLUDED.bank_account_holder_name
            """,
            ownerUuid,
            values.phone(),
            values.phoneHashSource(),
            values.phoneHashSource(),
            values.bankAccount(),
            values.bankAccountHashSource(),
            values.bankAccountHashSource(),
            values.email(),
            values.emailHashSource(),
            values.emailHashSource(),
            values.businessRegistrationNumber(),
            values.officePhone(),
            values.officePhoneHashSource(),
            values.officePhoneHashSource(),
            values.officeAddress(),
            values.bankName(),
            values.bankAccountHolderName()
        );
    }

    private ProfileResponse mapProfile(ResultSet resultSet) throws SQLException {
        return new ProfileResponse(
            resultSet.getString("login_id"),
            resultSet.getString("role_codes"),
            resultSet.getString("account_status"),
            resultSet.getString("owner_name"),
            resultSet.getString("agency_name"),
            resultSet.getString("phone"),
            resultSet.getString("email"),
            resultSet.getString("office_phone"),
            resultSet.getString("office_address"),
            resultSet.getString("business_registration_number"),
            resultSet.getString("bank_name"),
            resultSet.getString("bank_account"),
            resultSet.getString("bank_account_holder_name"),
            resultSet.getBoolean("login_notification_enabled"),
            resultSet.getBoolean("schedule_notification_enabled"),
            resultSet.getString("password_updated_at"),
            "DISABLED"
        );
    }
}
