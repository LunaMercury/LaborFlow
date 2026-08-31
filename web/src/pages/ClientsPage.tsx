import { useEffect, useMemo, useRef, useState } from "react";
import {
  createClient,
  deleteClient,
  fetchClients,
  updateClient,
  type Client,
  type ClientWorkSitePayload,
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
  workSites: ClientWorkSiteForm[];
};

type ClientWorkSiteForm = ClientWorkSitePayload & {
  collapsed: boolean;
  draftId: string;
};

let nextWorkSiteDraftId = 0;

function createWorkSiteForm(
  workSite?: Partial<ClientWorkSitePayload>,
): ClientWorkSiteForm {
  nextWorkSiteDraftId += 1;
  return {
    collapsed: false,
    draftId: workSite?.uuid || `new-work-site-${nextWorkSiteDraftId}`,
    farmAddress: workSite?.farmAddress ?? "",
    memo: workSite?.memo ?? "",
    siteName: workSite?.siteName ?? "",
    uuid: workSite?.uuid ?? null,
  };
}

function createEmptyClientForm(): ClientFormState {
  return {
    bankAccount: "",
    businessName: "",
    memo: "",
    name: "",
    nickname: "",
    phone: "",
    workSites: [createWorkSiteForm()],
  };
}

function getClientDisplayName(client: Client) {
  return (
    client.name ||
    client.nickname ||
    client.businessName ||
    client.phone ||
    ""
  );
}

function getClientSubText(client: Client) {
  const parts = [client.workSites[0]?.siteName, client.phone].filter(Boolean);
  return parts.join(" · ");
}

function toFormState(client: Client): ClientFormState {
  return {
    bankAccount: client.bankAccount,
    businessName: client.businessName,
    memo: client.memo,
    name: client.name,
    nickname: client.nickname,
    phone: client.phone,
    workSites: client.workSites.map((workSite) => createWorkSiteForm(workSite)),
  };
}

function toClientPayload(formState: ClientFormState) {
  return {
    bankAccount: formState.bankAccount,
    businessName: formState.businessName,
    memo: formState.memo,
    name: formState.name,
    nickname: formState.nickname,
    phone: formState.phone,
    workSites: formState.workSites
      .filter((workSite) =>
        [workSite.siteName, workSite.farmAddress, workSite.memo].some(
          (value) => value.trim().length > 0,
        ),
      )
      .map((workSite) => ({
        farmAddress: workSite.farmAddress,
        memo: workSite.memo,
        siteName: workSite.siteName,
        uuid: workSite.uuid,
      })),
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

function getClientRegistrationError(formState: ClientFormState) {
  if (!formState.name.trim() && !formState.nickname.trim()) {
    return "이름 또는 호칭 중 하나를 입력해주세요.";
  }

  const phoneDigits = formState.phone.replace(/\D/g, "");
  if (![10, 11].includes(phoneDigits.length)) {
    return "전화번호는 숫자 10~11자리로 입력해주세요.";
  }

  if (
    formState.workSites.some(
      (workSite) =>
        !workSite.siteName.trim() &&
        Boolean(workSite.farmAddress.trim() || workSite.memo.trim()),
    )
  ) {
    return "현장주소나 메모를 입력한 현장에는 현장명이 필요합니다.";
  }

  return "";
}

type ClientWorkSiteEditorProps = {
  onChange: (workSites: ClientWorkSiteForm[]) => void;
  workSites: ClientWorkSiteForm[];
};

function ClientWorkSiteEditor({
  onChange,
  workSites,
}: ClientWorkSiteEditorProps) {
  const addWorkSite = () => {
    onChange([...workSites, createWorkSiteForm()]);
  };

  const updateWorkSite = (
    draftId: string,
    field: "farmAddress" | "memo" | "siteName",
    value: string,
  ) => {
    onChange(
      workSites.map((workSite) =>
        workSite.draftId === draftId
          ? { ...workSite, [field]: value }
          : workSite,
      ),
    );
  };

  const toggleWorkSite = (draftId: string) => {
    onChange(
      workSites.map((workSite) =>
        workSite.draftId === draftId
          ? { ...workSite, collapsed: !workSite.collapsed }
          : workSite,
      ),
    );
  };

  const removeWorkSite = (draftId: string) => {
    const nextWorkSites = workSites.filter(
      (workSite) => workSite.draftId !== draftId,
    );
    onChange(nextWorkSites.length > 0 ? nextWorkSites : [createWorkSiteForm()]);
  };

  return (
    <section className={styles.clientWorkSiteEditor}>
      <div className={styles.clientWorkSiteEditorTitleRow}>
        <div>
          <strong>현장</strong>
          <span>거래처가 운영하는 현장을 여러 곳 등록할 수 있습니다.</span>
        </div>
        <button type="button" onClick={addWorkSite}>
          현장 추가 +
        </button>
      </div>
      <div className={styles.clientWorkSiteEditList}>
        {workSites.map((workSite, index) => (
          <article className={styles.clientWorkSiteEditCard} key={workSite.draftId}>
            <div className={styles.clientWorkSiteEditHeader}>
              <strong>{workSite.siteName.trim() || `현장 ${index + 1}`}</strong>
              <div>
                <button
                  type="button"
                  onClick={() => toggleWorkSite(workSite.draftId)}
                >
                  {workSite.collapsed ? "펼치기" : "접기"}
                </button>
                <button
                  className={styles.clientWorkSiteRemoveButton}
                  type="button"
                  onClick={() => removeWorkSite(workSite.draftId)}
                >
                  삭제
                </button>
              </div>
            </div>
            {!workSite.collapsed ? (
              <div className={styles.clientWorkSiteEditBody}>
                <label>
                  <span>현장명</span>
                  <input
                    maxLength={150}
                    placeholder="예: 동문 제1농장"
                    value={workSite.siteName}
                    onChange={(event) =>
                      updateWorkSite(
                        workSite.draftId,
                        "siteName",
                        event.target.value,
                      )
                    }
                  />
                </label>
                <label>
                  <span>현장주소</span>
                  <input
                    placeholder="현장 주소를 입력하세요"
                    value={workSite.farmAddress}
                    onChange={(event) =>
                      updateWorkSite(
                        workSite.draftId,
                        "farmAddress",
                        event.target.value,
                      )
                    }
                  />
                </label>
                <label>
                  <span>메모</span>
                  <textarea
                    placeholder="현장별 참고사항을 입력하세요"
                    rows={3}
                    value={workSite.memo}
                    onChange={(event) =>
                      updateWorkSite(
                        workSite.draftId,
                        "memo",
                        event.target.value,
                      )
                    }
                  />
                </label>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export function ClientsPage({ loginId }: ClientsPageProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedProfileUuid, setSelectedProfileUuid] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [formState, setFormState] = useState<ClientFormState>(createEmptyClientForm);
  const [editFormState, setEditFormState] = useState<ClientFormState>(createEmptyClientForm);
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
    setFormState(createEmptyClientForm());
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
    const registrationError = getClientRegistrationError(formState);
    if (registrationError) {
      setFormError(registrationError);
      return;
    }

    setIsSaving(true);
    setFormError("");

    try {
      const nextClients = await createClient(loginId, toClientPayload(formState));
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
      setInlineError("이름, 호칭, 전화번호 중 하나는 입력해야 합니다.");
      return;
    }

    const registrationError = getClientRegistrationError(editFormState);
    if (registrationError) {
      setInlineError(registrationError);
      return;
    }

    setIsSaving(true);
    setInlineError("");

    try {
      const nextClients = await updateClient(
        loginId,
        client.profileUuid,
        toClientPayload(editFormState),
      );
      const updatedClient = nextClients.find(
        (nextClient) => nextClient.profileUuid === client.profileUuid,
      ) ?? client;
      const nextVisibleClients = nextClients.some(
        (nextClient) => nextClient.profileUuid === client.profileUuid,
      )
        ? nextClients
        : clients.map((currentClient) =>
            currentClient.profileUuid === client.profileUuid
              ? updatedClient
              : currentClient,
          );

      setClients(nextVisibleClients);
      setSelectedProfileUuid(client.profileUuid);
      setEditingProfileUuid(null);
      setEditFormState(createEmptyClientForm());
      setStatusMessage("적용되었습니다.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "거래처 정보를 저장하지 못했습니다.";
      setInlineError(message);
      setStatusMessage(message);
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

                      <ClientWorkSiteEditor
                        workSites={editFormState.workSites}
                        onChange={(workSites) =>
                          setEditFormState((currentFormState) => ({
                            ...currentFormState,
                            workSites,
                          }))
                        }
                      />

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
                          <strong>{selectedClient.name}</strong>
                        </div>
                        <div className={styles.clientInfoItem}>
                          <span>호칭</span>
                          <strong>{selectedClient.nickname}</strong>
                        </div>
                        <div className={styles.clientInfoItem}>
                          <span>전화번호</span>
                          <strong>{selectedClient.phone}</strong>
                        </div>
                        <div className={styles.clientInfoItem}>
                          <span>계좌번호</span>
                          <strong>{selectedClient.bankAccount}</strong>
                        </div>
                      </div>

                      <div className={styles.clientWorkSiteSection}>
                        <h3>현장</h3>
                        {selectedClient.workSites.length > 0 ? (
                          <div className={styles.clientWorkSiteList}>
                            {selectedClient.workSites.map((workSite) => (
                              <details
                                className={styles.clientWorkSiteCard}
                                key={workSite.uuid}
                                open
                              >
                                <summary>
                                  <strong>{workSite.siteName}</strong>
                                  <span>접기/펼치기</span>
                                </summary>
                                <div className={styles.clientWorkSiteViewBody}>
                                  {workSite.farmAddress ? (
                                    <p>{workSite.farmAddress}</p>
                                  ) : null}
                                  {workSite.memo ? <span>{workSite.memo}</span> : null}
                                </div>
                              </details>
                            ))}
                          </div>
                        ) : (
                          <p className={styles.emptyClientWorkSite}>
                            등록된 현장이 없습니다.
                          </p>
                        )}
                      </div>

                      <div className={styles.clientMemoBox}>
                        <span>메모</span>
                        <p>{selectedClient.memo}</p>
                      </div>
                    </>
                  )}

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
                  <label htmlFor="client-name">
                    이름 <span className={styles.requiredMark}>* 둘 중 하나</span>
                  </label>
                  <input
                    id="client-name"
                    value={formState.name}
                    onChange={(event) => updateFormValue("name", event.target.value)}
                  />
                </div>
                <div className={styles.clientFormField}>
                  <label htmlFor="client-nickname">
                    호칭 <span className={styles.requiredMark}>* 둘 중 하나</span>
                  </label>
                  <input
                    id="client-nickname"
                    value={formState.nickname}
                    onChange={(event) =>
                      updateFormValue("nickname", event.target.value)
                    }
                  />
                </div>
                <div className={styles.clientFormField}>
                  <label htmlFor="client-phone">
                    전화번호 <span className={styles.requiredMark}>*</span>
                  </label>
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
              </div>
              <ClientWorkSiteEditor
                workSites={formState.workSites}
                onChange={(workSites) =>
                  setFormState((currentFormState) => ({
                    ...currentFormState,
                    workSites,
                  }))
                }
              />
              <div className={styles.clientFormWideField}>
                <label htmlFor="client-memo">거래처 메모</label>
                <textarea
                  id="client-memo"
                  value={formState.memo}
                  onChange={(event) => updateFormValue("memo", event.target.value)}
                />
              </div>
              <p className={styles.clientFormHelp}>
                <span className={styles.requiredMark}>*</span> 이름과 호칭은 둘 중
                하나만 입력해도 되며, 전화번호는 반드시 필요합니다.
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
