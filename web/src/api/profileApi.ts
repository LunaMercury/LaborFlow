import { getApiBaseUrl } from "./apiBaseUrl";

const apiBaseUrl = getApiBaseUrl();

export type ProfileResponse = {
  loginId: string;
  accountRole: string;
  accountStatus: string;
  ownerName: string;
  agencyName: string;
  phone: string;
  email: string;
  officePhone: string;
  officeAddress: string;
  businessRegistrationNumber: string;
  bankName: string;
  bankAccount: string;
  bankAccountHolderName: string;
  loginNotificationEnabled: boolean;
  scheduleNotificationEnabled: boolean;
  passwordUpdatedAt: string;
  twoFactorStatus: string;
};

export type UpdateProfilePayload = Omit<
  ProfileResponse,
  "loginId" | "accountRole" | "accountStatus" | "passwordUpdatedAt" | "twoFactorStatus"
>;

export async function fetchProfile(loginId: string): Promise<ProfileResponse> {
  const response = await fetch(
    `${apiBaseUrl}/api/profile?loginId=${encodeURIComponent(loginId)}`,
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "내 정보를 불러오지 못했습니다."));
  }

  return (await response.json()) as ProfileResponse;
}

export async function updateProfile(
  loginId: string,
  payload: UpdateProfilePayload,
): Promise<ProfileResponse> {
  const response = await fetch(
    `${apiBaseUrl}/api/profile?loginId=${encodeURIComponent(loginId)}`,
    {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PUT",
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "내 정보를 저장하지 못했습니다."));
  }

  return (await response.json()) as ProfileResponse;
}

async function parseErrorMessage(response: Response, fallbackMessage: string) {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}
