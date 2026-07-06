import { useEffect, useMemo, useState } from "react";
import { deleteWorkerTeam, fetchWorkers } from "../api/workforceApi";
import appStyles from "../App.module.css";
import {
  TeamCompositionModal,
  type EditableWorkerTeam,
} from "../components/TeamCompositionModal";
import type { WorkerRow } from "../data/workerRows";
import teamsStyles from "./TeamsPage.module.css";

const styles = { ...appStyles, ...teamsStyles };

type TeamsPageProps = {
  loginId: string;
};

type WorkerTeam = {
  displayOrder: number;
  name: string;
  uuid: string;
  workers: WorkerRow[];
};

type TeamCompositionModalState =
  | {
      mode: "create";
    }
  | {
      mode: "edit";
      team: EditableWorkerTeam;
    };

function getWorkerDisplayName(worker: WorkerRow) {
  return worker.name || worker.nickname || "이름 없음";
}

function getWorkerSubName(worker: WorkerRow) {
  if (!worker.name || !worker.nickname) {
    return "";
  }

  return worker.nickname;
}

export function TeamsPage({ loginId }: TeamsPageProps) {
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [compositionModalState, setCompositionModalState] =
    useState<TeamCompositionModalState | null>(null);
  const [collapsedTeamUuids, setCollapsedTeamUuids] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    let isMounted = true;

    fetchWorkers(loginId)
      .then((nextWorkers) => {
        if (!isMounted) {
          return;
        }

        setWorkers(nextWorkers);
        setStatusMessage("");
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setWorkers([]);
        setStatusMessage("팀 정보를 불러오지 못했습니다.");
      });

    return () => {
      isMounted = false;
    };
  }, [loginId]);

  const { teams, unassignedWorkers } = useMemo(() => {
    const teamsByUuid = new Map<string, WorkerTeam>();
    const nextUnassignedWorkers: WorkerRow[] = [];

    for (const worker of workers) {
      if (!worker.teamUuid || !worker.teamName) {
        nextUnassignedWorkers.push(worker);
        continue;
      }

      const existingTeam = teamsByUuid.get(worker.teamUuid);
      if (existingTeam) {
        existingTeam.workers.push(worker);
        continue;
      }

      teamsByUuid.set(worker.teamUuid, {
        displayOrder: worker.teamDisplayOrder ?? 0,
        name: worker.teamName,
        uuid: worker.teamUuid,
        workers: [worker],
      });
    }

    const nextTeams = Array.from(teamsByUuid.values())
      .map((team) => ({
        ...team,
        workers: team.workers.sort(
          (leftWorker, rightWorker) =>
            (leftWorker.teamDisplayOrder ?? 0) -
              (rightWorker.teamDisplayOrder ?? 0) ||
            getWorkerDisplayName(leftWorker).localeCompare(
              getWorkerDisplayName(rightWorker),
              "ko",
            ),
        ),
      }))
      .sort(
        (leftTeam, rightTeam) =>
          leftTeam.displayOrder - rightTeam.displayOrder ||
          leftTeam.name.localeCompare(rightTeam.name, "ko"),
      );

    nextUnassignedWorkers.sort((leftWorker, rightWorker) =>
      getWorkerDisplayName(leftWorker).localeCompare(
        getWorkerDisplayName(rightWorker),
        "ko",
      ),
    );

    return {
      teams: nextTeams,
      unassignedWorkers: nextUnassignedWorkers,
    };
  }, [workers]);

  const toggleTeamCollapsed = (teamUuid: string) => {
    setCollapsedTeamUuids((currentTeamUuids) => {
      const nextTeamUuids = new Set(currentTeamUuids);
      if (nextTeamUuids.has(teamUuid)) {
        nextTeamUuids.delete(teamUuid);
      } else {
        nextTeamUuids.add(teamUuid);
      }

      return nextTeamUuids;
    });
  };

  const removeTeam = async (team: WorkerTeam) => {
    const shouldDelete = window.confirm(
      `${team.name} 팀을 삭제할까요? DB에서는 삭제 시각만 기록하고 목록에서 숨깁니다.`,
    );
    if (!shouldDelete) {
      return;
    }

    try {
      const nextWorkers = await deleteWorkerTeam(loginId, team.uuid);
      setWorkers(nextWorkers);
      setStatusMessage("팀을 삭제했습니다.");
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "팀을 삭제하지 못했습니다.",
      );
    }
  };

  return (
    <main className={styles.tableMainContent}>
      <section className={styles.teamsPanel} aria-labelledby="teams-title">
        <div className={styles.teamsPageHeader}>
          <div className={styles.teamsHeading}>
            <p className={styles.sectionLabel}>인력 현황</p>
            <h1 id="teams-title">팀 목록</h1>
            {statusMessage ? (
              <p className={styles.teamsStatusMessage}>{statusMessage}</p>
            ) : null}
          </div>
          <div className={styles.teamsHeaderActions}>
            <div className={styles.teamsSummary}>
              <span>팀 {teams.length}개</span>
              <span>미배정 {unassignedWorkers.length}명</span>
            </div>
            <button
              className={styles.composeTeamButton}
              type="button"
              onClick={() => setCompositionModalState({ mode: "create" })}
            >
              팀 구성하기
            </button>
          </div>
        </div>

        <div className={styles.teamsLayout}>
          <section className={styles.teamListSection} aria-label="팀 목록">
            {teams.length > 0 ? (
              teams.map((team) => {
                const isCollapsed = collapsedTeamUuids.has(team.uuid);

                return (
                <article
                  className={`${styles.teamCard} ${
                    isCollapsed ? styles.collapsedTeamCard : ""
                  }`}
                  key={team.uuid}
                >
                  <div className={styles.teamCardHeader}>
                    <h2>{team.name}</h2>
                    <div className={styles.teamCardHeaderActions}>
                      <span>{team.workers.length}명</span>
                      <button
                        className={styles.editTeamButton}
                        type="button"
                        onClick={() =>
                          setCompositionModalState({
                            mode: "edit",
                            team: {
                              name: team.name,
                              uuid: team.uuid,
                              workers: team.workers,
                            },
                          })
                        }
                      >
                        수정
                      </button>
                      <button
                        className={styles.deleteTeamButton}
                        type="button"
                        onClick={() => removeTeam(team)}
                      >
                        삭제
                      </button>
                      <button
                        aria-label={
                          isCollapsed
                            ? `${team.name} 팀원 펼치기`
                            : `${team.name} 팀원 접기`
                        }
                        className={styles.collapseTeamButton}
                        type="button"
                        onClick={() => toggleTeamCollapsed(team.uuid)}
                      >
                        {isCollapsed ? "+" : "-"}
                      </button>
                    </div>
                  </div>
                  {!isCollapsed ? (
                    <div className={styles.teamMemberList}>
                      {team.workers.map((worker) => (
                        <div
                          className={styles.teamMemberRow}
                          key={worker.profileUuid ?? `${team.uuid}-${worker.phone}`}
                        >
                          <div className={styles.teamMemberNameGroup}>
                            <strong>{getWorkerDisplayName(worker)}</strong>
                            {getWorkerSubName(worker) ? (
                              <span>- {getWorkerSubName(worker)}</span>
                            ) : null}
                          </div>
                          <span className={styles.teamMemberMeta}>
                            {worker.pickupLocation || "승차장소 없음"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
                );
              })
            ) : (
              <div className={styles.emptyTeamPanel}>구성된 팀이 없습니다.</div>
            )}
          </section>

          <aside className={styles.unassignedWorkerPanel} aria-label="미배정 작업자">
            <div className={styles.unassignedWorkerHeader}>
              <h2>미배정 작업자</h2>
              <span>{unassignedWorkers.length}명</span>
            </div>
            <div className={styles.unassignedWorkerList}>
              {unassignedWorkers.length > 0 ? (
                unassignedWorkers.map((worker) => (
                  <div
                    className={styles.unassignedWorkerItem}
                    key={worker.profileUuid ?? worker.phone}
                  >
                    <strong>{getWorkerDisplayName(worker)}</strong>
                    <span>{worker.pickupLocation || "승차장소 없음"}</span>
                  </div>
                ))
              ) : (
                <p>미배정 작업자가 없습니다.</p>
              )}
            </div>
          </aside>
        </div>
      </section>
      {compositionModalState ? (
        <TeamCompositionModal
          loginId={loginId}
          mode={compositionModalState.mode}
          team={
            compositionModalState.mode === "edit"
              ? compositionModalState.team
              : undefined
          }
          workers={workers}
          onClose={() => setCompositionModalState(null)}
          onSaved={(nextWorkers) => {
            setWorkers(nextWorkers);
            setStatusMessage(
              compositionModalState.mode === "edit"
                ? "팀을 수정했습니다."
                : "팀을 구성했습니다.",
            );
          }}
        />
      ) : null}
    </main>
  );
}
