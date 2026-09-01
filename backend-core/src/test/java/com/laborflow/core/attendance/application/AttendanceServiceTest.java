package com.laborflow.core.attendance.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.laborflow.core.attendance.dao.AttendanceDao;
import com.laborflow.core.attendance.dao.AttendanceDao.AccountContext;
import com.laborflow.core.attendance.dto.AttendanceScheduleDayResponse;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AttendanceServiceTest {
    private final AttendanceDao attendanceDao = mock(AttendanceDao.class);
    private final AttendanceService service = new AttendanceService(attendanceDao);

    @Test
    void returnsScheduleDayEvenWhenNoWorkersAreAssigned() {
        UUID accountUuid = UUID.randomUUID();
        UUID agencyOwnerUuid = UUID.randomUUID();
        UUID scheduleDayUuid = UUID.randomUUID();
        LocalDate workDate = LocalDate.of(2026, 8, 18);
        AttendanceScheduleDayResponse scheduleDay = new AttendanceScheduleDayResponse(
            scheduleDayUuid,
            workDate,
            "숙소 옆집",
            "고추 수확",
            "",
            "영양숙소 옆집",
            "",
            "06:30",
            "17:30"
        );

        when(attendanceDao.findAccountContext("test"))
            .thenReturn(Optional.of(new AccountContext(accountUuid, agencyOwnerUuid)));
        when(attendanceDao.findScheduleDays(agencyOwnerUuid, workDate))
            .thenReturn(List.of(scheduleDay));
        when(attendanceDao.findRecords(agencyOwnerUuid, workDate))
            .thenReturn(List.of());

        var response = service.getRecords("test", workDate);

        assertThat(response.tasks()).containsExactly(scheduleDay);
        assertThat(response.records()).isEmpty();
    }
}
