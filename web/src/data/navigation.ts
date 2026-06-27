export type NavigationItem = {
  label: string;
  path: string;
  children?: NavigationItem[];
};

export const menuItems: NavigationItem[] = [
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
  { label: "작업 일정", path: "/work-schedule" },
];

export const profileMenuItems: NavigationItem[] = [
  { label: "내 정보", path: "/profile" },
  { label: "결제", path: "/billing" },
  { label: "설정", path: "/settings" },
  { label: "알림", path: "/notifications" },
];
