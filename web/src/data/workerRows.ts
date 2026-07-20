export type WorkerRow = {
  profileUuid?: string;
  name: string;
  nickname?: string;
  phone: string;
  age?: number | null;
  gender?: string;
  memo?: string;
  isActive?: boolean;
  availableDaysMask?: number;
  availabilityMemo?: string;
  bankCode?: string;
  bankName?: string;
  accountNumber?: string;
  accountHolderName?: string;
  paymentVerificationStatus?: string;
  workTypeCodes: string[];
  workTypeRatings?: Record<string, number>;
  pickupLocation: string;
  teamUuid?: string | null;
  teamName?: string | null;
  teamRole?: string | null;
  teamDisplayOrder?: number;
  lastWorkedDate?: string | null;
  totalWorkDays?: number;
  noShowRisk?: boolean;
  noShowRiskManual?: boolean;
  noShowCount?: number;
};

export const workerRows: WorkerRow[] = [
  {
    name: "홍길순",
    nickname: "앞산 아줌마",
    phone: "010-1234-5678",
    gender: "FEMALE",
    workTypeCodes: ["garlic_harvesting", "garlic_sorting", "garlic_tonbag"],
    pickupLocation: "남부 정류장",
  },
  {
    name: "김철수",
    phone: "010-9876-5432",
    gender: "MALE",
    workTypeCodes: [],
    pickupLocation: "동문 주차장",
  },
  {
    name: "박영희",
    phone: "010-2468-1357",
    gender: "FEMALE",
    workTypeCodes: [],
    pickupLocation: "중앙시장",
  },
];
