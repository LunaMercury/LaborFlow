export type WorkSkillGrade = "A" | "B" | "C" | "D" | "UNRATED";

export type WorkSkillGradeDefinition = {
  code: WorkSkillGrade;
  description: string;
  displayCode: string;
  label: string;
  representativeRating: number;
};

export const WORK_SKILL_GRADE_DEFINITIONS: readonly WorkSkillGradeDefinition[] = [
  {
    code: "A",
    description: "해당 작업을 안정적으로 수행하며 독립 작업이 가능합니다.",
    displayCode: "A",
    label: "숙련",
    representativeRating: 5,
  },
  {
    code: "B",
    description: "기본 작업이 가능하며 일부 확인과 지도가 필요합니다.",
    displayCode: "B",
    label: "보통",
    representativeRating: 4,
  },
  {
    code: "C",
    description: "경험이 적어 작업 설명과 지도가 필요한 초보 단계입니다.",
    displayCode: "C",
    label: "초보",
    representativeRating: 3,
  },
  {
    code: "D",
    description: "평가 결과 기초 숙련이 부족해 재교육과 밀착 지도가 필요합니다.",
    displayCode: "D",
    label: "미숙",
    representativeRating: 1,
  },
  {
    code: "UNRATED",
    description: "아직 숙련도를 판단할 정보가 없습니다. 작업 종류 등록은 유지됩니다.",
    displayCode: "—",
    label: "미평가",
    representativeRating: 0,
  },
] as const;

const WORK_SKILL_GRADE_BY_CODE = new Map(
  WORK_SKILL_GRADE_DEFINITIONS.map((definition) => [definition.code, definition]),
);

export function getWorkSkillGrade(rating: number | null | undefined): WorkSkillGrade {
  if (rating === 5) {
    return "A";
  }

  if (rating === 4) {
    return "B";
  }

  if (rating === 2 || rating === 3) {
    return "C";
  }

  if (rating === 1) {
    return "D";
  }

  return "UNRATED";
}

export function getWorkSkillGradeDefinition(
  grade: WorkSkillGrade,
): WorkSkillGradeDefinition {
  const definition = WORK_SKILL_GRADE_BY_CODE.get(grade);

  if (!definition) {
    throw new Error(`Unknown work skill grade: ${grade}`);
  }

  return definition;
}

export function resolveRatingForGradeSelection(
  currentRating: number | null | undefined,
  selectedGrade: WorkSkillGrade,
): number {
  if (currentRating != null && getWorkSkillGrade(currentRating) === selectedGrade) {
    return currentRating;
  }

  return getWorkSkillGradeDefinition(selectedGrade).representativeRating;
}

export function addUnratedWorkTypeRating(
  ratings: Record<string, number>,
  workTypeCode: string,
): Record<string, number> {
  return {
    ...ratings,
    [workTypeCode]: ratings[workTypeCode] ?? 0,
  };
}

export function removeWorkTypeRating(
  ratings: Record<string, number>,
  workTypeCode: string,
): Record<string, number> {
  const nextRatings = { ...ratings };
  delete nextRatings[workTypeCode];
  return nextRatings;
}
