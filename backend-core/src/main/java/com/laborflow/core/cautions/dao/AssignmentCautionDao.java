package com.laborflow.core.cautions.dao;

import com.laborflow.core.cautions.dto.AssignmentCautionResponse;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AssignmentCautionDao {
    record Actor(UUID agencyOwnerUuid, UUID accountUuid) { }
    Optional<Actor> findActor(String loginId);
    boolean workerBelongsToOffice(UUID office, UUID worker);
    boolean clientBelongsToOffice(UUID office, UUID client);
    List<AssignmentCautionResponse> findActive(UUID office, UUID worker, UUID client, UUID farmOwner, boolean lock);
    UUID create(UUID office, UUID account, UUID worker, UUID client, String requester, String memo);
    boolean update(UUID office, UUID account, UUID uuid, String requester, String memo);
    boolean release(UUID office, UUID account, UUID uuid);
    void recordAcknowledgement(UUID office, UUID account, UUID day, AssignmentCautionResponse caution, String action);
}
