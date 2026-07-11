export type ServicePageContent = {
  label: string;
  title: string;
  summary: string;
};

export const servicePages: Record<string, ServicePageContent> = {
  "/profile": {
    label: "프로필",
    title: "내 정보를 관리합니다.",
    summary: "인력사무소 계정 정보, 연락처, 보안 설정을 확인하고 수정하는 화면입니다.",
  },
  "/billing": {
    label: "결제",
    title: "결제와 이용 내역을 관리합니다.",
    summary: "요금제, 결제 수단, 청구 내역을 확인하는 서비스 영역입니다.",
  },
  "/settings": {
    label: "설정",
    title: "서비스 운영 설정을 조정합니다.",
    summary: "권한, 알림, 보안, 기본 작업 조건을 관리하는 화면입니다.",
  },
  "/notifications": {
    label: "알림",
    title: "중요 알림을 확인합니다.",
    summary: "근태, 작업 일정, 결제, 계정 보안 관련 알림을 모아보는 화면입니다.",
  },
  "/attendance": {
    label: "근태 관리",
    title: "근태 흐름을 관리합니다.",
    summary: "출근, 퇴근, 결근, 조퇴 상태를 확인하고 확정하는 화면입니다.",
  },
  "/schedule": {
    label: "일정 관리",
    title: "현장 일정을 관리합니다.",
    summary: "농장별 작업 일정과 필요 인원을 배정하는 화면입니다.",
  },
  "/work-schedule": {
    label: "작업자 배치",
    title: "작업별 배정을 확인합니다.",
    summary: "작업 내용, 현장, 이동 흐름을 기준으로 배정 상태를 확인하는 화면입니다.",
  },
};
