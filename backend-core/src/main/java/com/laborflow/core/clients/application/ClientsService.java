package com.laborflow.core.clients.application;

import com.laborflow.core.clients.dao.ClientCreateValues;
import com.laborflow.core.clients.dao.ClientWorkSiteValues;
import com.laborflow.core.clients.dao.ClientsDao;
import com.laborflow.core.clients.dto.ClientListResponse;
import com.laborflow.core.clients.dto.ClientWorkSiteRequest;
import com.laborflow.core.clients.dto.ClientWorkSiteResponse;
import com.laborflow.core.clients.dto.CreateClientRequest;
import com.laborflow.core.clients.dto.UpdateClientRequest;
import java.util.UUID;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ClientsService {
    private final ClientsDao clientsDao;

    public ClientsService(ClientsDao clientsDao) {
        this.clientsDao = clientsDao;
    }

    public ClientListResponse getClients(String loginId) {
        return new ClientListResponse(clientsDao.findClientsByLoginId(normalizeLoginId(loginId)));
    }

    @Transactional
    public void createClient(String loginId, CreateClientRequest request) {
        createClientAndReturnFarmOwnerUuid(loginId, request);
    }

    @Transactional
    public UUID createClientAndReturnFarmOwnerUuid(String loginId, CreateClientRequest request) {
        String normalizedLoginId = normalizeLoginId(loginId);
        UUID agencyOwnerUuid = clientsDao.findAgencyOwnerUuidByLoginId(normalizedLoginId)
            .orElseThrow(() -> new IllegalArgumentException("Labor agency owner was not found."));
        ClientCreateValues values = normalizeClientValues(
            request.name(),
            request.nickname(),
            request.businessName(),
            request.phone(),
            request.bankAccount(),
            request.memo(),
            true
        );

        if (clientsDao.localPhoneExists(agencyOwnerUuid, values.phoneHashSource())) {
            throw new DuplicateClientPhoneException();
        }

        UUID farmOwnerUuid = values.phoneHashSource() == null
            ? clientsDao.insertFarmOwner(values)
            : clientsDao.findFarmOwnerUuidByPhoneHashSource(values.phoneHashSource())
                .orElseGet(() -> clientsDao.insertFarmOwner(values));

        if (clientsDao.clientProfileExists(agencyOwnerUuid, farmOwnerUuid)) {
            throw new DuplicateClientPhoneException();
        }

        clientsDao.upsertFarmOwnerSensitiveProfile(farmOwnerUuid, values);
        UUID profileUuid = clientsDao.insertClientProfile(agencyOwnerUuid, farmOwnerUuid, values);
        clientsDao.replaceClientWorkSites(
            agencyOwnerUuid,
            profileUuid,
            normalizeWorkSites(request.workSites())
        );
        return farmOwnerUuid;
    }

    @Transactional
    public void updateClient(String loginId, UUID profileUuid, UpdateClientRequest request) {
        String normalizedLoginId = normalizeLoginId(loginId);
        UUID agencyOwnerUuid = clientsDao.findAgencyOwnerUuidByLoginId(normalizedLoginId)
            .orElseThrow(() -> new IllegalArgumentException("Labor agency owner was not found."));
        ClientCreateValues values = normalizeClientValues(
            request.name(),
            request.nickname(),
            request.businessName(),
            request.phone(),
            request.bankAccount(),
            request.memo(),
            false
        );

        clientsDao.findFarmOwnerUuidByProfileUuid(agencyOwnerUuid, profileUuid)
            .orElseThrow(() -> new IllegalArgumentException("Client profile was not found."));

        if (clientsDao.localPhoneExistsExceptProfile(agencyOwnerUuid, profileUuid, values.phoneHashSource())) {
            throw new DuplicateClientPhoneException();
        }

        clientsDao.updateClientProfile(agencyOwnerUuid, profileUuid, values);
        clientsDao.replaceClientWorkSites(
            agencyOwnerUuid,
            profileUuid,
            normalizeWorkSites(request.workSites())
        );
    }

    @Transactional
    public ClientWorkSiteResponse resolveWorkSite(
        String loginId,
        UUID farmOwnerUuid,
        UUID workSiteUuid,
        String rawSiteName,
        String rawFarmAddress,
        String rawMemo
    ) {
        String normalizedLoginId = normalizeLoginId(loginId);
        UUID agencyOwnerUuid = clientsDao.findAgencyOwnerUuidByLoginId(normalizedLoginId)
            .orElseThrow(() -> new IllegalArgumentException("Labor agency owner was not found."));
        if (!clientsDao.clientProfileExists(agencyOwnerUuid, farmOwnerUuid)) {
            throw new IllegalArgumentException("Client profile was not found.");
        }

        String memo = normalizeOptionalText(rawMemo);
        if (workSiteUuid != null) {
            ClientWorkSiteResponse existing = clientsDao.findClientWorkSite(
                agencyOwnerUuid,
                farmOwnerUuid,
                workSiteUuid
            ).orElseThrow(() -> new IllegalArgumentException("Client work site was not found."));
            return clientsDao.saveClientWorkSite(
                agencyOwnerUuid,
                farmOwnerUuid,
                new ClientWorkSiteValues(
                    existing.uuid(),
                    existing.siteName(),
                    normalizeOptionalText(existing.farmAddress()),
                    memo,
                    0
                )
            );
        }

        String siteName = normalizeOptionalText(rawSiteName);
        String farmAddress = normalizeOptionalText(rawFarmAddress);
        if (siteName == null) {
            return new ClientWorkSiteResponse(null, "", farmAddress == null ? "" : farmAddress, memo == null ? "" : memo);
        }

        return clientsDao.saveClientWorkSite(
            agencyOwnerUuid,
            farmOwnerUuid,
            new ClientWorkSiteValues(null, siteName, farmAddress, memo, 0)
        );
    }

    @Transactional
    public void addPhoneIfMissing(String loginId, UUID farmOwnerUuid, String rawPhone) {
        String normalizedLoginId = normalizeLoginId(loginId);
        UUID agencyOwnerUuid = clientsDao.findAgencyOwnerUuidByLoginId(normalizedLoginId)
            .orElseThrow(() -> new IllegalArgumentException("Labor agency owner was not found."));
        if (!clientsDao.clientProfileExists(agencyOwnerUuid, farmOwnerUuid)) {
            throw new IllegalArgumentException("Client profile was not found.");
        }
        if (clientsDao.clientPhoneExists(agencyOwnerUuid, farmOwnerUuid)) {
            return;
        }

        PhoneInput phone = normalizePhone(rawPhone);
        if (phone == null) {
            throw new IllegalArgumentException("Client phone number is required.");
        }
        if (clientsDao.localPhoneExists(agencyOwnerUuid, phone.hashSource())) {
            throw new DuplicateClientPhoneException();
        }
        clientsDao.findFarmOwnerUuidByPhoneHashSource(phone.hashSource())
            .filter(existingFarmOwnerUuid -> !existingFarmOwnerUuid.equals(farmOwnerUuid))
            .ifPresent(existingFarmOwnerUuid -> {
                throw new DuplicateClientPhoneException();
            });

        clientsDao.addFarmOwnerPhone(farmOwnerUuid, phone.displayValue(), phone.hashSource());
        clientsDao.addClientPhone(
            agencyOwnerUuid,
            farmOwnerUuid,
            phone.displayValue(),
            phone.hashSource()
        );
    }

    @Transactional
    public void deleteClient(String loginId, UUID profileUuid) {
        String normalizedLoginId = normalizeLoginId(loginId);
        UUID agencyOwnerUuid = clientsDao.findAgencyOwnerUuidByLoginId(normalizedLoginId)
            .orElseThrow(() -> new IllegalArgumentException("Labor agency owner was not found."));

        clientsDao.softDeleteClientProfile(agencyOwnerUuid, profileUuid);
    }

    private ClientCreateValues normalizeClientValues(
        String rawName,
        String rawNickname,
        String rawBusinessName,
        String rawPhone,
        String rawBankAccount,
        String rawMemo,
        boolean requireRegistrationFields
    ) {
        String name = normalizeOptionalText(rawName);
        String nickname = normalizeOptionalText(rawNickname);
        String businessName = normalizeOptionalText(rawBusinessName);
        PhoneInput phone = normalizePhone(rawPhone);
        String bankAccount = normalizeBankAccount(rawBankAccount);
        String memo = normalizeOptionalText(rawMemo);

        if (requireRegistrationFields && name == null && nickname == null) {
            throw new IllegalArgumentException("Client name or nickname is required.");
        }
        if (requireRegistrationFields && phone == null) {
            throw new IllegalArgumentException("Client phone number is required.");
        }
        if (!requireRegistrationFields && name == null && nickname == null && businessName == null && phone == null) {
            throw new IllegalArgumentException("Client identity is required.");
        }

        return new ClientCreateValues(
            name,
            nickname,
            businessName,
            phone == null ? null : phone.displayValue(),
            phone == null ? null : phone.hashSource(),
            bankAccount,
            bankAccount == null ? null : bankAccount,
            memo
        );
    }

    private List<ClientWorkSiteValues> normalizeWorkSites(List<ClientWorkSiteRequest> rawWorkSites) {
        List<ClientWorkSiteRequest> workSites = rawWorkSites == null ? List.of() : rawWorkSites;
        if (workSites.size() > 100) {
            throw new IllegalArgumentException("Too many client work sites were provided.");
        }

        List<ClientWorkSiteValues> normalizedWorkSites = new ArrayList<>();
        Set<String> identities = new HashSet<>();
        for (ClientWorkSiteRequest workSite : workSites) {
            if (workSite == null) {
                throw new IllegalArgumentException("Client work site is required.");
            }
            String siteName = normalizeOptionalText(workSite.siteName());
            String farmAddress = normalizeOptionalText(workSite.farmAddress());
            String memo = normalizeOptionalText(workSite.memo());
            if (siteName == null && farmAddress == null && memo == null) {
                continue;
            }
            if (siteName == null) {
                throw new IllegalArgumentException("Client work site name is required.");
            }
            if (siteName.length() > 150) {
                throw new IllegalArgumentException("Client work site name is too long.");
            }

            String identity = siteName.toLowerCase(Locale.ROOT)
                + "\u0000"
                + (farmAddress == null ? "" : farmAddress.toLowerCase(Locale.ROOT));
            if (!identities.add(identity)) {
                throw new IllegalArgumentException("Duplicate client work sites are not allowed.");
            }
            normalizedWorkSites.add(new ClientWorkSiteValues(
                workSite.uuid(),
                siteName,
                farmAddress,
                memo,
                normalizedWorkSites.size()
            ));
        }
        return List.copyOf(normalizedWorkSites);
    }

    private PhoneInput normalizePhone(String phone) {
        String normalizedPhone = normalizeOptionalText(phone);
        if (normalizedPhone == null) {
            return null;
        }

        String digits = normalizedPhone.replaceAll("\\D", "");
        if (digits.length() < 10 || digits.length() > 11) {
            throw new IllegalArgumentException("Phone number is invalid.");
        }

        if (digits.length() == 11) {
            return new PhoneInput(
                "%s-%s-%s".formatted(digits.substring(0, 3), digits.substring(3, 7), digits.substring(7)),
                digits
            );
        }

        return new PhoneInput(digits, digits);
    }

    private String normalizeBankAccount(String bankAccount) {
        String normalizedBankAccount = normalizeOptionalText(bankAccount);
        if (normalizedBankAccount == null) {
            return null;
        }

        String digits = normalizedBankAccount.replaceAll("\\D", "");
        if (digits.length() < 8 || digits.length() > 20) {
            throw new IllegalArgumentException("Bank account is invalid.");
        }

        return digits;
    }

    private String normalizeOptionalText(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        return value.trim();
    }

    private String normalizeLoginId(String loginId) {
        if (loginId == null || loginId.isBlank()) {
            return "test";
        }

        return loginId.trim();
    }

    private record PhoneInput(String displayValue, String hashSource) {
    }
}
