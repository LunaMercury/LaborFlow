package com.laborflow.core.cautions.application;

import com.laborflow.core.cautions.dao.AssignmentCautionDao;
import com.laborflow.core.cautions.dto.AssignmentCautionResponse;
import com.laborflow.core.cautions.dto.CautionAcknowledgement;
import com.laborflow.core.cautions.dto.SaveAssignmentCautionRequest;
import com.laborflow.core.cautions.dto.WorkerAssignmentCautionChangeRequest;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AssignmentCautionService {
    private final AssignmentCautionDao dao;
    public AssignmentCautionService(AssignmentCautionDao dao) { this.dao = dao; }

    private AssignmentCautionDao.Actor actor(String loginId) {
        if (loginId == null || loginId.isBlank()) throw new IllegalArgumentException("Account is required.");
        return dao.findActor(loginId.trim()).orElseThrow(() -> new IllegalArgumentException("Account was not found."));
    }

    @Transactional(readOnly = true)
    public List<AssignmentCautionResponse> list(String loginId, UUID worker, UUID client, UUID farmOwner) {
        var actor = actor(loginId);
        validateProfiles(actor.agencyOwnerUuid(), worker, client);
        return dao.findActive(actor.agencyOwnerUuid(), worker, client, farmOwner, false);
    }

    private void validateProfiles(UUID office, UUID worker, UUID client) {
        if (worker != null && !dao.workerBelongsToOffice(office, worker)) throw new IllegalArgumentException("Worker was not found.");
        if (client != null && !dao.clientBelongsToOffice(office, client)) throw new IllegalArgumentException("Client was not found.");
    }

    @Transactional
    public AssignmentCautionResponse save(String loginId, UUID uuid, SaveAssignmentCautionRequest request) {
        var actor = actor(loginId);
        if (request.workerProfileUuid() == null || request.clientProfileUuid() == null) throw new IllegalArgumentException("Profiles are required.");
        validateProfiles(actor.agencyOwnerUuid(), request.workerProfileUuid(), request.clientProfileUuid());
        if (!List.of("CLIENT", "WORKER", "BOTH").contains(request.requestedBy() == null ? "" : request.requestedBy()))
            throw new IllegalArgumentException("Requester is invalid.");
        String memo = request.memo() == null || request.memo().isBlank() ? null : request.memo().trim();
        if (memo != null && memo.length() > 500) throw new IllegalArgumentException("Memo is too long.");
        if (uuid != null) {
            UUID requestedUuid = uuid;
            boolean exists = dao.findActive(actor.agencyOwnerUuid(), request.workerProfileUuid(), request.clientProfileUuid(), null, false)
                .stream().anyMatch(c -> c.uuid().equals(requestedUuid));
            if (!exists || !dao.update(actor.agencyOwnerUuid(), actor.accountUuid(), uuid, request.requestedBy(), memo))
                throw new IllegalArgumentException("Caution was not found.");
        } else {
            uuid = dao.create(actor.agencyOwnerUuid(), actor.accountUuid(), request.workerProfileUuid(), request.clientProfileUuid(), request.requestedBy(), memo);
        }
        UUID savedUuid = uuid;
        return dao.findActive(actor.agencyOwnerUuid(), request.workerProfileUuid(), request.clientProfileUuid(), null, false)
            .stream().filter(c -> c.uuid().equals(savedUuid)).findFirst().orElseThrow(() -> new IllegalArgumentException("Caution was not found."));
    }

    @Transactional
    public void release(String loginId, UUID uuid) {
        var actor = actor(loginId);
        if (!dao.release(actor.agencyOwnerUuid(), actor.accountUuid(), uuid)) throw new IllegalArgumentException("Caution was not found.");
    }

    @Transactional
    public void applyWorkerChanges(String loginId, UUID worker, List<WorkerAssignmentCautionChangeRequest> changes) {
        if (changes == null || changes.isEmpty()) return;
        if (changes.size() > 100) throw new IllegalArgumentException("Too many caution changes.");
        var actor = actor(loginId);
        validateProfiles(actor.agencyOwnerUuid(), worker, null);
        if (worker == null) throw new IllegalArgumentException("Worker is required.");
        var clients = new HashSet<UUID>();
        var active = dao.findActive(actor.agencyOwnerUuid(), worker, null, null, false);
        // Check every identifier before applying any of the draft's changes.
        for (var change : changes) {
            if (change == null || change.clientProfileUuid() == null || !clients.add(change.clientProfileUuid()))
                throw new IllegalArgumentException("Caution clients must be unique and present.");
            validateProfiles(actor.agencyOwnerUuid(), worker, change.clientProfileUuid());
            if (change.uuid() != null && active.stream().noneMatch(c ->
                c.uuid().equals(change.uuid()) && c.clientProfileUuid().equals(change.clientProfileUuid())))
                throw new IllegalArgumentException("Caution was not found.");
            if (change.released()) {
                if (change.uuid() == null) throw new IllegalArgumentException("Caution is required for release.");
            } else {
                if (!List.of("CLIENT", "WORKER", "BOTH").contains(change.requestedBy() == null ? "" : change.requestedBy()))
                    throw new IllegalArgumentException("Requester is invalid.");
                if (change.memo() != null && change.memo().trim().length() > 500)
                    throw new IllegalArgumentException("Memo is too long.");
            }
        }
        for (var change : changes) {
            if (change.released()) {
                if (!dao.release(actor.agencyOwnerUuid(), actor.accountUuid(), change.uuid()))
                    throw new IllegalArgumentException("Caution was not found.");
            } else {
                String memo = change.memo() == null || change.memo().isBlank() ? null : change.memo().trim();
                if (change.uuid() == null) {
                    dao.create(actor.agencyOwnerUuid(), actor.accountUuid(), worker, change.clientProfileUuid(), change.requestedBy(), memo);
                } else if (!dao.update(actor.agencyOwnerUuid(), actor.accountUuid(), change.uuid(), change.requestedBy(), memo)) {
                    throw new IllegalArgumentException("Caution was not found.");
                }
            }
        }
    }

    // Called inside the schedule transaction: confirmation applies only to its new placements.
    @Transactional
    public List<AssignmentCautionResponse> validatePlacement(String loginId, UUID farmOwner, List<UUID> workers, List<CautionAcknowledgement> confirmations) {
        if (farmOwner == null) throw new IllegalArgumentException("Client is required.");
        var actor = actor(loginId);
        if (workers.isEmpty()) return List.of();
        for (UUID worker : workers) validateProfiles(actor.agencyOwnerUuid(), worker, null);
        var conflicts = dao.findActive(actor.agencyOwnerUuid(), null, null, farmOwner, true).stream()
            .filter(c -> workers.contains(c.workerProfileUuid())).toList();
        var accepted = confirmations == null ? List.<CautionAcknowledgement>of() : confirmations;
        var missing = conflicts.stream().filter(c -> accepted.stream().noneMatch(a -> a != null && c.uuid().equals(a.uuid()) && c.updatedAt().equals(a.updatedAt()))).toList();
        if (!missing.isEmpty()) throw new AssignmentCautionConflictException(missing);
        return conflicts;
    }

    public void record(String loginId, UUID day, List<AssignmentCautionResponse> cautions, String action) {
        if (cautions.isEmpty()) return;
        var actor = actor(loginId);
        for (var caution : cautions) dao.recordAcknowledgement(actor.agencyOwnerUuid(), actor.accountUuid(), day, caution, action);
    }
}
