package com.laborflow.core.clients.application;

import com.laborflow.core.clients.dao.ClientCreateValues;
import com.laborflow.core.clients.dao.ClientsDao;
import com.laborflow.core.clients.dto.ClientListResponse;
import com.laborflow.core.clients.dto.CreateClientRequest;
import java.util.UUID;
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
        String normalizedLoginId = normalizeLoginId(loginId);
        UUID agencyOwnerUuid = clientsDao.findAgencyOwnerUuidByLoginId(normalizedLoginId)
            .orElseThrow(() -> new IllegalArgumentException("Labor agency owner was not found."));
        ClientCreateValues values = normalizeCreateValues(request);

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
        clientsDao.insertClientProfile(agencyOwnerUuid, farmOwnerUuid, values);
    }

    private ClientCreateValues normalizeCreateValues(CreateClientRequest request) {
        String name = normalizeOptionalText(request.name());
        String nickname = normalizeOptionalText(request.nickname());
        String businessName = normalizeOptionalText(request.businessName());
        PhoneInput phone = normalizePhone(request.phone());
        String bankAccount = normalizeBankAccount(request.bankAccount());
        String memo = normalizeOptionalText(request.memo());

        if (name == null && nickname == null && businessName == null && phone == null) {
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
