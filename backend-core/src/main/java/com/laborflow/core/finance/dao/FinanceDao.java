package com.laborflow.core.finance.dao;

import com.laborflow.core.finance.dto.FinanceDtos.*;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FinanceDao {
    record Account(UUID accountUuid, UUID agencyOwnerUuid) { }
    record StoredWork(UUID uuid, UUID scheduleDayUuid, long version, String status,
        boolean everConfirmed, Snapshot snapshot) { }
    record RequestResult(String hash, Cash response) { }
    Optional<Account> account(String loginId);
    void lockOffice(UUID office);
    Optional<Source> source(UUID office, UUID day);
    List<UUID> sourceDays(UUID office, LocalDate from, LocalDate to);
    Optional<StoredWork> work(UUID office, UUID uuid);
    Optional<StoredWork> workByDay(UUID office, UUID day);
    List<StoredWork> works(UUID office, LocalDate from, LocalDate to);
    List<Revision> revisions(UUID office, UUID work);
    StoredWork insertWork(Account account, UUID day, Snapshot snapshot);
    StoredWork updateWork(Account account, StoredWork previous, String status, String reason, Snapshot snapshot);
    void syncObligations(UUID office, StoredWork work);
    List<Balance> balances(UUID office, String kind, LocalDate today);
    Optional<Balance> obligation(UUID office, UUID uuid, LocalDate today);
    Optional<Cash> cash(UUID office, UUID uuid);
    List<Cash> cashList(UUID office, String kind, LocalDate from, LocalDate to);
    Cash insertCash(Account account, CashBody body, UUID replaces);
    void cancelCash(Account account, UUID cash, String reason);
    Optional<RequestResult> request(UUID office, UUID requestId);
    void saveRequest(UUID office, UUID requestId, String hash, Cash response);
    Optional<Settings> settings(UUID office);
    void saveSettings(Account account, Settings settings, String reason);
    boolean ownsWorker(UUID office, UUID worker);
    boolean ownsClient(UUID office, UUID client);
}
