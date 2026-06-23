export type WorkTypeOption = {
  code: string;
  name: string;
};

export const workTypeOptions: WorkTypeOption[] = [
  { code: "garlic_harvesting", name: "마늘 뽑기" },
  { code: "garlic_sorting", name: "마늘 선별" },
  { code: "garlic_tonbag", name: "마늘 톤백" },
  { code: "garlic_meshing", name: "마늘 망작업" },
  { code: "garlic_branching", name: "마늘 삭태 자르기" },
  { code: "garlic_work", name: "마늘 작업 기타" },
  { code: "onion_harvesting", name: "양파 뽑기" },
  { code: "onion_sorting", name: "양파 선별" },
  { code: "onion_tonbag", name: "양파 톤백" },
  { code: "onion_meshing", name: "양파 망작업" },
  { code: "onion_branching", name: "양파 삭태 자르기" },
  { code: "onion_work", name: "양파 작업 기타" },
  { code: "plastic_remove", name: "비닐 벗기기" },
];
