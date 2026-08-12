package com.laborflow.core.clients.dao;

import com.laborflow.core.clients.dto.ClientResponse;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ClientsDao {
    List<ClientResponse> findClientsByLoginId(String loginId);

    Optional<UUID> findAgencyOwnerUuidByLoginId(String loginId);

    Optional<UUID> findFarmOwnerUuidByPhoneHashSource(String phoneHashSource);

    boolean clientProfileExists(UUID agencyOwnerUuid, UUID farmOwnerUuid);

    boolean clientPhoneExists(UUID agencyOwnerUuid, UUID farmOwnerUuid);

    boolean localPhoneExists(UUID agencyOwnerUuid, String phoneHashSource);

    boolean localPhoneExistsExceptProfile(UUID agencyOwnerUuid, UUID profileUuid, String phoneHashSource);

    Optional<UUID> findFarmOwnerUuidByProfileUuid(UUID agencyOwnerUuid, UUID profileUuid);

    UUID insertFarmOwner(ClientCreateValues values);

    void upsertFarmOwnerSensitiveProfile(UUID farmOwnerUuid, ClientCreateValues values);

    void insertClientProfile(UUID agencyOwnerUuid, UUID farmOwnerUuid, ClientCreateValues values);

    void addClientPhone(UUID agencyOwnerUuid, UUID farmOwnerUuid, String phone, String phoneHashSource);

    void addFarmOwnerPhone(UUID farmOwnerUuid, String phone, String phoneHashSource);

    void updateClientProfile(UUID agencyOwnerUuid, UUID profileUuid, ClientCreateValues values);

    void softDeleteClientProfile(UUID agencyOwnerUuid, UUID profileUuid);
}
