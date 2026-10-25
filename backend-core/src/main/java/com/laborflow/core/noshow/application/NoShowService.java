package com.laborflow.core.noshow.application;

import com.laborflow.core.attendance.dao.AttendanceDao;
import com.laborflow.core.attendance.dao.AttendanceDao.AccountContext;
import com.laborflow.core.noshow.dao.NoShowDao;
import com.laborflow.core.noshow.dto.NoShowDtos.*;
import com.laborflow.core.schedule.application.ScheduleService;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NoShowService {
    private final NoShowDao dao;
    private final AttendanceDao attendance;
    private final ScheduleService schedule;

    public NoShowService(NoShowDao dao, AttendanceDao attendance, ScheduleService schedule) {
        this.dao = dao; this.attendance = attendance; this.schedule = schedule;
    }

    @Transactional(readOnly = true)
    public Incidents list(String loginId, UUID worker, LocalDate date) {
        var account = account(loginId);
        if (worker == null && date == null) throw new NoShowException("작업자 또는 조회 날짜를 선택해 주세요.");
        if (worker != null && !dao.ownsWorker(account.agencyOwnerUuid(), worker)) throw missing();
        return new Incidents(dao.list(account.agencyOwnerUuid(), worker, date));
    }

    @Transactional
    public Incident create(String loginId, Create request) {
        if (request == null || request.assignmentUuid() == null) throw missing();
        String note = note(request.note());
        var account = account(loginId);
        UUID office = account.agencyOwnerUuid();
        dao.lockOffice(office);
        var assignment = dao.lockAssignment(office, request.assignmentUuid()).orElseThrow(NoShowService::missing);
        if (assignment.workerProfileUuid() != null && !dao.ownsWorker(office, assignment.workerProfileUuid())) throw missing();
        if (assignment.workDate().isAfter(LocalDate.now(ZoneId.of("Asia/Seoul"))))
            throw new NoShowException("미래 날짜에는 노쇼를 기록할 수 없습니다.");
        var previous = dao.byAssignment(office, assignment.uuid());
        if (previous.isPresent() && !"CANCELLED".equals(previous.get().status())) return previous.get();
        if (!java.util.Set.of("PLANNED", "WORKED", "ABSENT").contains(assignment.status()))
            throw new NoShowException("취소되었거나 대체된 배정에는 노쇼를 새로 기록할 수 없습니다.");
        UUID incident = dao.create(office, account.accountUuid(), assignment, note);
        dao.markAbsent(office, account.accountUuid(), assignment);
        dao.revision(account.accountUuid(), incident, "CREATED", note);
        attendance.refreshWorkerActivitySummary(office);
        return dao.find(office, incident).orElseThrow(NoShowService::missing);
    }

    @Transactional
    public Incident update(String loginId, UUID uuid, Update request) {
        if (request == null) throw new NoShowException("메모를 확인해 주세요.");
        String note = note(request.note());
        var account = account(loginId);
        dao.lockOffice(account.agencyOwnerUuid());
        var previous = dao.find(account.agencyOwnerUuid(), uuid).orElseThrow(NoShowService::missing);
        if (Objects.equals(previous.note(), note)) return previous;
        dao.updateNote(account.agencyOwnerUuid(), uuid, note);
        dao.revision(account.accountUuid(), uuid, "NOTE_UPDATED", note);
        return dao.find(account.agencyOwnerUuid(), uuid).orElseThrow(NoShowService::missing);
    }

    @Transactional
    public Incident cancel(String loginId, UUID uuid, Cancel request) {
        String reason = note(request == null ? null : request.reason());
        if (reason == null) throw new NoShowException("노쇼 취소 사유를 입력해 주세요.");
        var account = account(loginId);
        UUID office = account.agencyOwnerUuid();
        dao.lockOffice(office);
        var previous = dao.find(office, uuid).orElseThrow(NoShowService::missing);
        if ("CANCELLED".equals(previous.status())) return previous;
        dao.lockAssignment(office, previous.originalAssignmentUuid()).orElseThrow(NoShowService::missing);
        try {
            schedule.cancelNoShow(loginId, previous.scheduleDayUuid(), previous.originalAssignmentUuid(), previous.workDate());
        } catch (IllegalArgumentException e) {
            throw new NoShowException("노쇼를 취소하지 못했습니다. 대체자의 근태 확정 여부와 원배정 상태를 확인해 주세요.");
        }
        dao.revision(account.accountUuid(), uuid, "CANCELLED", reason);
        attendance.refreshWorkerActivitySummary(office);
        return dao.find(office, uuid).orElseThrow(NoShowService::missing);
    }

    private AccountContext account(String loginId) {
        if (loginId == null || loginId.isBlank()) throw missing();
        return attendance.findAccountContext(loginId.trim()).orElseThrow(NoShowService::missing);
    }
    private static String note(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim();
        if (normalized.length() > 1000) throw new NoShowException("메모와 사유는 1000자 이내로 입력해 주세요.");
        return normalized;
    }
    private static NoShowException missing() { return new NoShowException("해당 노쇼 기록 또는 배정을 찾을 수 없습니다."); }
}
