package com.laborflow.core.cautions.dao;

import com.laborflow.core.cautions.dto.AssignmentCautionResponse;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcAssignmentCautionDao implements AssignmentCautionDao {
    private final JdbcTemplate jdbc;
    public JdbcAssignmentCautionDao(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private <T> T write(java.util.function.Supplier<T> operation) {
        try { return operation.get(); }
        catch (DataAccessException failure) {
            // SQL errors may include the failed row's memo; never pass that cause to the global logger.
            throw new IllegalStateException("Assignment caution persistence failed.");
        }
    }

    public Optional<Actor> findActor(String loginId) {
        return jdbc.query("""
            SELECT labor_agency_owner_uuid, uuid FROM public.app_account
            WHERE lower(login_id) = lower(?) AND status = 'ACTIVE' AND labor_agency_owner_uuid IS NOT NULL
            """, (rs, row) -> new Actor(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class)), loginId)
            .stream().findFirst();
    }

    public boolean workerBelongsToOffice(UUID office, UUID worker) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
            SELECT EXISTS(SELECT 1 FROM public.labor_agency_worker_profile
              WHERE agency_owner_uuid = ? AND uuid = ? AND deleted_at IS NULL AND status <> 'ARCHIVED')
            """, Boolean.class, office, worker));
    }

    public boolean clientBelongsToOffice(UUID office, UUID client) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
            SELECT EXISTS(SELECT 1 FROM public.labor_agency_farm_owner_profile
              WHERE agency_owner_uuid = ? AND uuid = ? AND deleted_at IS NULL AND status = 'ACTIVE')
            """, Boolean.class, office, client));
    }

    public List<AssignmentCautionResponse> findActive(UUID office, UUID worker, UUID client, UUID farmOwner, boolean lock) {
        String sql = """
            SELECT c.*, fp.farm_owner_uuid,
              COALESCE(NULLIF(wp.local_name, ''), wp.local_nickname, '') AS worker_name,
              COALESCE(NULLIF(fp.local_name, ''), fp.local_nickname, '') AS client_name
            FROM public.worker_client_assignment_caution c
            JOIN public.labor_agency_worker_profile wp ON wp.uuid = c.worker_profile_uuid AND wp.agency_owner_uuid = c.agency_owner_uuid
            JOIN public.labor_agency_farm_owner_profile fp ON fp.uuid = c.client_profile_uuid AND fp.agency_owner_uuid = c.agency_owner_uuid
            WHERE c.agency_owner_uuid = ? AND c.deleted_at IS NULL
              AND wp.deleted_at IS NULL AND wp.status <> 'ARCHIVED' AND fp.deleted_at IS NULL AND fp.status = 'ACTIVE'
            """;
        var args = new java.util.ArrayList<Object>();
        args.add(office);
        if (worker != null) { sql += " AND c.worker_profile_uuid = ?"; args.add(worker); }
        if (client != null) { sql += " AND c.client_profile_uuid = ?"; args.add(client); }
        if (farmOwner != null) { sql += " AND fp.farm_owner_uuid = ?"; args.add(farmOwner); }
        sql += " ORDER BY c.created_at, c.uuid";
        if (lock) sql += " FOR SHARE OF c";
        return jdbc.query(sql, (rs, row) -> new AssignmentCautionResponse(
            rs.getObject("uuid", UUID.class), rs.getObject("worker_profile_uuid", UUID.class),
            rs.getObject("client_profile_uuid", UUID.class), rs.getObject("farm_owner_uuid", UUID.class),
            rs.getString("worker_name"), rs.getString("client_name"), rs.getString("requested_by"), rs.getString("memo"),
            rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant(),
            rs.getObject("created_by_account_uuid", UUID.class), rs.getObject("updated_by_account_uuid", UUID.class)
        ), args.toArray());
    }

    public UUID create(UUID office, UUID account, UUID worker, UUID client, String requester, String memo) {
        return write(() -> {
            // Duplicate submissions return the existing record without overwriting its reason.
            var inserted = jdbc.query("""
                INSERT INTO public.worker_client_assignment_caution
                  (agency_owner_uuid, worker_profile_uuid, client_profile_uuid, requested_by, memo, created_by_account_uuid, updated_by_account_uuid)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (agency_owner_uuid, worker_profile_uuid, client_profile_uuid) WHERE deleted_at IS NULL
                DO NOTHING RETURNING uuid
                """, (rs, row) -> rs.getObject(1, UUID.class), office, worker, client, requester, memo, account, account);
            if (!inserted.isEmpty()) return inserted.getFirst();
            return jdbc.queryForObject("""
                SELECT uuid FROM public.worker_client_assignment_caution
                WHERE agency_owner_uuid = ? AND worker_profile_uuid = ? AND client_profile_uuid = ? AND deleted_at IS NULL
                """, UUID.class, office, worker, client);
        });
    }

    public boolean update(UUID office, UUID account, UUID uuid, String requester, String memo) {
        return write(() -> jdbc.update("""
            UPDATE public.worker_client_assignment_caution SET requested_by = ?, memo = ?, updated_by_account_uuid = ?
            WHERE agency_owner_uuid = ? AND uuid = ? AND deleted_at IS NULL
            """, requester, memo, account, office, uuid) == 1);
    }

    public boolean release(UUID office, UUID account, UUID uuid) {
        return write(() -> jdbc.update("""
            UPDATE public.worker_client_assignment_caution SET deleted_at = now(), updated_by_account_uuid = ?
            WHERE agency_owner_uuid = ? AND uuid = ? AND deleted_at IS NULL
            """, account, office, uuid) == 1);
    }

    public void recordAcknowledgement(UUID office, UUID account, UUID day, AssignmentCautionResponse caution, String action) {
        write(() -> jdbc.update("""
            INSERT INTO public.assignment_caution_acknowledgement
              (agency_owner_uuid, caution_uuid, caution_updated_at, schedule_day_uuid, acknowledged_by_account_uuid, action)
            VALUES (?, ?, ?, ?, ?, ?)
            """, office, caution.uuid(), java.sql.Timestamp.from(caution.updatedAt()), day, account, action));
    }
}
