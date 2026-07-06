import appStyles from "../App.module.css";
import styles from "./FormsPage.module.css";

type OfficeForm = {
  description: string;
  fileName: string;
  title: string;
};

type FormsPageProps = {
  loginId: string;
};

const officeForms: OfficeForm[] = [
  {
    title: "근로계약서",
    description: "일용직 또는 기간제 작업자와 작업 조건을 확인할 때 사용하는 기본 서식입니다.",
    fileName: "labor-contract-template.txt",
  },
  {
    title: "개인정보 수집 및 이용 동의서",
    description: "전화번호, 계좌번호, 민감 업무 메모 등 개인정보를 수집하기 전 확인하는 서식입니다.",
    fileName: "personal-information-consent-template.txt",
  },
  {
    title: "출근부",
    description: "현장별 출근, 결근, 조퇴, 대체 투입 기록을 정리하는 서식입니다.",
    fileName: "attendance-sheet-template.txt",
  },
  {
    title: "작업 배치표",
    description: "농장주, 작업장, 날짜, 작업자 배정 현황을 공유하기 위한 서식입니다.",
    fileName: "work-assignment-template.txt",
  },
  {
    title: "임금 지급 확인서",
    description: "작업자별 지급 금액과 지급일을 확인하고 분쟁을 줄이기 위한 서식입니다.",
    fileName: "wage-payment-confirmation-template.txt",
  },
  {
    title: "안전교육 확인서",
    description: "현장 투입 전 안전 안내와 교육 확인 내역을 남기는 서식입니다.",
    fileName: "safety-training-confirmation-template.txt",
  },
];

function buildFormTemplate(form: OfficeForm, loginId: string) {
  return [
    form.title,
    "",
    `담당 계정: ${loginId}`,
    `설명: ${form.description}`,
    "",
    "작성일:",
    "현장명:",
    "담당자:",
    "",
    "내용:",
    "",
    "서명:",
    "",
  ].join("\n");
}

function downloadForm(form: OfficeForm, loginId: string) {
  const blob = new Blob([buildFormTemplate(form, loginId)], {
    type: "text/plain;charset=utf-8",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = form.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function FormsPage({ loginId }: FormsPageProps) {
  return (
    <main className={appStyles.tableMainContent}>
      <section className={styles.formsPanel} aria-labelledby="forms-title">
        <div className={styles.formsHeader}>
          <div>
            <p className={styles.sectionLabel}>각종 서식</p>
            <h1 id="forms-title">인력사무소 필수 서식</h1>
            <p className={styles.formsDescription}>
              인력사무소 운영에 필요한 근로계약, 개인정보 동의, 출근부,
              임금 지급, 안전교육 관련 서식을 보관하고 다운로드하는
              공간입니다.
            </p>
          </div>
        </div>

        <div className={styles.formList}>
          {officeForms.map((form) => (
            <article className={styles.formItem} key={form.fileName}>
              <div className={styles.formTextGroup}>
                <h2>{form.title}</h2>
                <p>{form.description}</p>
              </div>
              <button
                className={styles.formDownloadButton}
                type="button"
                onClick={() => downloadForm(form, loginId)}
              >
                다운로드
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
