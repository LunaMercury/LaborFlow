package com.laborflow.core.clients.dao;

import com.laborflow.core.clients.dto.ClientResponse;
import com.laborflow.core.clients.dto.ClientWorkSiteResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcClientsDao implements ClientsDao {
    private final JdbcTemplate jdbcTemplate;

    public JdbcClientsDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public List<ClientResponse> findClientsByLoginId(String loginId) {
        List<ClientProjection> clients = jdbcTemplate.query(
            """
            SELECT
                fp.uuid AS profile_uuid,
                fo.uuid AS farm_owner_uuid,
                COALESCE(fp.local_name, fo.canonical_name, '') AS name,
                COALESCE(fp.local_nickname, '') AS nickname,
                COALESCE(fp.local_business_name, fo.canonical_business_name, '') AS business_name,
                COALESCE(fp.local_phone_encrypted, '') AS phone,
                COALESCE(fp.local_bank_account_encrypted, '') AS bank_account,
                COALESCE(fp.private_memo, '') AS memo
            FROM public.labor_agency_farm_owner_profile fp
            JOIN public.farm_owner fo ON fo.uuid = fp.farm_owner_uuid
            JOIN public.app_account a ON a.labor_agency_owner_uuid = fp.agency_owner_uuid
            WHERE lower(a.login_id) = lower(?)
                AND a.status = 'ACTIVE'
                AND fp.status = 'ACTIVE'
                AND fp.deleted_at IS NULL
                AND fo.status = 'ACTIVE'
                AND fo.deleted_at IS NULL
            ORDER BY
                COALESCE(NULLIF(fp.local_name, ''), NULLIF(fp.local_nickname, ''), NULLIF(fp.local_business_name, ''), fo.canonical_name, ''),
                fp.created_at
            """,
            (resultSet, rowNumber) -> mapClientProjection(resultSet),
            loginId
        );

        if (clients.isEmpty()) {
            return List.of();
        }

        Map<UUID, List<ClientWorkSiteResponse>> workSitesByProfileUuid = findWorkSitesByProfileUuid(
            clients.stream().map(ClientProjection::profileUuid).toList()
        );

        return clients.stream()
            .map(client -> new ClientResponse(
                client.profileUuid(),
                client.farmOwnerUuid(),
                client.name(),
                client.nickname(),
                client.businessName(),
                client.phone(),
                client.bankAccount(),
                client.memo(),
                workSitesByProfileUuid.getOrDefault(client.profileUuid(), List.of())
            ))
            .toList();
    }

    @Override
    public Optional<UUID> findAgencyOwnerUuidByLoginId(String loginId) {
        List<UUID> ownerUuids = jdbcTemplate.query(
            """
            SELECT labor_agency_owner_uuid
            FROM public.app_account
            WHERE lower(login_id) = lower(?)
                AND labor_agency_owner_uuid IS NOT NULL
                AND status = 'ACTIVE'
            """,
            (resultSet, rowNumber) -> resultSet.getObject("labor_agency_owner_uuid", UUID.class),
            loginId
        );

        return ownerUuids.stream().findFirst();
    }

    @Override
    public Optional<UUID> findFarmOwnerUuidByPhoneHashSource(String phoneHashSource) {
        List<UUID> ownerUuids = jdbcTemplate.query(
            """
            SELECT owner_uuid
            FROM public.farm_owner_sensitive_profile
            WHERE phone_hash = encode(digest(?::text, 'sha256'), 'hex')
            """,
            (resultSet, rowNumber) -> resultSet.getObject("owner_uuid", UUID.class),
            phoneHashSource
        );

        return ownerUuids.stream().findFirst();
    }

    @Override
    public boolean clientProfileExists(UUID agencyOwnerUuid, UUID farmOwnerUuid) {
        Integer count = jdbcTemplate.queryForObject(
            """
            SELECT count(*)
            FROM public.labor_agency_farm_owner_profile
            WHERE agency_owner_uuid = ?
                AND farm_owner_uuid = ?
                AND status = 'ACTIVE'
                AND deleted_at IS NULL
            """,
            Integer.class,
            agencyOwnerUuid,
            farmOwnerUuid
        );

        return count != null && count > 0;
    }

    @Override
    public boolean clientPhoneExists(UUID agencyOwnerUuid, UUID farmOwnerUuid) {
        Integer count = jdbcTemplate.queryForObject(
            """
            SELECT COUNT(*)
            FROM public.labor_agency_farm_owner_profile
            WHERE agency_owner_uuid = ?
                AND farm_owner_uuid = ?
                AND status = 'ACTIVE'
                AND deleted_at IS NULL
                AND local_phone_hash IS NOT NULL
            """,
            Integer.class,
            agencyOwnerUuid,
            farmOwnerUuid
        );
        return count != null && count > 0;
    }

    @Override
    public boolean localPhoneExists(UUID agencyOwnerUuid, String phoneHashSource) {
        if (phoneHashSource == null) {
            return false;
        }

        Integer count = jdbcTemplate.queryForObject(
            """
            SELECT count(*)
            FROM public.labor_agency_farm_owner_profile
            WHERE agency_owner_uuid = ?
                AND local_phone_hash = encode(digest(?::text, 'sha256'), 'hex')
                AND status = 'ACTIVE'
                AND deleted_at IS NULL
            """,
            Integer.class,
            agencyOwnerUuid,
            phoneHashSource
        );

        return count != null && count > 0;
    }

    @Override
    public boolean localPhoneExistsExceptProfile(UUID agencyOwnerUuid, UUID profileUuid, String phoneHashSource) {
        if (phoneHashSource == null) {
            return false;
        }

        Integer count = jdbcTemplate.queryForObject(
            """
            SELECT count(*)
            FROM public.labor_agency_farm_owner_profile
            WHERE agency_owner_uuid = ?
                AND uuid <> ?
                AND local_phone_hash = encode(digest(?::text, 'sha256'), 'hex')
                AND status = 'ACTIVE'
                AND deleted_at IS NULL
            """,
            Integer.class,
            agencyOwnerUuid,
            profileUuid,
            phoneHashSource
        );

        return count != null && count > 0;
    }

    @Override
    public Optional<UUID> findFarmOwnerUuidByProfileUuid(UUID agencyOwnerUuid, UUID profileUuid) {
        List<UUID> farmOwnerUuids = jdbcTemplate.query(
            """
            SELECT farm_owner_uuid
            FROM public.labor_agency_farm_owner_profile
            WHERE agency_owner_uuid = ?
                AND uuid = ?
                AND status = 'ACTIVE'
                AND deleted_at IS NULL
            """,
            (resultSet, rowNumber) -> resultSet.getObject("farm_owner_uuid", UUID.class),
            agencyOwnerUuid,
            profileUuid
        );

        return farmOwnerUuids.stream().findFirst();
    }

    @Override
    public UUID insertFarmOwner(ClientCreateValues values) {
        return jdbcTemplate.queryForObject(
            """
            INSERT INTO public.farm_owner (
                canonical_name,
                canonical_nickname,
                canonical_business_name,
                internal_memo
            )
            VALUES (?, ?, ?, ?)
            RETURNING uuid
            """,
            UUID.class,
            values.name(),
            values.nickname(),
            values.businessName(),
            values.memo()
        );
    }

    @Override
    public void upsertFarmOwnerSensitiveProfile(UUID farmOwnerUuid, ClientCreateValues values) {
        jdbcTemplate.update(
            """
            INSERT INTO public.farm_owner_sensitive_profile (
                owner_uuid,
                phone_encrypted,
                phone_hash,
                bank_account_encrypted,
                bank_account_hash
            )
            VALUES (
                ?,
                ?,
                CASE WHEN ?::text IS NULL THEN NULL ELSE encode(digest(?::text, 'sha256'), 'hex') END,
                ?,
                CASE WHEN ?::text IS NULL THEN NULL ELSE encode(digest(?::text, 'sha256'), 'hex') END
            )
            ON CONFLICT (owner_uuid) DO UPDATE
            SET phone_encrypted = COALESCE(EXCLUDED.phone_encrypted, farm_owner_sensitive_profile.phone_encrypted),
                phone_hash = COALESCE(EXCLUDED.phone_hash, farm_owner_sensitive_profile.phone_hash),
                bank_account_encrypted = COALESCE(EXCLUDED.bank_account_encrypted, farm_owner_sensitive_profile.bank_account_encrypted),
                bank_account_hash = COALESCE(EXCLUDED.bank_account_hash, farm_owner_sensitive_profile.bank_account_hash),
                updated_at = now()
            """,
            farmOwnerUuid,
            values.phone(),
            values.phoneHashSource(),
            values.phoneHashSource(),
            values.bankAccount(),
            values.bankAccountHashSource(),
            values.bankAccountHashSource()
        );
    }

    @Override
    public UUID insertClientProfile(UUID agencyOwnerUuid, UUID farmOwnerUuid, ClientCreateValues values) {
        return jdbcTemplate.queryForObject(
            """
            INSERT INTO public.labor_agency_farm_owner_profile (
                agency_owner_uuid,
                farm_owner_uuid,
                local_name,
                local_nickname,
                local_business_name,
                local_phone_encrypted,
                local_phone_hash,
                local_bank_account_encrypted,
                local_bank_account_hash,
                private_memo,
                status
            )
            VALUES (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                CASE WHEN ?::text IS NULL THEN NULL ELSE encode(digest(?::text, 'sha256'), 'hex') END,
                ?,
                CASE WHEN ?::text IS NULL THEN NULL ELSE encode(digest(?::text, 'sha256'), 'hex') END,
                ?,
                'ACTIVE'
            )
            RETURNING uuid
            """,
            UUID.class,
            agencyOwnerUuid,
            farmOwnerUuid,
            values.name(),
            values.nickname(),
            values.businessName(),
            values.phone(),
            values.phoneHashSource(),
            values.phoneHashSource(),
            values.bankAccount(),
            values.bankAccountHashSource(),
            values.bankAccountHashSource(),
            values.memo()
        );
    }

    @Override
    public void addClientPhone(
        UUID agencyOwnerUuid,
        UUID farmOwnerUuid,
        String phone,
        String phoneHashSource
    ) {
        jdbcTemplate.update(
            """
            UPDATE public.labor_agency_farm_owner_profile
            SET local_phone_encrypted = ?,
                local_phone_hash = encode(digest(?::text, 'sha256'), 'hex'),
                updated_at = now()
            WHERE agency_owner_uuid = ?
                AND farm_owner_uuid = ?
                AND status = 'ACTIVE'
                AND deleted_at IS NULL
                AND local_phone_hash IS NULL
            """,
            phone,
            phoneHashSource,
            agencyOwnerUuid,
            farmOwnerUuid
        );
    }

    @Override
    public void addFarmOwnerPhone(UUID farmOwnerUuid, String phone, String phoneHashSource) {
        jdbcTemplate.update(
            """
            INSERT INTO public.farm_owner_sensitive_profile (
                owner_uuid,
                phone_encrypted,
                phone_hash
            )
            VALUES (?, ?, encode(digest(?::text, 'sha256'), 'hex'))
            ON CONFLICT (owner_uuid) DO UPDATE
            SET phone_encrypted = COALESCE(farm_owner_sensitive_profile.phone_encrypted, EXCLUDED.phone_encrypted),
                phone_hash = COALESCE(farm_owner_sensitive_profile.phone_hash, EXCLUDED.phone_hash),
                updated_at = now()
            """,
            farmOwnerUuid,
            phone,
            phoneHashSource
        );
    }

    @Override
    public void updateClientProfile(UUID agencyOwnerUuid, UUID profileUuid, ClientCreateValues values) {
        jdbcTemplate.update(
            """
            UPDATE public.labor_agency_farm_owner_profile
            SET local_name = ?,
                local_nickname = ?,
                local_business_name = ?,
                local_phone_encrypted = ?,
                local_phone_hash = CASE WHEN ?::text IS NULL THEN NULL ELSE encode(digest(?::text, 'sha256'), 'hex') END,
                local_bank_account_encrypted = ?,
                local_bank_account_hash = CASE WHEN ?::text IS NULL THEN NULL ELSE encode(digest(?::text, 'sha256'), 'hex') END,
                private_memo = ?,
                status = 'ACTIVE'
            WHERE agency_owner_uuid = ?
                AND uuid = ?
                AND status = 'ACTIVE'
                AND deleted_at IS NULL
            """,
            values.name(),
            values.nickname(),
            values.businessName(),
            values.phone(),
            values.phoneHashSource(),
            values.phoneHashSource(),
            values.bankAccount(),
            values.bankAccountHashSource(),
            values.bankAccountHashSource(),
            values.memo(),
            agencyOwnerUuid,
            profileUuid
        );
    }

    @Override
    public void replaceClientWorkSites(
        UUID agencyOwnerUuid,
        UUID profileUuid,
        List<ClientWorkSiteValues> workSites
    ) {
        Integer profileCount = jdbcTemplate.queryForObject(
            """
            SELECT count(*)
            FROM public.labor_agency_farm_owner_profile
            WHERE uuid = ?
                AND agency_owner_uuid = ?
                AND status = 'ACTIVE'
                AND deleted_at IS NULL
            """,
            Integer.class,
            profileUuid,
            agencyOwnerUuid
        );
        if (profileCount == null || profileCount == 0) {
            throw new IllegalArgumentException("Client profile was not found.");
        }

        jdbcTemplate.update(
            """
            UPDATE public.labor_agency_farm_owner_site
            SET status = 'ARCHIVED',
                deleted_at = COALESCE(deleted_at, now())
            WHERE farm_owner_profile_uuid = ?
                AND deleted_at IS NULL
            """,
            profileUuid
        );

        for (ClientWorkSiteValues workSite : workSites) {
            if (workSite.uuid() == null) {
                jdbcTemplate.update(
                    """
                    INSERT INTO public.labor_agency_farm_owner_site (
                        farm_owner_profile_uuid,
                        site_name,
                        farm_address,
                        memo,
                        display_order,
                        status
                    )
                    VALUES (?, ?, ?, ?, ?, 'ACTIVE')
                    """,
                    profileUuid,
                    workSite.siteName(),
                    workSite.farmAddress(),
                    workSite.memo(),
                    workSite.displayOrder()
                );
                continue;
            }

            int updatedCount = jdbcTemplate.update(
                """
                UPDATE public.labor_agency_farm_owner_site
                SET site_name = ?,
                    farm_address = ?,
                    memo = ?,
                    display_order = ?,
                    status = 'ACTIVE',
                    deleted_at = NULL
                WHERE uuid = ?
                    AND farm_owner_profile_uuid = ?
                """,
                workSite.siteName(),
                workSite.farmAddress(),
                workSite.memo(),
                workSite.displayOrder(),
                workSite.uuid(),
                profileUuid
            );
            if (updatedCount == 0) {
                throw new IllegalArgumentException("Client work site was not found.");
            }
        }
    }

    @Override
    public Optional<ClientWorkSiteResponse> findClientWorkSite(
        UUID agencyOwnerUuid,
        UUID farmOwnerUuid,
        UUID workSiteUuid
    ) {
        return jdbcTemplate.query(
            """
            SELECT site.uuid, site.site_name, COALESCE(site.farm_address, '') AS farm_address,
                COALESCE(site.memo, '') AS memo
            FROM public.labor_agency_farm_owner_site site
            JOIN public.labor_agency_farm_owner_profile profile
                ON profile.uuid = site.farm_owner_profile_uuid
            WHERE site.uuid = ?
                AND profile.agency_owner_uuid = ?
                AND profile.farm_owner_uuid = ?
                AND profile.status = 'ACTIVE'
                AND profile.deleted_at IS NULL
                AND site.status = 'ACTIVE'
                AND site.deleted_at IS NULL
            """,
            (resultSet, rowNumber) -> mapWorkSite(resultSet),
            workSiteUuid,
            agencyOwnerUuid,
            farmOwnerUuid
        ).stream().findFirst();
    }

    @Override
    public ClientWorkSiteResponse saveClientWorkSite(
        UUID agencyOwnerUuid,
        UUID farmOwnerUuid,
        ClientWorkSiteValues workSite
    ) {
        if (workSite.uuid() != null) {
            int updatedCount = jdbcTemplate.update(
                """
                UPDATE public.labor_agency_farm_owner_site site
                SET site_name = ?,
                    farm_address = ?,
                    memo = ?,
                    status = 'ACTIVE',
                    deleted_at = NULL
                FROM public.labor_agency_farm_owner_profile profile
                WHERE profile.uuid = site.farm_owner_profile_uuid
                    AND site.uuid = ?
                    AND profile.agency_owner_uuid = ?
                    AND profile.farm_owner_uuid = ?
                    AND profile.status = 'ACTIVE'
                    AND profile.deleted_at IS NULL
                """,
                workSite.siteName(),
                workSite.farmAddress(),
                workSite.memo(),
                workSite.uuid(),
                agencyOwnerUuid,
                farmOwnerUuid
            );
            if (updatedCount == 0) {
                throw new IllegalArgumentException("Client work site was not found.");
            }
            return findClientWorkSite(agencyOwnerUuid, farmOwnerUuid, workSite.uuid())
                .orElseThrow(() -> new IllegalArgumentException("Client work site was not found."));
        }

        List<UUID> existingUuids = jdbcTemplate.query(
            """
            SELECT site.uuid
            FROM public.labor_agency_farm_owner_site site
            JOIN public.labor_agency_farm_owner_profile profile
                ON profile.uuid = site.farm_owner_profile_uuid
            WHERE profile.agency_owner_uuid = ?
                AND profile.farm_owner_uuid = ?
                AND profile.status = 'ACTIVE'
                AND profile.deleted_at IS NULL
                AND site.status = 'ACTIVE'
                AND site.deleted_at IS NULL
                AND lower(site.site_name) = lower(?)
                AND lower(COALESCE(site.farm_address, '')) = lower(COALESCE(?, ''))
            LIMIT 1
            """,
            (resultSet, rowNumber) -> resultSet.getObject("uuid", UUID.class),
            agencyOwnerUuid,
            farmOwnerUuid,
            workSite.siteName(),
            workSite.farmAddress()
        );
        if (!existingUuids.isEmpty()) {
            return saveClientWorkSite(
                agencyOwnerUuid,
                farmOwnerUuid,
                new ClientWorkSiteValues(
                    existingUuids.getFirst(),
                    workSite.siteName(),
                    workSite.farmAddress(),
                    workSite.memo(),
                    workSite.displayOrder()
                )
            );
        }

        UUID workSiteUuid = jdbcTemplate.queryForObject(
            """
            INSERT INTO public.labor_agency_farm_owner_site (
                farm_owner_profile_uuid,
                site_name,
                farm_address,
                memo,
                display_order,
                status
            )
            SELECT profile.uuid, ?, ?, ?, ?, 'ACTIVE'
            FROM public.labor_agency_farm_owner_profile profile
            WHERE profile.agency_owner_uuid = ?
                AND profile.farm_owner_uuid = ?
                AND profile.status = 'ACTIVE'
                AND profile.deleted_at IS NULL
            RETURNING uuid
            """,
            UUID.class,
            workSite.siteName(),
            workSite.farmAddress(),
            workSite.memo(),
            workSite.displayOrder(),
            agencyOwnerUuid,
            farmOwnerUuid
        );
        return findClientWorkSite(agencyOwnerUuid, farmOwnerUuid, workSiteUuid)
            .orElseThrow(() -> new IllegalArgumentException("Client work site was not found."));
    }

    @Override
    public void softDeleteClientProfile(UUID agencyOwnerUuid, UUID profileUuid) {
        jdbcTemplate.update(
            """
            UPDATE public.labor_agency_farm_owner_profile
            SET status = 'ARCHIVED',
                deleted_at = now()
            WHERE agency_owner_uuid = ?
                AND uuid = ?
                AND deleted_at IS NULL
            """,
            agencyOwnerUuid,
            profileUuid
        );
    }

    private Map<UUID, List<ClientWorkSiteResponse>> findWorkSitesByProfileUuid(List<UUID> profileUuids) {
        Map<UUID, List<ClientWorkSiteResponse>> workSitesByProfileUuid = new LinkedHashMap<>();
        for (UUID profileUuid : profileUuids) {
            workSitesByProfileUuid.put(profileUuid, new ArrayList<>());
        }

        String placeholders = String.join(",", profileUuids.stream().map(ignored -> "?").toList());
        jdbcTemplate.query(
            """
            SELECT
                farm_owner_profile_uuid,
                uuid,
                site_name,
                COALESCE(farm_address, '') AS farm_address,
                COALESCE(memo, '') AS memo
            FROM public.labor_agency_farm_owner_site
            WHERE farm_owner_profile_uuid IN (%s)
                AND status = 'ACTIVE'
                AND deleted_at IS NULL
            ORDER BY farm_owner_profile_uuid, display_order, created_at
            """.formatted(placeholders),
            resultSet -> {
                UUID profileUuid = resultSet.getObject("farm_owner_profile_uuid", UUID.class);
                workSitesByProfileUuid.computeIfAbsent(profileUuid, ignored -> new ArrayList<>())
                    .add(mapWorkSite(resultSet));
            },
            profileUuids.toArray()
        );

        return workSitesByProfileUuid;
    }

    private ClientProjection mapClientProjection(ResultSet resultSet) throws SQLException {
        return new ClientProjection(
            resultSet.getObject("profile_uuid", UUID.class),
            resultSet.getObject("farm_owner_uuid", UUID.class),
            resultSet.getString("name"),
            resultSet.getString("nickname"),
            resultSet.getString("business_name"),
            resultSet.getString("phone"),
            resultSet.getString("bank_account"),
            resultSet.getString("memo")
        );
    }

    private ClientWorkSiteResponse mapWorkSite(ResultSet resultSet) throws SQLException {
        return new ClientWorkSiteResponse(
            resultSet.getObject("uuid", UUID.class),
            resultSet.getString("site_name"),
            resultSet.getString("farm_address"),
            resultSet.getString("memo")
        );
    }

    private record ClientProjection(
        UUID profileUuid,
        UUID farmOwnerUuid,
        String name,
        String nickname,
        String businessName,
        String phone,
        String bankAccount,
        String memo
    ) {
    }
}
