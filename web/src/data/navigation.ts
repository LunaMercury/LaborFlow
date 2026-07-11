export type NavigationItem = {
  label: string;
  path: string;
  children?: NavigationItem[];
};

export const menuItems: NavigationItem[] = [
  { label: "거래처 목록", path: "/clients" },
  {
    label: "인력 현황",
    path: "/workers",
    children: [
      { label: "작업자 목록", path: "/workers" },
      { label: "팀 목록", path: "/teams" },
    ],
  },
  { label: "근태 관리", path: "/attendance" },
  { label: "일정 관리", path: "/schedule" },
  { label: "작업자 배치", path: "/work-schedule" },
  { label: "각종 서식", path: "/forms" },
];

export const profileMenuItems: NavigationItem[] = [
  { label: "내 정보", path: "/profile" },
  { label: "결제", path: "/billing" },
  { label: "설정", path: "/settings" },
  { label: "알림", path: "/notifications" },
];
