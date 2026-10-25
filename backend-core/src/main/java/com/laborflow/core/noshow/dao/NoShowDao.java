package com.laborflow.core.noshow.dao;

import com.laborflow.core.noshow.dto.NoShowDtos.Incident;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface NoShowDao {
    record Assignment(UUID uuid, UUID scheduleDayUuid, UUID workerProfileUuid, LocalDate workDate,
        String status, String previousAttendanceData) { }
    void lockOffice(UUID office);
    Optional<Assignment> lockAssignment(UUID office, UUID assignmentUuid);
    Optional<Incident> find(UUID office, UUID incidentUuid);
    Optional<Incident> byAssignment(UUID office, UUID assignmentUuid);
    boolean ownsWorker(UUID office, UUID workerProfileUuid);
    List<Incident> list(UUID office, UUID workerProfileUuid, LocalDate workDate);
    UUID create(UUID office, UUID account, Assignment assignment, String note);
    void markAbsent(UUID office, UUID account, Assignment assignment);
    void updateNote(UUID office, UUID incidentUuid, String note);
    void revision(UUID account, UUID incidentUuid, String action, String note);
}
