import { useEffect, useMemo, useRef, useState } from "react";
import {
  createClient,
  deleteClient,
  fetchClients,
  updateClient,
  type Client,
} from "../api/clientsApi";
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

function toFormState(client: Client): ClientFormState {
  return {
    bankAccount: client.bankAccount,
    businessName: client.businessName,
    memo: client.memo,
    name: client.name,
    nickname: client.nickname,
    phone: client.phone,
  };
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

function hasVisibleClientLabel(formState: ClientFormState) {
  return [
    formState.name,
    formState.nickname,
    formState.businessName,
    formState.phone,
  ].some((value) => value.trim().length > 0);
}

export function ClientsPage({ loginId }: ClientsPageProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedProfileUuid, setSelectedProfileUuid] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [formState, setFormState] = useState<ClientFormState>(emptyClientForm);
  const [editFormState, setEditFormState] = useState<ClientFormState>(emptyClientForm);
  const [editingProfileUuid, setEditingProfileUuid] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [inlineError, setInlineError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isMobileCallImportAvailable, setIsMobileCallImportAvailable] =
    useState(false);
  const [callImportMessage, setCallImportMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!statusMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStatusMessage("");
    }, 2600);

    return () => window.clearTimeout(timeoutId);
  }, [statusMessage]);

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
    setEditingProfileUuid(null);
    setInlineError("");
  }, [selectedProfileUuid]);

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
    setInlineError("");
    setCallImportMessage("");
    setEditingProfileUuid(null);
    setIsCreateModalOpen(true);
  };

  const startInlineEdit = (client: Client) => {
    setEditFormState(toFormState(client));
    setInlineError("");
    setEditingProfileUuid(client.profileUuid);
  };

  const cancelInlineEdit = () => {
    if (isSaving) {
      return;
    }

    setEditingProfileUuid(null);
    setInlineError("");
  };

  const closeClientModal = () => {
    if (isSaving) {
      return;
    }

    setIsCreateModalOpen(false);
    setFormError("");
    setCallImportMessage("");
  };

  const updateFormValue = (field: keyof ClientFormState, value: string) => {
    setFormState((currentFormState) => ({
      ...currentFormState,
      [field]: field === "phone" ? formatPhoneInput(value) : value,
    }));
  };

  const updateEditValue = (field: keyof ClientFormState, value: string) => {
    setEditFormState((currentFormState) => ({
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
    if (!hasVisibleClientLabel(formState)) {
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
      setIsCreateModalOpen(false);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "거래처 정보를 저장하지 못했습니다.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const submitInlineClient = async (client: Client) => {
    if (!hasVisibleClientLabel(editFormState)) {
      setInlineError("이름, 호칭, 상호/농장명, 전화번호 중 하나는 입력해야 합니다.");
      return;
    }

    setIsSaving(true);
    setInlineError("");

    try {
      const nextClients = await updateClient(loginId, client.profileUuid, editFormState);
      setClients(nextClients);
      setSelectedProfileUuid(client.profileUuid);
      setEditingProfileUuid(null);
      setStatusMessage("거래처 정보를 저장했습니다.");
    } catch (error) {
      setInlineError(
        error instanceof Error ? error.message : "거래처 정보를 저장하지 못했습니다.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const removeClient = async (client: Client) => {
    const shouldDelete = window.confirm(
      `${getClientDisplayName(client)} 거래처를 삭제하시겠습니까?\nDB에서 즉시 삭제하지 않고 목록에서 숨김 처리됩니다.`,
    );
    if (!shouldDelete) {
      return;
    }

    try {
      const nextClients = await deleteClient(loginId, client.profileUuid);
      setClients(nextClients);
      setSelectedProfileUuid((currentProfileUuid) => {
        if (
          currentProfileUuid &&
          currentProfileUuid !== client.profileUuid &&
          nextClients.some((nextClient) => nextClient.profileUuid === currentProfileUuid)
        ) {
          return currentProfileUuid;
        }

        return nextClients[0]?.profileUuid ?? null;
      });
      setEditingProfileUuid(null);
      setStatusMessage("거래처가 삭제되었습니다.");
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "거래처를 삭제하지 못했습니다.",
      );
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
                  <div className={styles.clientDetailTitle}>
                    <h2>{getClientDisplayName(selectedClient)}</h2>
                    <span>{selectedClient.workSites.length}개 작업장</span>
                  </div>
                  <div className={styles.clientDetailActions}>
                    {editingProfileUuid === selectedClient.profileUuid ? (
                      <>
                        <button
                          className={styles.deleteClientButton}
                          disabled={isSaving}
                          type="button"
                          onClick={() => removeClient(selectedClient)}
                        >
                          거래처 삭제
                        </button>
                        <button
                          className={styles.cancelClientButton}
                          disabled={isSaving}
                          type="button"
                          onClick={cancelInlineEdit}
                        >
                          취소
                        </button>
                        <button
                          className={styles.applyClientButton}
                          disabled={isSaving}
                          type="button"
                          onClick={() => submitInlineClient(selectedClient)}
                        >
                          {isSaving ? "저장 중" : "적용"}
                        </button>
                      </>
                    ) : (
                      <button
                        className={styles.editClientButton}
                        disabled={isSaving}
                        type="button"
                        onClick={() => startInlineEdit(selectedClient)}
                      >
                        수정
                      </button>
                    )}
                  </div>
                </div>
                <div className={styles.clientDetailBody}>
                  {editingProfileUuid === selectedClient.profileUuid ? (
                    <>
                      <div className={styles.clientInfoGrid}>
                        <label className={styles.clientInfoEditItem}>
                          <span>이름</span>
                          <input
                            value={editFormState.name}
                            onChange={(event) =>
                              updateEditValue("name", event.target.value)
                            }
                          />
                        </label>
                        <label className={styles.clientInfoEditItem}>
                          <span>호칭</span>
                          <input
                            value={editFormState.nickname}
                            onChange={(event) =>
                              updateEditValue("nickname", event.target.value)
                            }
                          />
                        </label>
                        <label className={styles.clientInfoEditItem}>
                          <span>상호/농장명</span>
                          <input
                            value={editFormState.businessName}
                            onChange={(event) =>
                              updateEditValue("businessName", event.target.value)
                            }
                          />
                        </label>
                        <label className={styles.clientInfoEditItem}>
                          <span>전화번호</span>
                          <input
                            inputMode="numeric"
                            value={editFormState.phone}
                            onChange={(event) =>
                              updateEditValue("phone", event.target.value)
                            }
                          />
                        </label>
                        <label className={styles.clientInfoEditItem}>
                          <span>계좌번호</span>
                          <input
                            inputMode="numeric"
                            value={editFormState.bankAccount}
                            onChange={(event) =>
                              updateEditValue("bankAccount", event.target.value)
                            }
                          />
                        </label>
                      </div>

                      <label className={styles.clientMemoEditBox}>
                        <span>메모</span>
                        <textarea
                          value={editFormState.memo}
                          onChange={(event) =>
                            updateEditValue("memo", event.target.value)
                          }
                        />
                      </label>
                      {inlineError ? (
                        <p className={styles.clientInlineError}>{inlineError}</p>
                      ) : null}
                    </>
                  ) : (
                    <>
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
                    </>
                  )}

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

      {statusMessage ? (
        <div className={styles.clientToast} role="status">
          {statusMessage}
        </div>
      ) : null}

      {isCreateModalOpen ? (
        <div
          className={styles.clientModalBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeClientModal();
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
                  onClick={closeClientModal}
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
