import { getApiBaseUrl } from "./apiBaseUrl";
import { parseErrorMessage } from "./parseErrorMessage";

const apiBaseUrl = getApiBaseUrl();

export type ClientWorkSite = {
  farmAddress: string;
  memo: string;
  siteName: string;
  uuid: string;
};

export type ClientWorkSitePayload = {
  farmAddress: string;
  memo: string;
  siteName: string;
  uuid: string | null;
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
  workSites: ClientWorkSitePayload[];
};

type ClientListResponse = {
  clients: Client[];
};

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

export async function updateClient(
  loginId: string,
  profileUuid: string,
  payload: CreateClientPayload,
): Promise<Client[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/clients/${profileUuid}?loginId=${encodeURIComponent(loginId)}`,
    {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "거래처 정보를 수정하지 못했습니다."));
  }

  const body = (await response.json()) as ClientListResponse;
  return body.clients;
}

export async function deleteClient(
  loginId: string,
  profileUuid: string,
): Promise<Client[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/clients/${profileUuid}?loginId=${encodeURIComponent(loginId)}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "거래처를 삭제하지 못했습니다."));
  }

  const body = (await response.json()) as ClientListResponse;
  return body.clients;
}
