import { useEffect, useMemo, useRef, useState } from "react";
import { createClient, fetchClients, type Client } from "../api/clientsApi";
import appStyles from "../App.module.css";
import clientsStyles from "./ClientsPage.module.css";

const styles = { ...appStyles, ...clientsStyles };

type ClientsPageProps = {
  loginId: string;
};

type ClientFormState = {
  bankAccount: string;
  businessName: string;
  memo: string;
  name: string;
  nickname: string;
  phone: string;
};

const emptyClientForm: ClientFormState = {
  bankAccount: "",
  businessName: "",
  memo: "",
  name: "",
  nickname: "",
  phone: "",
};

function getClientDisplayName(client: Client) {
  return (
    client.name ||
    client.nickname ||
    client.businessName ||
    client.phone ||
    "이름 없음"
  );
}

function getClientSubText(client: Client) {
  const parts = [client.businessName, client.phone].filter(Boolean);
  return parts.join(" · ");
}

function getWorkSiteTitle(siteName: string, workDescription: string) {
  if (siteName && workDescription) {
    return `${siteName} · ${workDescription}`;
  }

  return siteName || workDescription || "작업장 정보 없음";
}

function formatPhoneInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export function ClientsPage({ loginId }: ClientsPageProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedProfileUuid, setSelectedProfileUuid] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formState, setFormState] = useState<ClientFormState>(emptyClientForm);
  const [statusMessage, setStatusMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isMobileCallImportAvailable, setIsMobileCallImportAvailable] =
    useState(false);
  const [callImportMessage, setCallImportMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetchClients(loginId)
      .then((nextClients) => {
        if (!isMounted) {
          return;
        }

        setClients(nextClients);
        setSelectedProfileUuid((currentProfileUuid) => {
          if (
            currentProfileUuid &&
            nextClients.some((client) => client.profileUuid === currentProfileUuid)
          ) {
            return currentProfileUuid;
          }

          return nextClients[0]?.profileUuid ?? null;
        });
        setStatusMessage("");
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setClients([]);
        setSelectedProfileUuid(null);
        setStatusMessage("거래처 목록을 불러오지 못했습니다.");
      });

    return () => {
      isMounted = false;
    };
  }, [loginId]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 720px)");
    const updateAvailability = () => {
      setIsMobileCallImportAvailable(mediaQuery.matches);
    };

    updateAvailability();
    mediaQuery.addEventListener("change", updateAvailability);

    return () => mediaQuery.removeEventListener("change", updateAvailability);
  }, []);

  const selectedClient = useMemo(() => {
    return (
      clients.find((client) => client.profileUuid === selectedProfileUuid) ??
      clients[0] ??
      null
    );
  }, [clients, selectedProfileUuid]);

  const openCreateModal = () => {
    setFormState(emptyClientForm);
    setFormError("");
    setCallImportMessage("");
    setIsModalOpen(true);
  };

  const closeCreateModal = () => {
    if (isSaving) {
      return;
    }

    setIsModalOpen(false);
    setFormError("");
    setCallImportMessage("");
  };

  const updateFormValue = (field: keyof ClientFormState, value: string) => {
    setFormState((currentFormState) => ({
      ...currentFormState,
      [field]: field === "phone" ? formatPhoneInput(value) : value,
    }));
  };

  const handleCallImport = () => {
    if (!isMobileCallImportAvailable) {
      return;
    }

    fileInputRef.current?.click();
  };

  const handleCallFileSelected = (fileList: FileList | null) => {
    const selectedFile = fileList?.[0];
    if (!selectedFile) {
      return;
    }

    setCallImportMessage(
      `선택된 파일: ${selectedFile.name}. 분석 기능 연결 후 이 입력폼에 자동완성됩니다.`,
    );
  };

  const submitClient = async () => {
    const hasVisibleLabel = [
      formState.name,
      formState.nickname,
      formState.businessName,
      formState.phone,
    ].some((value) => value.trim().length > 0);

    if (!hasVisibleLabel) {
      setFormError("이름, 호칭, 상호/농장명, 전화번호 중 하나는 입력해야 합니다.");
      return;
    }

    setIsSaving(true);
    setFormError("");

    try {
      const nextClients = await createClient(loginId, formState);
      setClients(nextClients);
      setSelectedProfileUuid((currentProfileUuid) => {
        if (
          currentProfileUuid &&
          nextClients.some((client) => client.profileUuid === currentProfileUuid)
        ) {
          return currentProfileUuid;
        }

        return nextClients[0]?.profileUuid ?? null;
      });
      setStatusMessage("거래처가 등록되었습니다.");
      setIsModalOpen(false);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "거래처를 등록하지 못했습니다.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className={styles.tableMainContent}>
      <section className={styles.clientsPanel} aria-labelledby="clients-title">
        <div className={styles.clientsPageHeader}>
          <div className={styles.clientsHeading}>
            <p className={styles.sectionLabel}>인력 현황</p>
            <h1 id="clients-title">거래처 목록</h1>
            <p className={styles.clientsLead}>
              농장주와 작업장 이력을 거래처 단위로 확인합니다.
            </p>
            {statusMessage ? (
              <p className={styles.clientsLead}>{statusMessage}</p>
            ) : null}
          </div>
          <div className={styles.clientsHeaderActions}>
            <span className={styles.clientsSummary}>거래처 {clients.length}곳</span>
            <button
              className={styles.addClientButton}
              type="button"
              onClick={openCreateModal}
            >
              거래처 추가 +
            </button>
          </div>
        </div>

        <div className={styles.clientsLayout}>
          <aside className={styles.clientListPanel} aria-label="거래처 목록">
            <div className={styles.clientListHeader}>
              <h2>거래처</h2>
              <span>{clients.length}곳</span>
            </div>
            <div className={styles.clientList}>
              {clients.length > 0 ? (
                clients.map((client) => (
                  <button
                    className={`${styles.clientListItem} ${
                      selectedClient?.profileUuid === client.profileUuid
                        ? styles.activeClientListItem
                        : ""
                    }`}
                    key={client.profileUuid}
                    type="button"
                    onClick={() => setSelectedProfileUuid(client.profileUuid)}
                  >
                    <strong>{getClientDisplayName(client)}</strong>
                    {getClientSubText(client) ? (
                      <span>{getClientSubText(client)}</span>
                    ) : null}
                  </button>
                ))
              ) : (
                <p className={styles.emptyClientState}>등록된 거래처가 없습니다.</p>
              )}
            </div>
          </aside>

          <section className={styles.clientDetailPanel} aria-label="거래처 상세">
            {selectedClient ? (
              <>
                <div className={styles.clientDetailHeader}>
                  <h2>{getClientDisplayName(selectedClient)}</h2>
                  <span>{selectedClient.workSites.length}개 작업장</span>
                </div>
                <div className={styles.clientDetailBody}>
                  <div className={styles.clientInfoGrid}>
                    <div className={styles.clientInfoItem}>
                      <span>이름</span>
                      <strong>{selectedClient.name || "미입력"}</strong>
                    </div>
                    <div className={styles.clientInfoItem}>
                      <span>호칭</span>
                      <strong>{selectedClient.nickname || "미입력"}</strong>
                    </div>
                    <div className={styles.clientInfoItem}>
                      <span>상호/농장명</span>
                      <strong>{selectedClient.businessName || "미입력"}</strong>
                    </div>
                    <div className={styles.clientInfoItem}>
                      <span>전화번호</span>
                      <strong>{selectedClient.phone || "미입력"}</strong>
                    </div>
                    <div className={styles.clientInfoItem}>
                      <span>계좌번호</span>
                      <strong>{selectedClient.bankAccount || "미입력"}</strong>
                    </div>
                  </div>

                  <div className={styles.clientMemoBox}>
                    <span>메모</span>
                    <p>{selectedClient.memo || "등록된 메모가 없습니다."}</p>
                  </div>

                  <div className={styles.clientWorkSiteSection}>
                    <h3>작업장 이력</h3>
                    {selectedClient.workSites.length > 0 ? (
                      <div className={styles.clientWorkSiteList}>
                        {selectedClient.workSites.map((workSite) => (
                          <article
                            className={styles.clientWorkSiteCard}
                            key={workSite.uuid}
                          >
                            <strong>
                              {getWorkSiteTitle(
                                workSite.siteName,
                                workSite.workDescription,
                              )}
                            </strong>
                            <p>{workSite.farmAddress || "주소 미입력"}</p>
                            {workSite.workDateRange ? (
                              <span>{workSite.workDateRange}</span>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.emptyClientDetail}>
                        등록된 작업장이 없습니다.
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className={styles.emptyClientDetail}>
                왼쪽 목록에서 거래처를 선택하거나 새 거래처를 추가하세요.
              </p>
            )}
          </section>
        </div>
      </section>

      {isModalOpen ? (
        <div
          className={styles.clientModalBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCreateModal();
            }
          }}
        >
          <section
            aria-labelledby="client-modal-title"
            aria-modal="true"
            className={styles.clientModalPanel}
            role="dialog"
          >
            <div className={styles.clientModalHeader}>
              <h2 id="client-modal-title">거래처 추가</h2>
              <div className={styles.clientModalActions}>
                <button
                  className={styles.clientModalPrimaryButton}
                  disabled={isSaving}
                  type="button"
                  onClick={submitClient}
                >
                  {isSaving ? "등록 중" : "등록"}
                </button>
                <button
                  className={styles.clientModalSecondaryButton}
                  type="button"
                  onClick={closeCreateModal}
                >
                  취소
                </button>
              </div>
            </div>

            <div className={styles.clientModalBody}>
              <div className={styles.callImportBox}>
                <div className={styles.callImportHeader}>
                  <span className={styles.callImportTitle}>통화 기반 자동입력</span>
                  <button
                    className={styles.callImportButton}
                    disabled={!isMobileCallImportAvailable}
                    type="button"
                    onClick={handleCallImport}
                  >
                    통화기록에서
                  </button>
                  <input
                    ref={fileInputRef}
                    accept="audio/*"
                    hidden
                    type="file"
                    onChange={(event) => handleCallFileSelected(event.target.files)}
                  />
                </div>
                <p className={styles.callImportDescription}>
                  모바일 환경에서 녹음 파일을 선택하면, 이후 분석 파이프라인이 이
                  입력폼을 자동완성하는 구조로 연결됩니다.
                </p>
                {callImportMessage ? (
                  <p className={styles.callImportDescription}>{callImportMessage}</p>
                ) : null}
              </div>

              <div className={styles.clientFormGrid}>
                <div className={styles.clientFormField}>
                  <label htmlFor="client-name">이름</label>
                  <input
                    id="client-name"
                    value={formState.name}
                    onChange={(event) => updateFormValue("name", event.target.value)}
                  />
                </div>
                <div className={styles.clientFormField}>
                  <label htmlFor="client-nickname">호칭</label>
                  <input
                    id="client-nickname"
                    value={formState.nickname}
                    onChange={(event) =>
                      updateFormValue("nickname", event.target.value)
                    }
                  />
                </div>
                <div className={styles.clientFormField}>
                  <label htmlFor="client-business-name">상호/농장명</label>
                  <input
                    id="client-business-name"
                    value={formState.businessName}
                    onChange={(event) =>
                      updateFormValue("businessName", event.target.value)
                    }
                  />
                </div>
                <div className={styles.clientFormField}>
                  <label htmlFor="client-phone">전화번호</label>
                  <input
                    id="client-phone"
                    inputMode="numeric"
                    value={formState.phone}
                    onChange={(event) => updateFormValue("phone", event.target.value)}
                  />
                </div>
                <div className={styles.clientFormWideField}>
                  <label htmlFor="client-bank-account">계좌번호</label>
                  <input
                    id="client-bank-account"
                    inputMode="numeric"
                    value={formState.bankAccount}
                    onChange={(event) =>
                      updateFormValue("bankAccount", event.target.value)
                    }
                  />
                  <p className={styles.clientFormHelp}>
                    은행명 선택/계좌 검증은 추후 외부 API 연동 시 분리합니다.
                  </p>
                </div>
                <div className={styles.clientFormWideField}>
                  <label htmlFor="client-memo">메모</label>
                  <textarea
                    id="client-memo"
                    value={formState.memo}
                    onChange={(event) => updateFormValue("memo", event.target.value)}
                  />
                </div>
              </div>
              <p className={styles.clientFormHelp}>
                <span className={styles.requiredMark}>*</span> 이름, 호칭,
                상호/농장명, 전화번호 중 하나는 필요합니다.
              </p>
              {formError ? (
                <p className={styles.clientModalError}>{formError}</p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
