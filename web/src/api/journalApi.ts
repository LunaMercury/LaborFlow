import { getApiBaseUrl } from "./apiBaseUrl";
import { parseErrorMessage } from "./parseErrorMessage";

const apiBaseUrl = getApiBaseUrl();

export type SalesJournal = {
  uuid: string;
  activityAt: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type SalesJournalPayload = {
  activityAt: string;
  content: string;
};

export type WorkJournalAttendance = {
  displayName: string;
  participantType: "registered" | "guest";
  workerCount: number;
  status: "WORKED" | "ABSENT" | "CANCELLED" | "DRAFT" | "UNRECORDED";
  actualStartTime: string | null;
  actualEndTime: string | null;
  breakMinutes: number | null;
};

export type WorkJournalSummary = {
  journalUuid: string;
  scheduleDayUuid: string;
  workDate: string;
  ownerName: string;
  siteName: string;
  address: string;
  workTitle: string;
  memo: string;
  updatedAt: string;
};

export type WorkJournalDetail = {
  journalUuid: string | null;
  scheduleDayUuid: string;
  workDate: string;
  ownerName: string;
  siteName: string;
  address: string;
  workTitle: string;
  memo: string;
  createdAt: string | null;
  updatedAt: string | null;
  actualWorkerCount: number;
  attendance: WorkJournalAttendance[];
};

type JournalDateFilters = {
  fromDate?: string;
  toDate?: string;
};

function createQuery(loginId: string, values: Record<string, string | undefined>) {
  const query = new URLSearchParams({ loginId });
  Object.entries(values).forEach(([key, value]) => {
    if (value) {
      query.set(key, value);
    }
  });
  return query.toString();
}

async function requireJson<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, fallback));
  }
  return response.json() as Promise<T>;
}

export async function fetchSalesJournals(
  loginId: string,
  filters: JournalDateFilters & { query?: string },
) {
  const query = createQuery(loginId, filters);
  return requireJson<SalesJournal[]>(
    await fetch(`${apiBaseUrl}/api/journals/sales?${query}`, { cache: "no-store" }),
    "영업일지를 불러오지 못했습니다.",
  );
}

export async function fetchSalesJournal(loginId: string, journalUuid: string) {
  return requireJson<SalesJournal>(
    await fetch(
      `${apiBaseUrl}/api/journals/sales/${encodeURIComponent(journalUuid)}?${createQuery(loginId, {})}`,
      { cache: "no-store" },
    ),
    "영업일지를 불러오지 못했습니다.",
  );
}

export async function createSalesJournal(loginId: string, payload: SalesJournalPayload) {
  return requireJson<SalesJournal>(
    await fetch(`${apiBaseUrl}/api/journals/sales?${createQuery(loginId, {})}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    "영업일지를 저장하지 못했습니다.",
  );
}

export async function updateSalesJournal(
  loginId: string,
  journalUuid: string,
  payload: SalesJournalPayload,
) {
  return requireJson<SalesJournal>(
    await fetch(
      `${apiBaseUrl}/api/journals/sales/${encodeURIComponent(journalUuid)}?${createQuery(loginId, {})}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    ),
    "영업일지를 저장하지 못했습니다.",
  );
}

export async function deleteSalesJournal(loginId: string, journalUuid: string) {
  const response = await fetch(
    `${apiBaseUrl}/api/journals/sales/${encodeURIComponent(journalUuid)}?${createQuery(loginId, {})}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "영업일지를 삭제하지 못했습니다."));
  }
}

export async function fetchWorkJournals(
  loginId: string,
  filters: JournalDateFilters & { clientQuery?: string },
) {
  const query = createQuery(loginId, filters);
  return requireJson<WorkJournalSummary[]>(
    await fetch(`${apiBaseUrl}/api/journals/work?${query}`, { cache: "no-store" }),
    "작업일지 목록을 불러오지 못했습니다.",
  );
}

export async function fetchWorkJournal(loginId: string, scheduleDayUuid: string) {
  return requireJson<WorkJournalDetail>(
    await fetch(
      `${apiBaseUrl}/api/journals/work/${encodeURIComponent(scheduleDayUuid)}?${createQuery(loginId, {})}`,
      { cache: "no-store" },
    ),
    "작업일지를 불러오지 못했습니다.",
  );
}

export async function saveWorkJournal(
  loginId: string,
  scheduleDayUuid: string,
  memo: string,
) {
  return requireJson<WorkJournalDetail>(
    await fetch(
      `${apiBaseUrl}/api/journals/work/${encodeURIComponent(scheduleDayUuid)}?${createQuery(loginId, {})}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo }),
      },
    ),
    "작업일지를 저장하지 못했습니다.",
  );
}

export async function deleteWorkJournal(loginId: string, scheduleDayUuid: string) {
  const response = await fetch(
    `${apiBaseUrl}/api/journals/work/${encodeURIComponent(scheduleDayUuid)}?${createQuery(loginId, {})}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "작업일지를 삭제하지 못했습니다."));
  }
}
