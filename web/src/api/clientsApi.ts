import { getApiBaseUrl } from "./apiBaseUrl";

const apiBaseUrl = getApiBaseUrl();

export type ClientWorkSite = {
  farmAddress: string;
  siteName: string;
  uuid: string;
  workDateRange: string;
  workDescription: string;
};

export type Client = {
  bankAccount: string;
  businessName: string;
  farmOwnerUuid: string;
  memo: string;
  name: string;
  nickname: string;
  phone: string;
  profileUuid: string;
  workSites: ClientWorkSite[];
};

export type CreateClientPayload = {
  bankAccount: string;
  businessName: string;
  memo: string;
  name: string;
  nickname: string;
  phone: string;
};

type ClientListResponse = {
  clients: Client[];
};

async function parseErrorMessage(response: Response, fallbackMessage: string) {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

export async function fetchClients(loginId: string): Promise<Client[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/clients?loginId=${encodeURIComponent(loginId)}`,
  );

  if (!response.ok) {
    throw new Error("거래처 목록을 불러오지 못했습니다.");
  }

  const body = (await response.json()) as ClientListResponse;
  return body.clients;
}

export async function createClient(
  loginId: string,
  payload: CreateClientPayload,
): Promise<Client[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/clients?loginId=${encodeURIComponent(loginId)}`,
    {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "거래처를 등록하지 못했습니다."));
  }

  const body = (await response.json()) as ClientListResponse;
  return body.clients;
}
