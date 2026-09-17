import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  type ChatSessionEntryDto,
  type ConnectionCardDto,
  type ConnectionDetailDto,
  type ConnectorToolMode,
  connectionAccountLabel,
  connectionCardTitle,
  connectorProviderId,
  type ExecutionSettingsDto,
  type IntegrationProposalOutcomeDto,
  isHeadingOnlyMarkdown,
  type ModelExecutionDto,
  type ModelProviderDto,
  type ModelProviderId,
  type ModelSelectionDto,
  type ModelSettingsDto,
  markdownSummaryDuplicatesBody,
  type RunDetailDto,
  type RunEventDto,
  type RunSummaryDto,
  recipeHostedBlockCopy,
  recipeIsLocalOnly,
  starterRecipeId,
  type TaskRecipeKnowledgeDto,
  type TaskSummaryDto,
  type TaskToolRepairProposalOutcomeDto,
  type ToolApprovalDto,
} from "../shared.ts";
import { api } from "./api.ts";
import { ArtifactDocument } from "./artifact-document.tsx";
import {
  AskBar,
  AskBarProvider,
  useAskBarChip,
  useAvailableChatModels,
  useFocusAskBar,
} from "./ask-bar.tsx";
import { RequestGate } from "./async-refresh.ts";
import { BrandLogo } from "./brand-logo.tsx";
import { ChatDetailPage } from "./chat-page.tsx";
import { chatSessionHref, showsChatLauncher } from "./chat-session-entry.ts";
import { useConfirmationDialog } from "./confirmation-dialog.tsx";
import {
  type ConnectionStatusFilter,
  filterIntegrationCatalog,
  installedIntegrationAccounts,
  oneClickIntegrationState,
  oneClickIntegrations,
  visibleIntegrationCatalog,
} from "./connection-catalog.ts";
import {
  connectorCredentialComplete,
  connectorCredentialInput,
} from "./connector-credential-input.ts";
import { EndingActions } from "./copy-button.tsx";
import { DeleteButton } from "./delete-button.tsx";
import {
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  CopyIcon,
  PlayIcon,
  PlusIcon,
  SlidersIcon,
} from "./icons.tsx";
import {
  askedRowLabel,
  askedRowResponse,
  buildInboxFeed,
  type InboxStatusFilter,
  type InboxView,
  parseInboxView,
  runDotClass,
  runMatchesInboxFilter,
  runRowLabel,
  runRowResponse,
  sessionMatchesInboxFilter,
  sessionOccurredAt,
} from "./inbox-feed.ts";
import {
  defaultImageModelLabel,
  defaultRecipeModelLabel,
  ModelPicker,
  providerName,
} from "./model-picker.tsx";
import {
  modelSetupSettingsPath,
  modelSetupStage,
  modelStartupRedirect,
} from "./model-readiness.ts";
import { ProviderSvg } from "./provider-svg.tsx";
import { ResetSettings } from "./reset-settings.tsx";
import { RollmarkDocument } from "./rollmark-document.tsx";
import { RunMarkdown } from "./run-markdown.tsx";
import { SubscriptionConnect } from "./subscription-connect.tsx";
import {
  readTextSizePreference,
  readThemePreference,
  saveTextSizePreference,
  saveThemePreference,
  type TextSize,
  type ThemeId,
  textSizes,
} from "./themes.ts";
import {
  runProgressLabel,
  runTurnActivity,
  runTurnUsage,
} from "./turn-activity.ts";
import { TurnWork } from "./turn-meter.tsx";

function LegacyConnectionRedirect() {
  const { id = "" } = useParams();
  return <Navigate to={`/integrations/${encodeURIComponent(id)}`} replace />;
}

export function SpringrollApp() {
  const { pathname } = useLocation();
  return (
    <AskBarProvider>
      <div className="app-frame">
        <header className="titlebar" data-tauri-drag-region="deep">
          <Link className="brand" to="/inbox" aria-label="Springroll home">
            <BrandLogo />
          </Link>
          <nav aria-label="Main navigation">
            <NavLink to="/inbox">Inbox</NavLink>
            <NavLink to="/recipes">Recipes</NavLink>
            <NavLink to="/integrations">Integrations</NavLink>
            <NavLink to="/settings">Settings</NavLink>
          </nav>
        </header>
        <ModelSetupNotice />
        <main>
          <Routes>
            <Route
              path="/setup"
              element={<Navigate to="/settings" replace />}
            />
            <Route path="/" element={<Navigate to="/inbox" replace />} />
            <Route path="/chat" element={<Navigate to="/inbox" replace />} />
            <Route path="/chat/:id" element={<ChatDetailPage />} />
            <Route path="/inbox" element={<RunsPage />} />
            <Route path="/inbox/:id" element={<RunDetailPage />} />
            <Route path="/recipes" element={<TasksPage />} />
            <Route
              path="/recipes/new"
              element={<NewRecipeConversationEntryPage />}
            />
            <Route
              path="/recipes/new/manual"
              element={<Navigate to="/recipes/new" replace />}
            />
            <Route path="/recipes/:id" element={<TaskDetailPage />} />
            {/* Legacy paths keep old links working */}
            <Route path="/runs" element={<RunsPage />} />
            <Route path="/runs/:id" element={<RunDetailPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route
              path="/tasks/new"
              element={<NewRecipeConversationEntryPage />}
            />
            <Route path="/tasks/:id" element={<TaskDetailPage />} />
            <Route
              path="/connections"
              element={<Navigate to="/integrations" replace />}
            />
            <Route
              path="/connections/new"
              element={<Navigate to="/integrations/new" replace />}
            />
            <Route
              path="/connections/manual"
              element={<Navigate to="/integrations/manual" replace />}
            />
            <Route
              path="/connections/:id"
              element={<LegacyConnectionRedirect />}
            />
            <Route
              path="/integrations/models"
              element={<Navigate to="/settings" replace />}
            />
            <Route
              path="/integrations/web-search"
              element={<Navigate to="/integrations?tag=search" replace />}
            />
            <Route
              path="/integrations/connections"
              element={<Navigate to="/integrations" replace />}
            />
            <Route
              path="/integrations/connections/new"
              element={<Navigate to="/integrations/new" replace />}
            />
            <Route
              path="/integrations/connections/manual"
              element={<Navigate to="/integrations/manual" replace />}
            />
            <Route
              path="/integrations/mcps"
              element={<Navigate to="/integrations" replace />}
            />
            <Route
              path="/integrations/custom"
              element={<Navigate to="/integrations" replace />}
            />
            <Route
              path="/models"
              element={<Navigate to="/settings" replace />}
            />
            <Route
              path="/integrations"
              element={<ConnectionsIntegrationsPage />}
            />
            <Route
              path="/integrations/new"
              element={<NewIntegrationConversationEntryPage />}
            />
            <Route
              path="/integrations/manual"
              element={<NewIntegrationPage />}
            />
            <Route
              path="/integrations/:id"
              element={<ConnectionDetailPage />}
            />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/inbox" replace />} />
          </Routes>
        </main>
        {showsChatLauncher(pathname) ? <AskBar /> : null}
      </div>
    </AskBarProvider>
  );
}

function ModelSetupNotice() {
  const settings = useAvailableChatModels();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const startupChecked = useRef(false);
  const stage = modelSetupStage(settings);
  const destination = modelSetupSettingsPath(settings);
  useEffect(() => {
    if (!settings || startupChecked.current) return;
    startupChecked.current = true;
    const redirect = modelStartupRedirect(settings, pathname);
    if (redirect) navigate(redirect, { replace: true });
  }, [settings, pathname, navigate]);
  if (!settings || stage === "ready") return null;
  return (
    <div className="model-setup-reminder" role="status">
      <span>
        {stage === "provider"
          ? "Add a provider key to get started."
          : "Provider connected. Select your default model."}
      </span>
      <Link className="model-setup-action" to={destination}>
        {stage === "provider" ? "Add provider key" : "Select default model"}
      </Link>
    </div>
  );
}

function RunsPage() {
  const runs = useLoad(api.runs);
  const tasks = useLoad(api.tasks);
  const chats = useLoad(api.allChats);
  const connections = useLoad(api.connections);
  const focusAskBar = useFocusAskBar();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseInboxView(searchParams.get("view"));
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<InboxStatusFilter>("all");
  const [tagFilter, setTagFilter] = useState<string>();

  const tagByTask = new Map(
    tasks.value?.map((task) => [task.id, task.tag] as const),
  );
  const names = {
    tasks: new Map(tasks.value?.map((task) => [task.id, task.name] as const)),
    connections: new Map(
      connections.value?.map((card) => [card.id, card.name] as const),
    ),
    runs: new Map(runs.value?.map((run) => [run.id, run.taskName] as const)),
  };
  const tags = [
    ...new Set(
      runs.value?.flatMap((run) => {
        const tag = tagByTask.get(run.taskId);
        return tag ? [tag] : [];
      }),
    ),
  ].sort();
  const filterOn =
    query.trim() !== "" ||
    statusFilter !== "all" ||
    (view === "runs" && tagFilter !== undefined);
  const search = query.trim().toLowerCase();
  const visibleRuns = (runs.value ?? []).filter((run) =>
    runMatchesInboxFilter(run, {
      search,
      status: statusFilter,
      tagByTask,
      ...(view === "runs" && tagFilter !== undefined
        ? { tag: tagFilter }
        : undefined),
    }),
  );
  const visibleSessions = (chats.value ?? []).filter((session) =>
    sessionMatchesInboxFilter(session, {
      search,
      status: statusFilter,
      names,
    }),
  );
  const feed =
    runs.loading || chats.loading
      ? []
      : buildInboxFeed(visibleRuns, visibleSessions, view);
  const hasRuns = (runs.value?.length ?? 0) > 0;
  const hasChats = (chats.value?.length ?? 0) > 0;
  const sourceEmpty = view === "chats" ? !hasChats : !hasRuns;
  const filteredEmpty = feed.length === 0 && !sourceEmpty;
  const emptyCopy =
    view === "chats"
      ? {
          title: "Nothing asked yet",
          body: "Ask from the bar below. Every conversation lands here.",
        }
      : {
          title: "No runs yet",
          body: "Create a recipe, try it once, and its note will land here.",
        };

  const setView = (next: InboxView) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === "runs") nextParams.delete("view");
    else nextParams.set("view", next);
    setSearchParams(nextParams, { replace: true });
  };

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setTagFilter(undefined);
  };

  return (
    <Page>
      <PageHeading
        title="Inbox."
        action={
          <div className="heading-actions">
            <fieldset className="seg" aria-label="Inbox view">
              {(
                [
                  ["runs", "Runs"],
                  ["chats", "Chats"],
                ] as const
              ).map(([id, label]) => (
                <button
                  aria-pressed={view === id}
                  className={view === id ? "on" : ""}
                  key={id}
                  onClick={() => setView(id)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </fieldset>
            <FilterControl
              label="Filter inbox"
              on={filterOn}
              open={filterOpen}
              setOpen={setFilterOpen}
            >
              <input
                aria-label="Search inbox"
                className="filter-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search inbox"
                type="search"
                value={query}
              />
              <div className="filter-section-label">Status</div>
              <div className="filter-chips">
                {(["all", "sent", "needs_you", "failed"] as const).map(
                  (status) => (
                    <button
                      className={`filter-chip ${
                        statusFilter === status ? "on" : ""
                      }`}
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      type="button"
                    >
                      {status === "all"
                        ? "All"
                        : status === "sent"
                          ? view === "chats"
                            ? "Done"
                            : "Sent"
                          : status === "needs_you"
                            ? "Needs you"
                            : "Failed"}
                    </button>
                  ),
                )}
              </div>
              {view === "runs" ? (
                <>
                  <div className="filter-section-label">Tags</div>
                  {tags.length > 0 ? (
                    <div className="filter-chips">
                      {tags.map((tag) => (
                        <button
                          className={`filter-chip ${
                            tagFilter === tag ? "on" : ""
                          }`}
                          key={tag}
                          onClick={() =>
                            setTagFilter(tagFilter === tag ? undefined : tag)
                          }
                          type="button"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="filter-empty-note">
                      No tags yet — set one on a recipe page.
                    </p>
                  )}
                </>
              ) : null}
              {filterOn ? (
                <button
                  className="text-action filter-clear"
                  onClick={clearFilters}
                  type="button"
                >
                  Clear filters
                </button>
              ) : null}
            </FilterControl>
          </div>
        }
      />
      {filterOn && filteredEmpty ? (
        <EmptyState
          title="No matches"
          body="Nothing matches the current filters."
          action={
            <button
              className="text-action"
              onClick={clearFilters}
              type="button"
            >
              Clear filters
            </button>
          }
        />
      ) : null}
      {runs.loading || chats.loading ? <LoadingLine /> : null}
      {runs.error ? (
        <ErrorNotice error={runs.error} retry={runs.reload} />
      ) : null}
      {chats.error ? (
        <ErrorNotice error={chats.error} retry={chats.reload} />
      ) : null}
      {!runs.loading && !chats.loading && sourceEmpty ? (
        <EmptyState
          title={emptyCopy.title}
          body={emptyCopy.body}
          action={
            view === "chats" ? undefined : (
              <button
                className="text-action"
                onClick={() => focusAskBar()}
                type="button"
              >
                Create your first recipe
              </button>
            )
          }
        />
      ) : null}
      <div className="run-feed">
        {feed.map((day) => (
          <section className="run-day" key={day.key}>
            <div className="day-heading">{day.label}</div>
            <div className="run-group">
              {day.items.map((item) => {
                if (item.kind === "aggregate") {
                  return (
                    <div className="run-row aggregate" key={item.id}>
                      <time />
                      <span className="run-dot" aria-hidden="true" />
                      <span className="run-title">{item.taskName}</span>
                      <small>
                        {item.summary} · {item.count}×
                      </small>
                    </div>
                  );
                }
                if (item.kind === "asked") {
                  return (
                    <Link
                      className="run-row"
                      data-kind="chat"
                      id={`chat-${item.session.id}`}
                      key={item.session.id}
                      to={chatSessionHref(item.session)}
                    >
                      <time>{formatTime(sessionOccurredAt(item.session))}</time>
                      <span className="run-title">
                        {askedRowLabel(item.session)}
                      </span>
                      {askedRowResponse(item.session, names) ? (
                        <small
                          className={
                            item.session.latestTurnStatus === "failed"
                              ? "bad"
                              : ""
                          }
                        >
                          {askedRowResponse(item.session, names)}
                        </small>
                      ) : null}
                      <i aria-hidden="true">›</i>
                    </Link>
                  );
                }
                return (
                  <Link
                    className="run-row"
                    id={`run-${item.run.id}`}
                    key={item.run.id}
                    to={`/inbox/${item.run.id}`}
                  >
                    <time>{formatTime(item.run.scheduledTime)}</time>
                    <span
                      className={`run-dot ${runDotClass(item.run)}`}
                      aria-hidden="true"
                    />
                    <span className="run-title">{runRowLabel(item.run)}</span>
                    {runRowResponse(item.run) ? (
                      <small
                        className={
                          item.run.status === "failed" && item.run.error
                            ? "bad"
                            : ""
                        }
                      >
                        {runRowResponse(item.run)}
                      </small>
                    ) : null}
                    <i aria-hidden="true">›</i>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Page>
  );
}

function RunDetailPage() {
  const { confirm, confirmation } = useConfirmationDialog();
  const { id = "" } = useParams();
  const run = useLoad(useCallback(() => api.run(id), [id]));
  const navigate = useNavigate();
  const [events, setEvents] = useState<readonly RunEventDto[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [stopping, setStopping] = useState(false);
  useAskBarChip("run", run.value?.taskName);

  useEffect(() => {
    setEvents([]);
    return api.subscribeToRunEvents(id, {
      onEvent(event) {
        setEvents((current) => {
          if (current.some((item) => item.id === event.id)) {
            return current;
          }
          return [...current, event].sort(
            (left, right) => left.sequence - right.sequence,
          );
        });
      },
      onComplete() {
        void run.reload();
      },
    });
  }, [id, run.reload]);

  const deleteRun = async () => {
    if (
      !(await confirm(
        "Delete this run and its activity history? This cannot be undone.",
      ))
    ) {
      return;
    }
    setDeleting(true);
    try {
      await api.deleteRun(id);
      navigate("/inbox", { replace: true });
    } catch (error) {
      run.setError(error);
      setDeleting(false);
    }
  };

  const decideApprovals = async (approved: boolean) => {
    const required = new Set(run.value?.requiredApprovalIds ?? []);
    const approvals = run.value?.approvals.filter(({ id }) => required.has(id));
    if (!approvals?.length || deciding) return;
    setDeciding(true);
    run.setError(undefined);
    try {
      await api.decideRunApprovals(
        id,
        approvals.map((approval) => ({
          id: approval.id,
          approved:
            approval.status === "approved"
              ? true
              : approval.status === "denied"
                ? false
                : approved,
          ...(approval.reason
            ? { reason: approval.reason }
            : !approved
              ? { reason: "Denied by user" }
              : undefined),
        })),
      );
      await run.reload();
    } catch (error) {
      run.setError(error);
    } finally {
      setDeciding(false);
    }
  };

  const stopRun = async () => {
    if (stopping) return;
    setStopping(true);
    run.setError(undefined);
    try {
      await api.cancelRun(id);
      await run.reload();
    } catch (error) {
      run.setError(error);
    } finally {
      setStopping(false);
    }
  };

  const retryRun = async () => {
    if (!run.value || retrying) return;
    setRetrying(true);
    run.setError(undefined);
    try {
      const retried = await api.runTask(run.value.taskId);
      navigate(`/inbox/${retried.id}`);
    } catch (error) {
      run.setError(error);
      setRetrying(false);
    }
  };

  return (
    <Page>
      {confirmation}
      <BackLink to="/inbox">Inbox</BackLink>
      {run.loading ? <LoadingLine /> : null}
      {run.error ? <ErrorNotice error={run.error} retry={run.reload} /> : null}
      {run.value ? (
        <>
          <RunLetter
            deciding={deciding}
            deleting={deleting}
            events={events}
            onDecision={decideApprovals}
            onStop={() => void stopRun()}
            run={run.value}
            {...(run.value.status === "succeeded" ||
            run.value.status === "failed"
              ? { onDelete: () => void deleteRun() }
              : undefined)}
          />
          {run.value.canRetry ? (
            <div className="record-actions">
              <button
                className="quiet-button"
                disabled={retrying}
                onClick={() => void retryRun()}
                type="button"
              >
                {retrying ? "Starting…" : "Run again"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </Page>
  );
}

function RunLetter({
  run,
  events,
  deciding,
  deleting,
  onDecision,
  onStop,
  onDelete,
}: {
  readonly run: RunDetailDto;
  readonly events: readonly RunEventDto[];
  readonly deciding: boolean;
  readonly deleting?: boolean;
  readonly onDecision: (approved: boolean) => void | Promise<void>;
  readonly onStop?: () => void;
  readonly onDelete?: () => void;
}) {
  const active = run.status === "claimed" || run.status === "running";
  const summary = run.summary?.trim();
  const reportBody = run.result?.body.content ?? run.body;
  const realReport =
    reportBody && !isHeadingOnlyMarkdown(reportBody) ? reportBody : undefined;
  const body =
    realReport ??
    summary ??
    run.error ??
    (run.status === "waiting_for_approval"
      ? "This run is paused before a consequential connector call. Review the exact input above to continue."
      : active
        ? "The finished note will appear here when the agent is done."
        : "This run did not produce a note.");
  const modelLabel =
    run.modelProvider || run.modelId
      ? [run.modelProvider, run.modelId].filter(Boolean).join(" · ")
      : undefined;
  const copy = realReport ?? (!active && summary ? summary : undefined);

  return (
    <article className="letter">
      <div className="letter-date">{formatFullDate(run.scheduledTime)}</div>
      <h1 className="display-title">{run.taskName}</h1>
      <p className="letter-subtitle">
        <span>
          {run.executionLocation === "local"
            ? "Ran on this Mac"
            : "Ran while this Mac was away"}
        </span>
        <span className={`status ${runStatusClass(run.status)}`}>
          {humanStatus(run.status)}
        </span>
      </p>
      {summary &&
      !(reportBody && markdownSummaryDuplicatesBody(summary, reportBody)) ? (
        <div className="letter-summary">
          <RunMarkdown content={summary} />
        </div>
      ) : null}
      {run.status === "waiting_for_approval" ? (
        <RunApprovalPanel
          approvals={run.approvals.filter(({ id }) =>
            run.requiredApprovalIds.includes(id),
          )}
          deciding={deciding}
          onDecision={onDecision}
        />
      ) : null}
      {!active || realReport ? (
        <div className="letter-body">
          <ArtifactDocument
            artifacts={run.result?.artifacts ?? []}
            content={body}
          />
        </div>
      ) : null}
      <RunWork
        active={active}
        events={events}
        run={run}
        actions={
          <EndingActions
            copy={copy}
            deleteBusy={deleting}
            deleteLabel="Delete this run"
            {...(onDelete ? { onDelete } : undefined)}
          />
        }
        {...(modelLabel ? { model: modelLabel } : undefined)}
        {...(onStop && active ? { onStop } : undefined)}
      />
    </article>
  );
}

function RunApprovalPanel({
  approvals,
  deciding,
  onDecision,
}: {
  readonly approvals: readonly ToolApprovalDto[];
  readonly deciding: boolean;
  readonly onDecision: (approved: boolean) => void | Promise<void>;
}) {
  const required = approvals.filter(
    ({ status }) =>
      status === "pending" || status === "approved" || status === "denied",
  );
  const alreadyDecided = required.every(({ status }) => status !== "pending");

  return (
    <section className="chat-tool-approval run-tool-approval">
      <div className="section-label">Approval required</div>
      <strong>
        {required.length === 1
          ? "Review this exact connector call"
          : `Review ${required.length} exact connector calls`}
      </strong>
      <p>
        Springroll paused before making these changes. Credentials are injected
        by the host and are never part of these inputs.
      </p>
      {required.map((approval) => (
        <div className="run-approval-call" key={approval.id}>
          <span>
            {approval.toolName} · {approval.riskEffect}
          </span>
          <pre>{JSON.stringify(approval.input, null, 2)}</pre>
        </div>
      ))}
      <div className="chat-card-actions">
        <button
          className="button primary"
          disabled={deciding || required.length === 0}
          onClick={() => void onDecision(true)}
          type="button"
        >
          {deciding
            ? "Continuing…"
            : alreadyDecided
              ? "Continue run"
              : "Approve and run"}
        </button>
        {!alreadyDecided ? (
          <button
            className="quiet-button"
            disabled={deciding || required.length === 0}
            onClick={() => void onDecision(false)}
            type="button"
          >
            Deny
          </button>
        ) : null}
      </div>
    </section>
  );
}

function RunWork({
  events,
  run,
  active,
  model,
  onStop,
  actions,
}: {
  readonly events: readonly RunEventDto[];
  readonly run: RunDetailDto;
  readonly active: boolean;
  readonly model?: string;
  readonly onStop?: () => void;
  readonly actions?: ReactNode | undefined;
}) {
  const activity = runTurnActivity(events, active);
  const usage = runTurnUsage(run, events);
  return (
    <TurnWork
      activity={activity}
      live={active}
      label={runProgressLabel(events, activity)}
      {...(usage ? { usage } : undefined)}
      {...(model ? { model } : undefined)}
      {...(onStop ? { onStop } : undefined)}
      {...(run.startedAt ? { startedAt: run.startedAt } : undefined)}
      {...(actions ? { actions } : undefined)}
    />
  );
}

function TasksPage() {
  const tasks = useLoad(api.tasks);
  const navigate = useNavigate();
  const focusAskBar = useFocusAskBar();
  const [busyId, setBusyId] = useState<string>();
  const [menuTaskId, setMenuTaskId] = useState<string>();
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">(
    "all",
  );
  const [tagFilter, setTagFilter] = useState<string>();
  const [view, setView] = useState<"standard" | "tag">("standard");

  const tags = [
    ...new Set(tasks.value?.flatMap((task) => (task.tag ? [task.tag] : []))),
  ].sort();
  const filterOn =
    query.trim() !== "" || statusFilter !== "all" || tagFilter !== undefined;
  const search = query.trim().toLowerCase();
  const visibleTasks = tasks.value?.filter((task) => {
    if (statusFilter === "active" && !task.enabled) {
      return false;
    }
    if (statusFilter === "paused" && task.enabled) {
      return false;
    }
    if (tagFilter !== undefined && task.tag !== tagFilter) {
      return false;
    }
    return (
      search === "" ||
      task.name.toLowerCase().includes(search) ||
      task.prompt.toLowerCase().includes(search)
    );
  });

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setTagFilter(undefined);
  };

  const groups = new Map<string, TaskSummaryDto[]>();
  if (view === "tag") {
    for (const task of visibleTasks ?? []) {
      const label = task.tag ?? "untagged";
      groups.set(label, [...(groups.get(label) ?? []), task]);
    }
  }
  const tagGroups = [...groups.entries()].sort(([a], [b]) =>
    a === "untagged" ? 1 : b === "untagged" ? -1 : a.localeCompare(b),
  );

  const recipeCard = (task: TaskSummaryDto) => (
    <article
      className={`recipe-card ${task.enabled ? "" : "paused"}`}
      key={task.id}
      onClick={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("button, .popover-destination, .enable-backdrop")) {
          return;
        }
        navigate(`/recipes/${task.id}`);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          const target = event.target as HTMLElement | null;
          if (
            target?.closest("button, a, .popover-destination, .enable-backdrop")
          ) {
            return;
          }
          event.preventDefault();
          navigate(`/recipes/${task.id}`);
        }
      }}
    >
      <div className="recipe-card-top">
        <div className="recipe-card-title-group">
          <Link className="recipe-title" to={`/recipes/${task.id}`}>
            {task.name}
          </Link>
          <p className="recipe-prompt-snippet">{task.prompt}</p>
          {task.id === starterRecipeId && !task.enabled ? (
            <p className="recipe-prompt-snippet">
              {task.recentRunStatuses.includes("succeeded")
                ? "Like the result? Enable the schedule to receive this brief daily, or edit it to follow your interests."
                : "Try this example, or edit it to follow your interests. Set up your model and Web researcher in Settings, then choose Run now."}
            </p>
          ) : null}
        </div>
        {task.recentRunStatuses.length > 0 ? (
          <span
            className="run-trail"
            role="img"
            aria-label="Recent run outcomes"
          >
            {task.recentRunStatuses.map((status, index) => (
              <i
                className={trailDotClass(status)}
                // biome-ignore lint/suspicious/noArrayIndexKey: order-only list
                key={index}
              />
            ))}
          </span>
        ) : null}
      </div>

      <div className="recipe-schedule-row">
        <div className="recipe-schedule-timing">
          <ClockIcon size={13} />
          <span>{describeSchedule(task.schedule)}</span>
        </div>
        <span className="recipe-next-run">
          {task.enabled ? formatNextRun(task.nextRunAt) : "Paused"}
        </span>
      </div>

      <div className="recipe-card-meta-row">
        <div className="recipe-integrations-list">
          {task.connectionNames.map((name) => (
            <span className="pill-source" key={name}>
              {name}
            </span>
          ))}
          {recipeIsLocalOnly(task.availableIn) ? (
            <span className="pill-source">This Mac only</span>
          ) : null}
        </div>
        <div className="recipe-actions">
          {task.enabled ? (
            <button
              className="quiet-button secondary"
              disabled={busyId === task.id}
              onClick={() => toggleTask(task)}
              type="button"
            >
              Pause
            </button>
          ) : (
            <div className="popover-wrap">
              <button
                className={`quiet-button secondary ${
                  menuTaskId === task.id ? "active" : ""
                }`}
                disabled={busyId === task.id}
                onClick={() =>
                  setMenuTaskId(menuTaskId === task.id ? undefined : task.id)
                }
                type="button"
              >
                Enable ▾
              </button>
              {menuTaskId === task.id ? (
                <>
                  <button
                    aria-label="Close menu"
                    className="enable-backdrop"
                    onClick={() => setMenuTaskId(undefined)}
                    type="button"
                  />
                  <div
                    aria-label="Run location"
                    className="popover-destination"
                    role="dialog"
                  >
                    <div className="popover-dest-header">Run Location</div>
                    <div className="popover-dest-segmented">
                      <button
                        className="dest-seg-btn active"
                        onClick={() => {
                          setMenuTaskId(undefined);
                          void toggleTask(task);
                        }}
                        type="button"
                      >
                        💻 This Mac
                      </button>
                      <button
                        className="dest-seg-btn disabled"
                        disabled
                        title={recipeHostedBlockCopy(task.hostedBlockedBy)}
                        type="button"
                      >
                        ☁️ Cloud{" "}
                        {recipeIsLocalOnly(task.availableIn) ? null : (
                          <small className="soon-badge">soon</small>
                        )}
                      </button>
                    </div>
                    <p className="popover-dest-info">
                      {recipeIsLocalOnly(task.availableIn)
                        ? recipeHostedBlockCopy(task.hostedBlockedBy)
                        : "Runs locally on schedule whenever this Mac is awake."}
                    </p>
                  </div>
                </>
              ) : null}
            </div>
          )}
          <button
            className="quiet-button"
            disabled={busyId === task.id}
            onClick={() => runNow(task)}
            title="Run recipe now"
            type="button"
          >
            <PlayIcon size={12} />
            Run now
          </button>
        </div>
      </div>
    </article>
  );

  const toggleTask = async (task: TaskSummaryDto) => {
    setBusyId(task.id);
    try {
      await api.updateTask(task.id, { enabled: !task.enabled });
      await tasks.reload();
    } finally {
      setBusyId(undefined);
    }
  };

  const runNow = async (task: TaskSummaryDto) => {
    setBusyId(task.id);
    try {
      const run = await api.runTask(task.id);
      navigate(`/inbox/${run.id}`);
    } catch (error) {
      tasks.setError(error);
      setBusyId(undefined);
    }
  };

  return (
    <Page>
      <PageHeading
        title="Recipes."
        action={
          <div className="heading-actions">
            <Link className="button" to="/recipes/new">
              <PlusIcon />
              Add recipe
            </Link>
            <FilterControl
              label="Filter recipes"
              on={filterOn}
              open={filterOpen}
              setOpen={setFilterOpen}
            >
              <input
                aria-label="Search recipes"
                className="filter-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search recipes"
                type="search"
                value={query}
              />
              <div className="filter-section-label">Status</div>
              <div className="filter-chips">
                {(["all", "active", "paused"] as const).map((status) => (
                  <button
                    className={`filter-chip ${
                      statusFilter === status ? "on" : ""
                    }`}
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    type="button"
                  >
                    {status === "all"
                      ? "All"
                      : status === "active"
                        ? "Active"
                        : "Paused"}
                  </button>
                ))}
              </div>
              <div className="filter-section-label">Tags</div>
              {tags.length > 0 ? (
                <div className="filter-chips">
                  {tags.map((tag) => (
                    <button
                      className={`filter-chip ${tagFilter === tag ? "on" : ""}`}
                      key={tag}
                      onClick={() =>
                        setTagFilter(tagFilter === tag ? undefined : tag)
                      }
                      type="button"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="filter-empty-note">
                  No tags yet — set one on a recipe page.
                </p>
              )}
              <div className="filter-section-label">View</div>
              <div className="filter-chips">
                {(["standard", "tag"] as const).map((option) => (
                  <button
                    className={`filter-chip ${view === option ? "on" : ""}`}
                    key={option}
                    onClick={() => setView(option)}
                    type="button"
                  >
                    {option === "standard" ? "Standard" : "Tag"}
                  </button>
                ))}
                <button className="filter-chip disabled" disabled type="button">
                  Calendar<i className="soon-chip">soon</i>
                </button>
              </div>
              {filterOn ? (
                <button
                  className="text-action filter-clear"
                  onClick={clearFilters}
                  type="button"
                >
                  Clear filters
                </button>
              ) : null}
            </FilterControl>
          </div>
        }
      />
      {tasks.loading ? <LoadingLine /> : null}
      {tasks.error ? (
        <ErrorNotice error={tasks.error} retry={tasks.reload} />
      ) : null}
      {!tasks.loading && tasks.value?.length === 0 ? (
        <EmptyState
          title="Nothing scheduled"
          body="Describe one useful thing and Springroll will turn it into a recipe."
          action={
            <button
              className="text-action"
              onClick={() => focusAskBar()}
              type="button"
            >
              Describe a recipe
            </button>
          }
        />
      ) : null}
      {filterOn && visibleTasks?.length === 0 && tasks.value?.length ? (
        <EmptyState
          title="No matches"
          body="No recipes match the current filters."
          action={
            <button
              className="text-action"
              onClick={clearFilters}
              type="button"
            >
              Clear filters
            </button>
          }
        />
      ) : null}
      {view === "tag" ? (
        <div className="recipe-groups">
          {tagGroups.map(([label, group]) => (
            <section className="recipe-group" key={label}>
              <div className="day-heading">{label}</div>
              <div className="recipe-grid">{group.map(recipeCard)}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className="recipe-grid">{visibleTasks?.map(recipeCard)}</div>
      )}
    </Page>
  );
}

function TaskDetailPage() {
  const { confirm, confirmation } = useConfirmationDialog();
  const { id = "" } = useParams();
  const task = useLoad(useCallback(() => api.task(id), [id]));
  const execution = useLoad(useCallback(() => api.taskExecution(id), [id]));
  const recipeKnowledge = useLoad(
    useCallback(() => api.taskRecipeKnowledge(id), [id]),
  );
  const models = useLoad(api.models);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [toolRepair, setToolRepair] =
    useState<TaskToolRepairProposalOutcomeDto>();
  const [toolRepairError, setToolRepairError] = useState<unknown>();
  const [toolRepairLoading, setToolRepairLoading] = useState(false);
  useAskBarChip("task", task.value?.name);

  useEffect(() => {
    if (!taskToolRepairRequired(execution.error)) {
      setToolRepair(undefined);
      setToolRepairError(undefined);
      setToolRepairLoading(false);
      return;
    }
    let cancelled = false;
    setToolRepairLoading(true);
    setToolRepairError(undefined);
    void api
      .taskToolRepair(id)
      .then((outcome) => {
        if (!cancelled) setToolRepair(outcome);
      })
      .catch((error) => {
        if (!cancelled) setToolRepairError(error);
      })
      .finally(() => {
        if (!cancelled) setToolRepairLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [execution.error, id]);

  const update = async (input: Parameters<typeof api.updateTask>[1]) => {
    setBusy(true);
    try {
      await api.updateTask(id, input);
      await Promise.all([task.reload(), execution.reload()]);
    } catch (error) {
      task.setError(error);
    } finally {
      setBusy(false);
    }
  };

  const runNow = async () => {
    setBusy(true);
    try {
      const run = await api.runTask(id);
      navigate(`/inbox/${run.id}`);
    } catch (error) {
      if (taskToolRepairRequired(error)) {
        execution.setError(error);
      } else {
        task.setError(error);
      }
      setBusy(false);
    }
  };

  const repairAndRun = async () => {
    if (toolRepair?.status !== "ready") return;
    setBusy(true);
    setToolRepairError(undefined);
    try {
      await api.repairTaskTools(id, toolRepair.proposal);
      execution.setError(undefined);
      setToolRepair(undefined);
      const run = await api.runTask(id);
      navigate(`/inbox/${run.id}`);
    } catch (error) {
      setToolRepairError(error);
      setBusy(false);
    }
  };

  const deleteTask = async () => {
    if (
      !(await confirm(
        `Delete “${task.value?.name ?? "this task"}” and all of its run history? This cannot be undone.`,
      ))
    ) {
      return;
    }
    setBusy(true);
    try {
      await api.deleteTask(id);
      navigate("/recipes", { replace: true });
    } catch (error) {
      task.setError(error);
      setBusy(false);
    }
  };

  return (
    <Page>
      {confirmation}
      <div className="task-detail-nav">
        <BackLink to="/recipes">Recipes</BackLink>
        {task.value ? (
          <button
            className="button"
            disabled={busy || execution.loading || Boolean(execution.error)}
            onClick={runNow}
            type="button"
          >
            <PlayIcon size={14} />
            {busy ? "Running…" : "Run now"}
          </button>
        ) : null}
      </div>
      {task.loading ? <LoadingLine /> : null}
      {task.error ? (
        <ErrorNotice error={task.error} retry={task.reload} />
      ) : null}
      {task.value ? (
        <article className="task-detail">
          <div className="task-detail-heading">
            <div
              className={`status ${
                task.value.enabled ? "status-good" : "status-quiet"
              }`}
            >
              {task.value.enabled ? "Scheduled" : "Paused"}
            </div>
            <h1 className="display-title">{task.value.name}</h1>
          </div>
          <div className="letter-body recipe-prompt">
            <RollmarkDocument content={task.value.prompt} />
          </div>
          <dl className="detail-grid">
            <div>
              <dt>Schedule</dt>
              <dd>
                {describeSchedule(task.value.schedule)}
                <small>{task.value.timezone}</small>
              </dd>
            </div>
            <div>
              <dt>Next run</dt>
              <dd>
                {task.value.enabled
                  ? formatFullDate(task.value.nextRunAt)
                  : "Paused"}
              </dd>
            </div>
            <div>
              <dt>Integrations</dt>
              <dd>{task.value.connectionNames.join(", ") || "None"}</dd>
            </div>
            <div>
              <dt>Runs</dt>
              <dd>
                {recipeIsLocalOnly(task.value.availableIn)
                  ? "This Mac only"
                  : "This Mac"}
                <small>
                  {recipeIsLocalOnly(task.value.availableIn)
                    ? recipeHostedBlockCopy(task.value.hostedBlockedBy)
                    : "Cloud runs are not available yet."}
                </small>
              </dd>
            </div>
            <div>
              <dt>Tag</dt>
              <dd>
                <input
                  aria-label="Recipe tag"
                  className="tag-input"
                  defaultValue={task.value.tag ?? ""}
                  disabled={busy}
                  key={task.value.tag ?? ""}
                  onBlur={(event) => {
                    const next = event.target.value.trim();
                    if (next !== (task.value?.tag ?? "")) {
                      void update({ tag: next || null });
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                  placeholder="e.g. news"
                />
                <small>One tag, used to filter the Recipes page.</small>
              </dd>
            </div>
            <div className="detail-wide">
              <dt>Agent model</dt>
              <dd>
                <ModelPicker
                  disabled={busy || models.loading}
                  inheritLabel={defaultRecipeModelLabel(models.value)}
                  models={models.value?.recipeModels ?? []}
                  onChange={(selection) =>
                    update({ modelSelection: selection })
                  }
                  value={task.value.modelOverride}
                  googleDataProtected={task.value.googleDataProtected}
                  inheritedValue={
                    execution.value ?? models.value?.defaultSelection
                  }
                />
                {execution.loading ? <LoadingLine /> : null}
                {execution.error ? (
                  taskToolRepairRequired(execution.error) ? (
                    <TaskToolRepairNotice
                      busy={busy}
                      error={toolRepairError}
                      loading={toolRepairLoading}
                      onRepairAndRun={repairAndRun}
                      outcome={toolRepair}
                    />
                  ) : (
                    <small className="execution-error">
                      {errorMessage(execution.error)}
                    </small>
                  )
                ) : null}
                {execution.value && !execution.error ? (
                  <ModelExecutionLine
                    configuration={models.value}
                    execution={execution.value}
                  />
                ) : null}
              </dd>
            </div>
            {task.value.capabilities.some(
              (capability) => capability.toolName === "generate_image",
            ) ? (
              <div className="detail-wide">
                <dt>Default image model</dt>
                <dd>
                  <ModelPicker
                    disabled={busy || models.loading}
                    inheritLabel={defaultImageModelLabel(models.value)}
                    models={models.value?.imageModels ?? []}
                    onChange={(selection) =>
                      update({ imageModelSelection: selection })
                    }
                    value={task.value.imageModelOverride}
                  />
                  <small>
                    The agent can choose any connected image model per tool
                    call. This is the fallback when it does not choose one.
                  </small>
                </dd>
              </div>
            ) : null}
            <div>
              <dt>When a scheduled run is missed</dt>
              <dd>
                <select
                  aria-label="Catch-up policy"
                  disabled={busy}
                  onChange={(event) =>
                    update({
                      catchUpPolicy: event.target.value as
                        | "catch_up"
                        | "skip_to_next",
                    })
                  }
                  value={task.value.catchUpPolicy}
                >
                  <option value="skip_to_next">Skip to the next time</option>
                  <option value="catch_up">Run once when available</option>
                </select>
                <small>
                  Applies after sleep or app downtime. Delays up to one minute
                  run normally. Catch-up runs once, not once per missed time;
                  another active run prevents overlap.
                </small>
                {task.value.lastScheduleRecovery ? (
                  <small>
                    Last schedule recovery (
                    {formatFullDate(
                      task.value.lastScheduleRecovery.recoveredAt,
                    )}
                    ):{" "}
                    {task.value.lastScheduleRecovery.outcome === "caught_up"
                      ? "Queued one catch-up run; additional missed times were not replayed."
                      : task.value.lastScheduleRecovery.outcome ===
                          "skipped_active"
                        ? "Skipped scheduled work because another run was still active."
                        : "Skipped missed work and advanced to the next scheduled time."}
                  </small>
                ) : null}
              </dd>
            </div>
          </dl>
          <section
            className="recipe-capabilities"
            aria-labelledby="recipe-capabilities-heading"
          >
            <div className="section-label" id="recipe-capabilities-heading">
              Capabilities
            </div>
            <dl className="detail-grid">
              {task.value.capabilities.length ? (
                task.value.capabilities.map((capability) => (
                  <div
                    key={`${capability.connectionId}:${capability.toolName}`}
                  >
                    <dt>{capability.toolName.replaceAll("_", " ")}</dt>
                    <dd>
                      {capabilityModeLabel(capability.mode)}
                      <small>
                        <Link to={`/integrations/${capability.connectionId}`}>
                          {capability.connectionName}
                        </Link>
                        {" · "}
                        {capability.effect}
                      </small>
                    </dd>
                  </div>
                ))
              ) : (
                <div>
                  <dt>Tools</dt>
                  <dd>
                    None
                    <small>This recipe has no pinned tools.</small>
                  </dd>
                </div>
              )}
            </dl>
          </section>
          <RecipeKnowledge
            error={recipeKnowledge.error}
            loading={recipeKnowledge.loading}
            value={recipeKnowledge.value}
          />
          <section className="where-runs" aria-labelledby="where-heading">
            <div className="section-label" id="where-heading">
              Where it runs
            </div>
            <div role="radiogroup" aria-label="Where this recipe runs">
              <label className="where-option">
                <input
                  checked={!task.value.enabled}
                  disabled={busy}
                  name="where-it-runs"
                  onChange={() => update({ enabled: false })}
                  type="radio"
                />
                <span>
                  <b>Paused</b>
                  <p>Keeps the recipe and its history; nothing runs.</p>
                </span>
              </label>
              <label className="where-option">
                <input
                  checked={task.value.enabled}
                  disabled={busy}
                  name="where-it-runs"
                  onChange={() => update({ enabled: true })}
                  type="radio"
                />
                <span>
                  <b>On this Mac</b>
                  <p>
                    Runs on schedule while this Mac is awake. Skipped runs
                    follow your catch-up policy.
                  </p>
                </span>
              </label>
              <label className="where-option disabled">
                <input disabled name="where-it-runs" type="radio" />
                <span>
                  <b>Anywhere</b>
                  <p>
                    Your Mac runs it first; Springroll Cloud covers when it is
                    asleep. Requires sharing this recipe's connections and model
                    key with your cloud space.
                  </p>
                </span>
                <i className="soon-chip">Requires Cloud · soon</i>
              </label>
            </div>
          </section>
          <div className="record-actions">
            <DeleteButton
              label="Delete this recipe"
              disabled={busy}
              onClick={() => void deleteTask()}
            />
          </div>
        </article>
      ) : null}
    </Page>
  );
}

function RecipeKnowledge({
  error,
  loading,
  value,
}: {
  readonly error?: unknown;
  readonly loading: boolean;
  readonly value: TaskRecipeKnowledgeDto | null | undefined;
}) {
  return (
    <section className="learned-setup" aria-labelledby="learned-setup-heading">
      <div className="learned-setup-head">
        <div>
          <div className="section-label" id="learned-setup-heading">
            Recipe knowledge
          </div>
          <p>
            A living notes document this recipe&apos;s runs maintain as they
            learn. It guides future runs but never grants permission to use a
            tool.
          </p>
        </div>
        {value ? (
          <span className={`learned-setup-status status-${value.status}`}>
            {recipeKnowledgeStatus(value.status)}
          </span>
        ) : null}
      </div>
      {loading ? <LoadingLine /> : null}
      {error ? <ErrorNotice error={error} /> : null}
      {!loading && !error && !value ? (
        <div className="learned-setup-empty">
          No recipe notes have been saved yet. When useful, you can keep concise
          sources, definitions, and caveats here for future runs.
        </div>
      ) : null}
      {value ? (
        <div className="learned-setup-body">
          <div className="learned-setup-provenance">
            Revision {value.revision}
            {value.sourceRunId ? (
              <>
                {" · learned from "}
                <Link to={`/inbox/${value.sourceRunId}`}>this run</Link>
              </>
            ) : null}
          </div>
          <div className="learned-setup-document letter-body">
            <RollmarkDocument content={value.knowledge.markdown} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function recipeKnowledgeStatus(
  status: TaskRecipeKnowledgeDto["status"],
): string {
  switch (status) {
    case "ready":
      return "Active";
    case "superseded":
      return "Superseded";
  }
}

function NewRecipeConversationEntryPage() {
  return (
    <ConversationEntryPage
      backTo="/recipes"
      entry={{
        mode: "new",
        context: {
          version: 1,
          intent: "task.create",
          origin: "recipes",
          subjects: [],
        },
      }}
    />
  );
}

export function ModelSettingsSection({
  configuration,
  view = "all",
}: {
  readonly configuration: ReturnType<typeof useLoad<ModelSettingsDto>>;
  readonly view?: "all" | "models" | "providers";
}) {
  useEffect(() => {
    if (configuration.value)
      window.dispatchEvent(new Event("springroll-models-changed"));
  }, [configuration.value]);
  const [keys, setKeys] = useState<Partial<Record<ModelProviderId, string>>>(
    {},
  );
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<unknown>();
  const [providerError, setProviderError] = useState<{
    id: string;
    message: string;
  }>();

  const perform = async (name: string, action: () => Promise<unknown>) => {
    setBusy(name);
    setError(undefined);
    setProviderError(undefined);
    try {
      await action();
      setKeys((current) => ({
        ...current,
        [name as ModelProviderId]: "",
      }));
      await configuration.reload();
    } catch (caught) {
      setProviderError({ id: name, message: errorMessage(caught) });
    } finally {
      setBusy(undefined);
    }
  };

  const updateSelection = async (
    name: string,
    update: (selection: ModelSelectionDto | null) => Promise<unknown>,
    selection: ModelSelectionDto | null,
  ) => {
    setBusy(name);
    setError(undefined);
    try {
      await update(selection);
      await configuration.reload();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(undefined);
    }
  };

  const updateDefault = (selection: ModelSelectionDto | null) =>
    updateSelection("default", api.updateDefaultModel, selection);

  const updateResearchDistiller = (selection: ModelSelectionDto | null) =>
    updateSelection(
      "research-distiller",
      api.updateResearchDistillerModel,
      selection,
    );

  const updateExecution = async (settings: ExecutionSettingsDto) => {
    setBusy("execution");
    setError(undefined);
    try {
      await api.updateExecutionSettings(settings);
      await configuration.reload();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(undefined);
    }
  };

  const refreshCatalog = () =>
    updateSelection("catalog", async () => api.refreshModels(), null);

  const connectProvider = (
    provider: ModelProviderDto,
    workspaceId?: string,
  ) => {
    if (provider.kind !== "subscription") {
      void perform(provider.id, () =>
        api.connectModelProvider(
          provider.id,
          keys[provider.id] ?? "",
          workspaceId,
        ),
      );
      return;
    }
    if (provider.id === "claude") {
      void perform(provider.id, () => api.startClaudeLogin());
      return;
    }
    const authWindow = window.open("about:blank", "_blank");
    void perform(provider.id, async () => {
      const login = await api.startCodexLogin();
      if (authWindow) {
        authWindow.opener = null;
        authWindow.location.href = login.authUrl;
      } else {
        window.open(login.authUrl, "_blank", "noopener,noreferrer");
      }
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const state = await api.models();
        if (
          state.providers.some(
            (candidate) =>
              candidate.id === "codex" && candidate.status === "connected",
          )
        ) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      throw new Error("ChatGPT sign-in was not completed");
    });
  };

  const renderProviderCard = (provider: ModelProviderDto) => (
    <ModelProviderCard
      busy={busy}
      error={
        providerError?.id === provider.id ? providerError.message : undefined
      }
      key={provider.id}
      onConnect={(workspaceId) => connectProvider(provider, workspaceId)}
      onDisconnect={() =>
        perform(provider.id, () => api.disconnectModelProvider(provider.id))
      }
      onKeyChange={(value) =>
        setKeys((current) => ({
          ...current,
          [provider.id]: value,
        }))
      }
      provider={provider}
      value={keys[provider.id] ?? ""}
    />
  );

  return (
    <section
      className="model-settings-section"
      aria-labelledby="models-heading"
    >
      <div className="section-heading">
        <div className="section-label" id="models-heading">
          {view === "models"
            ? "Models & limits"
            : view === "providers"
              ? "AI providers"
              : "AI models & providers"}
        </div>
      </div>
      {configuration.loading ? <LoadingLine /> : null}
      {configuration.error ? (
        <ErrorNotice error={configuration.error} retry={configuration.reload} />
      ) : null}
      {error ? <ErrorNotice error={error} /> : null}
      {configuration.value ? (
        <>
          <section
            className="model-default-card models-limits-card settings-defaults-grid"
            hidden={view === "providers"}
          >
            <fieldset
              className="settings-control-column"
              aria-label="Model defaults"
            >
              <div className="model-role-row">
                <div className="model-role-info">
                  <h2>Default model</h2>
                </div>
                <ModelPicker
                  align="end"
                  disabled={busy !== undefined}
                  inheritLabel="Automatic"
                  models={configuration.value.recipeModels}
                  onChange={updateDefault}
                  value={configuration.value.defaultSelection}
                />
              </div>
              <div className="model-role-row">
                <div className="model-role-info">
                  <h2>Research distiller</h2>
                </div>
                <ModelPicker
                  align="end"
                  disabled={busy !== undefined}
                  inheritLabel="Off"
                  models={configuration.value.models}
                  onChange={updateResearchDistiller}
                  value={configuration.value.researchDistillerSelection}
                />
              </div>
            </fieldset>
            <fieldset
              className="settings-control-column"
              aria-label="Recipe limits"
            >
              <div className="model-role-row">
                <div className="model-role-info">
                  <h2>Recipe run turn limit</h2>
                </div>
                <ExecutionLimitPicker
                  label="Recipe run turn limit"
                  value={configuration.value.execution?.maxSteps ?? 0}
                  presets={[10, 20, 50, 100]}
                  defaultValue={20}
                  min={2}
                  max={100}
                  unit="turns"
                  disabled={busy !== undefined}
                  onChange={(maxSteps) =>
                    updateExecution({
                      ...configuration.value?.execution,
                      maxSteps,
                    })
                  }
                />
              </div>
              <div className="model-role-row">
                <div className="model-role-info">
                  <h2>Recipe run cost budget</h2>
                </div>
                <ExecutionLimitPicker
                  label="Recipe run cost budget"
                  value={
                    (configuration.value.execution?.maxCostUsdMicros ?? 0) /
                    1_000_000
                  }
                  presets={[0.1, 0.5, 1, 5]}
                  defaultValue={1}
                  min={0.01}
                  step={0.01}
                  unit="USD"
                  disabled={busy !== undefined}
                  onChange={(dollars) =>
                    updateExecution({
                      maxSteps: configuration.value?.execution?.maxSteps ?? 0,
                      ...(dollars > 0
                        ? { maxCostUsdMicros: Math.round(dollars * 1_000_000) }
                        : {}),
                    })
                  }
                />
              </div>
            </fieldset>
            <details className="settings-about">
              <summary>About these settings</summary>
              <dl>
                <dt>Default model</dt>
                <dd>Used for chats and recipes unless you choose another.</dd>
                <dt>Research distiller</dt>
                <dd>
                  Summarizes large web results before they reach the main model.
                  Choose Off to skip this step.
                </dd>
                <dt>Recipe run turn limit</dt>
                <dd>Maximum model turns. Off removes the cap.</dd>
                <dt>Recipe run cost budget</dt>
                <dd>
                  A USD target per recipe run. A model call may exceed it. Off
                  removes the target.
                </dd>
              </dl>
              <p>
                Applies to each recipe run, not chat. Time and context
                safeguards still apply when limits are off.
              </p>
              <CatalogStatus
                configuration={configuration.value}
                onRefresh={refreshCatalog}
                refreshing={busy === "catalog"}
              />
            </details>
          </section>

          <div hidden={view === "models"}>
            <div className="section-heading" hidden={view === "providers"}>
              <div className="section-label">AI providers</div>
            </div>
            <div className="provider-groups">
              <section
                aria-labelledby="subscription-providers-heading"
                className="provider-group"
              >
                <div className="provider-group-heading">
                  <h2 id="subscription-providers-heading">
                    Coding subscriptions
                  </h2>
                  <p>
                    Sign in with an existing Claude or ChatGPT plan. No API key
                    required.
                  </p>
                </div>
                <div className="provider-grid">
                  {configuration.value.providers
                    .filter((provider) => provider.kind === "subscription")
                    .map(renderProviderCard)}
                </div>
              </section>
              <section
                aria-labelledby="api-providers-heading"
                className="provider-group"
              >
                <div className="provider-group-heading">
                  <h2 id="api-providers-heading">API keys</h2>
                  <p>Connect provider keys for metered model usage.</p>
                </div>
                <div className="provider-grid">
                  {configuration.value.providers
                    .filter((provider) => provider.kind !== "subscription")
                    .map(renderProviderCard)}
                </div>
              </section>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

const providerBlurbs: Record<ModelProviderId, string> = {
  openrouter: "one key routes to models from many labs.",
  openai: "GPT models with metered OpenAI API billing.",
  xai: "Grok models, straight from the source.",
  anthropic: "Claude models with metered Anthropic API billing.",
  google: "Gemini and Gemma models through Google AI Studio.",
  groq: "Fast hosted open-model inference through Groq.",
  claude:
    "Use Sonnet, Opus, or Haiku for chats and recipes through your Claude plan.",
  codex: "Use Codex models for chats and recipes through your ChatGPT plan.",
};

function ModelProviderCard({
  provider,
  error,
  value,
  busy,
  onKeyChange,
  onConnect,
  onDisconnect,
}: {
  readonly provider: ModelProviderDto;
  readonly error: string | undefined;
  readonly value: string;
  readonly busy: string | undefined;
  readonly onKeyChange: (value: string) => void;
  readonly onConnect: (workspaceId?: string) => void;
  readonly onDisconnect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [workspaceId, setWorkspaceId] = useState("");

  useEffect(() => {
    if (provider.status === "connected") {
      setOpen(false);
      setWorkspaceId("");
    }
  }, [provider.status]);

  const footer =
    provider.status === "connected" ? (
      <ConnectedRow
        detail={
          provider.kind === "subscription"
            ? [provider.accountLabel, provider.planLabel]
                .filter(Boolean)
                .join(" · ") || `${provider.name} · this Mac`
            : "Keychain · this Mac"
        }
        disabled={busy !== undefined}
        onDisconnect={onDisconnect}
      />
    ) : provider.kind === "subscription" &&
      (provider.id === "codex" || provider.id === "claude") ? (
      <SubscriptionConnect
        id={provider.id}
        busy={busy}
        onConnect={() => onConnect()}
      />
    ) : (
      <div className="provider-foot">
        <a
          className="provider-get-key"
          href={provider.keyCreationUrl}
          rel="noreferrer"
          target="_blank"
        >
          Get a key ↗
        </a>
        <span className="connect-wrap">
          <button
            aria-expanded={open}
            className="quiet-button"
            disabled={busy !== undefined}
            onClick={() => setOpen((wasOpen) => !wasOpen)}
            type="button"
          >
            Connect
          </button>
          <ConnectKeyPopover
            busy={busy === provider.id}
            error={error}
            label={`${provider.name} API key`}
            onClose={() => setOpen(false)}
            onKeyChange={onKeyChange}
            onSubmit={() =>
              onConnect(
                provider.id === "anthropic"
                  ? workspaceId.trim() || undefined
                  : undefined,
              )
            }
            open={open}
            placeholder={provider.keyPlaceholder}
            submitDisabled={!value.trim() || busy !== undefined}
            submitLabel="Save key"
            value={value}
            workspaceId={workspaceId}
            onWorkspaceChange={
              provider.id === "anthropic" ? setWorkspaceId : undefined
            }
          />
        </span>
      </div>
    );

  return (
    <SettingsProviderCard
      description={providerBlurbs[provider.id]}
      footer={
        <>
          {footer}
          {provider.kind === "direct_api" && provider.status === "connected" ? (
            <p className="provider-google-data">
              {provider.id === "google"
                ? "For Gmail, Calendar and Drive, use a billing-enabled API project with training/data sharing disabled."
                : "For Google data, use API terms that exclude model training and keep training/data-sharing opt-ins disabled."}
            </p>
          ) : null}
          {error && (!open || provider.kind === "subscription") ? (
            <p className="connect-panel-error" role="alert">
              {error}
            </p>
          ) : null}
        </>
      }
      label={
        provider.kind === "aggregator"
          ? "Aggregator"
          : provider.kind === "subscription"
            ? "Subscription"
            : "Direct API"
      }
      logoSvg={provider.logoSvg}
      name={provider.name}
    />
  );
}

function SettingsProviderCard({
  name,
  logoSvg,
  logoName,
  label,
  description,
  footer,
}: {
  readonly name: string;
  readonly logoSvg?: string | undefined;
  readonly logoName?: string | undefined;
  readonly label: string;
  readonly description: ReactNode;
  readonly footer: ReactNode;
}) {
  return (
    <section className="provider-card">
      <div className="provider-title">
        <ProviderMark name={logoName} svg={logoSvg} />
        <h2>{name}</h2>
      </div>
      <p className="provider-blurb">
        <b>{label}</b>
        {" — "}
        {description}
      </p>
      {footer}
    </section>
  );
}

function ProviderMark({
  svg,
  url,
  name,
}: {
  readonly svg: string | undefined;
  readonly url?: string | undefined;
  readonly name?: string | undefined;
}) {
  const imageUrl = safeConnectorImageUrl(url);
  if (!svg) {
    return imageUrl ? (
      <span aria-hidden="true" className="provider-logo provider-image">
        <img alt="" referrerPolicy="no-referrer" src={imageUrl} />
      </span>
    ) : name ? (
      <span aria-hidden="true" className="provider-logo provider-initial">
        {name.slice(0, 1).toUpperCase()}
      </span>
    ) : null;
  }
  return (
    <span aria-hidden="true" className="provider-logo">
      <ProviderSvg svg={svg} />
    </span>
  );
}

function safeConnectorImageUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function ConnectKeyPopover({
  open,
  label,
  placeholder,
  value,
  busy,
  error,
  submitDisabled,
  submitLabel = "Connect",
  keyCreationUrl,
  credentialFields,
  fieldValues = {},
  onClose,
  onFieldChange,
  onKeyChange,
  onSubmit,
  workspaceId = "",
  onWorkspaceChange,
}: {
  readonly open: boolean;
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly busy: boolean;
  readonly error?: string | undefined;
  readonly submitDisabled: boolean;
  readonly submitLabel?: string;
  readonly keyCreationUrl?: string | undefined;
  readonly credentialFields?: ConnectionCardDto["credentialFields"];
  readonly fieldValues?: Readonly<Record<string, string>>;
  readonly onClose: () => void;
  readonly onFieldChange?: (name: string, value: string) => void;
  readonly onKeyChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly workspaceId?: string;
  readonly onWorkspaceChange?: ((value: string) => void) | undefined;
}) {
  const keyRef = useRef<HTMLInputElement>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (open) {
      setShowKey(false);
      keyRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <>
      <button
        aria-label="Close connect panel"
        className="enable-backdrop"
        disabled={busy}
        onClick={onClose}
        type="button"
      />
      <form
        aria-label={label}
        aria-busy={busy}
        className="connect-panel"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) {
            event.preventDefault();
            onClose();
          }
        }}
        onSubmit={(event) => {
          event.preventDefault();
          if (!submitDisabled && !busy) onSubmit();
        }}
      >
        {credentialFields?.length ? (
          credentialFields.map((field, index) => (
            <label key={field.name}>
              {field.label}
              <input
                autoComplete={field.autoComplete}
                disabled={busy}
                onChange={(event) =>
                  onFieldChange?.(field.name, event.target.value)
                }
                ref={index === 0 ? keyRef : undefined}
                type={field.secret ? "password" : "text"}
                value={fieldValues[field.name] ?? ""}
              />
            </label>
          ))
        ) : (
          <div className="connect-key-field">
            <label>
              {label}
              <input
                autoComplete="off"
                autoCapitalize="none"
                disabled={busy}
                spellCheck={false}
                onChange={(event) => onKeyChange(event.target.value)}
                placeholder={placeholder}
                ref={keyRef}
                type={showKey ? "text" : "password"}
                value={value}
              />
            </label>
            <button
              aria-label={showKey ? "Hide API key" : "Show API key"}
              aria-pressed={showKey}
              className="connect-key-visibility"
              disabled={busy}
              onClick={() => setShowKey((visible) => !visible)}
              type="button"
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
        )}
        {onWorkspaceChange ? (
          <div>
            <label>
              Workspace ID (if your key works across workspaces)
              <input
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                disabled={busy}
                placeholder="wrkspc_…"
                value={workspaceId}
                onChange={(event) => onWorkspaceChange(event.target.value)}
              />
            </label>
            <small className="connect-panel-note">
              Leave blank for a workspace-scoped key. Find the ID in{" "}
              <a
                href="https://platform.claude.com/settings/workspaces"
                target="_blank"
                rel="noreferrer"
              >
                Claude Console → Settings → Workspaces ↗
              </a>
              .
            </small>
          </div>
        ) : null}
        {error ? (
          <p className="connect-panel-error" role="alert">
            {error}
          </p>
        ) : null}
        <small className="connect-panel-note">
          Saved securely in macOS Keychain after setup.
        </small>
        <div className="connect-panel-actions">
          {keyCreationUrl ? (
            <a
              className="provider-get-key"
              href={keyCreationUrl}
              rel="noreferrer"
              target="_blank"
            >
              Credential setup ↗
            </a>
          ) : null}
          <button
            className="quiet-button"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="button primary"
            disabled={submitDisabled || busy}
            type="submit"
          >
            {busy ? "Verifying…" : submitLabel}
          </button>
        </div>
      </form>
    </>
  );
}

function ModelExecutionLine({
  execution,
  configuration,
}: {
  readonly execution: ModelExecutionDto;
  readonly configuration: ModelSettingsDto | undefined;
}) {
  const model = configuration?.models.find(
    (option) =>
      option.providerId === execution.providerId &&
      option.modelId === execution.modelId,
  );
  const routes = execution.toolRoutes.filter(
    (route, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.profile === route.profile &&
          candidate.service === route.service,
      ) === index,
  );
  const selectionLabel = {
    automatic: "automatic choice",
    default: "app default",
    task: "chosen for this recipe",
  }[execution.selectedBy];
  const parts = [
    `Runs with ${model?.name ?? execution.modelId}`,
    providerName(execution.providerId),
    selectionLabel,
    ...routes.map((route) =>
      route.profile === "portable"
        ? `web via ${({ exa: "Exa", parallel: "Parallel", firecrawl: "Firecrawl", direct: "direct page reading" } as Record<string, string>)[route.service] ?? route.service}`
        : route.profile === "managed-auto"
          ? "web via OpenRouter"
          : `web via ${providerName(
              route.service === "exa" ||
                route.service === "parallel" ||
                route.service === "firecrawl" ||
                route.service === "direct"
                ? execution.providerId
                : route.service,
            )}`,
    ),
  ];

  return <small className="execution-line">{parts.join(" · ")}</small>;
}

function CatalogStatus({
  configuration,
  onRefresh,
  refreshing,
}: {
  readonly configuration: ModelSettingsDto;
  readonly onRefresh: () => void;
  readonly refreshing: boolean;
}) {
  return (
    <div className="catalog-status">
      <small>
        {configuration.catalogUpdatedAt
          ? `Provider catalogs · updated ${new Intl.DateTimeFormat(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(configuration.catalogUpdatedAt))}${
              configuration.catalogStale ? " · offline copy" : ""
            }`
          : "Provider catalogs"}
      </small>
      <button
        className="quiet-button"
        disabled={refreshing}
        onClick={onRefresh}
        type="button"
      >
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}

function ConnectionsIntegrationsPage() {
  const connections = useLoad(api.connections);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [busy, setBusy] = useState<string>();
  const [keyPanel, setKeyPanel] = useState<string>();
  const [connectorKey, setConnectorKey] = useState("");
  const [connectorCredentialFields, setConnectorCredentialFields] = useState<
    Record<string, string>
  >({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<ConnectionStatusFilter>("all");

  const catalogCards = visibleIntegrationCatalog(connections.value ?? []);
  const oneClickCards = oneClickIntegrations(catalogCards);
  useRefreshOnReturn(connections.reload);
  const filterOn = query.trim() !== "" || statusFilter !== "all";
  const cards = filterIntegrationCatalog(catalogCards, {
    query,
    status: statusFilter,
  });
  const accountCards = installedIntegrationAccounts(cards);
  const attentionCards = accountCards.filter(
    (card) => card.status !== "connected" && !card.oauthPending,
  );
  const pendingCards = accountCards.filter((card) => card.oauthPending);
  const connectedCards = accountCards.filter(
    (card) => card.status === "connected",
  );

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
  };

  const startConnectionChat = async (prompt: string) => {
    setBusy("new-integration");
    connections.setError(undefined);
    try {
      const session = await api.enterChat({
        mode: "new",
        context: {
          version: 1,
          intent: "connection.create",
          origin: "connections",
          subjects: [],
          suggestedPrompt: prompt,
        },
      });
      navigate(`/chat/${session.id}`);
    } catch (error) {
      connections.setError(error);
      setBusy(undefined);
    }
  };

  const reconnect = async (card: ConnectionCardDto) => {
    if (
      card.credentialKind === "api-key" &&
      !(
        card.credentialConfigured &&
        card.connectionIssue === "verification_required"
      )
    ) {
      setConnectorKey("");
      setConnectorCredentialFields({});
      setKeyPanel(card.id);
      return;
    }
    setBusy(card.id);
    connections.setError(undefined);
    try {
      if (card.credentialKind === "oauth") {
        const result = await api.startConnectorOAuth(card.id);
        if (result.status === "redirect") {
          window.location.assign(result.authorizationUrl);
          return;
        }
      } else {
        await api.connectConnector(card.id);
      }
      await connections.reload();
    } catch (error) {
      connections.setError(error);
    } finally {
      setBusy(undefined);
    }
  };

  const reconnectWithKey = async (card: ConnectionCardDto) => {
    setBusy(card.id);
    connections.setError(undefined);
    try {
      await api.connectConnector(
        card.id,
        connectorCredentialInput(card, connectorKey, connectorCredentialFields),
      );
      setKeyPanel(undefined);
      setConnectorKey("");
      setConnectorCredentialFields({});
      await connections.reload();
    } catch (error) {
      connections.setError(error);
    } finally {
      setBusy(undefined);
    }
  };

  const connectFeatured = async (card: ConnectionCardDto) => {
    if (!card.setupVariantId) return;
    setBusy(card.id);
    connections.setError(undefined);
    try {
      const prepared = await api.prepareIntegrationVariant(
        card.manifestId ?? card.id,
        card.setupVariantId,
      );
      if (prepared.credentialKind === "oauth") {
        const result = await api.startConnectorOAuth(
          connectorProviderId(prepared),
        );
        if (result.status === "redirect") {
          window.location.assign(result.authorizationUrl);
          return;
        }
        await connections.reload();
        return;
      }
      await startConnectionChat(`Connect ${card.name}`);
    } catch (error) {
      connections.setError(error);
    } finally {
      setBusy(undefined);
    }
  };

  const renderCard = (card: ConnectionCardDto, isAccount: boolean) => {
    const connected = card.status === "connected";
    const comingSoon = card.status === "coming_soon";
    const setupRequired = oneClickIntegrationState(card) === "setup_required";
    const connectionIssue =
      card.connectionIssue === "verification_required"
        ? "Not tested"
        : card.connectionIssue === "credential_invalid"
          ? "Credential invalid"
          : card.connectionIssue === "credential_missing"
            ? card.credentialKind === "oauth"
              ? "Sign-in expired"
              : "Credential missing"
            : card.oauthPending
              ? "Sign-in pending"
              : "Disconnected";

    const toolCount = card.activeToolCount ?? card.toolCount;
    const toolText =
      toolCount === undefined
        ? "Tools load after setup"
        : `${toolCount} active ${toolCount === 1 ? "tool" : "tools"}`;

    const grantedScopes = card.permissionSets
      ?.filter((set) => set.granted)
      .map((set) => set.label)
      .join(", ");

    const desc =
      card.description ||
      grantedScopes ||
      "Connected integration tools for agents.";
    const providerName = card.providerName ?? card.name;
    const title = connectionCardTitle(card, isAccount);
    const account = isAccount ? connectionAccountLabel(card) : undefined;
    const subtitle =
      account && account !== title
        ? account
        : isAccount && providerName !== title
          ? providerName
          : undefined;

    return (
      <article
        className={`integration-card ${isAccount && !connected ? "paused" : ""}`}
        key={card.id}
        onClick={(event) => {
          const target = event.target as HTMLElement | null;
          if (
            target?.closest(
              "button, a, input, .connect-wrap, .connect-key-popover",
            )
          ) {
            return;
          }
          if (isAccount) {
            navigate(`/integrations/${encodeURIComponent(card.id)}`);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            const target = event.target as HTMLElement | null;
            if (
              target?.closest(
                "button, a, input, .connect-wrap, .connect-key-popover",
              )
            ) {
              return;
            }
            if (isAccount) {
              event.preventDefault();
              navigate(`/integrations/${encodeURIComponent(card.id)}`);
            }
          }
        }}
        tabIndex={isAccount ? 0 : undefined}
      >
        <div className="integration-card-top">
          <div className="integration-card-title-group">
            <ProviderMark
              name={providerName}
              svg={card.logoSvg}
              url={card.logoUrl}
            />
            <div className="integration-title-wrap">
              <span className="integration-title">{title}</span>
              {subtitle ? (
                <span className="integration-account">{subtitle}</span>
              ) : null}
            </div>
          </div>
          {isAccount ? (
            <span className={`integration-status ${connected ? "ok" : "warn"}`}>
              <i
                className={connected ? "dot-ok" : "dot-warn"}
                aria-hidden="true"
              />
              {connected ? "Connected" : connectionIssue}
            </span>
          ) : null}
        </div>

        <p className="integration-card-desc">{desc}</p>

        <div className="integration-card-footer">
          <span className="integration-card-tools">{toolText}</span>
          <div className="integration-actions">
            {isAccount ? (
              connected ? (
                <Link
                  aria-label={`Manage ${title}`}
                  className="quiet-button secondary"
                  to={`/integrations/${encodeURIComponent(card.id)}`}
                >
                  Manage ›
                </Link>
              ) : (
                <div className="connect-wrap">
                  <button
                    aria-expanded={keyPanel === card.id}
                    className="quiet-button"
                    disabled={busy !== undefined}
                    onClick={() => void reconnect(card)}
                    type="button"
                  >
                    {busy === card.id
                      ? "Testing…"
                      : card.connectionIssue === "verification_required"
                        ? "Test connection"
                        : "Reconnect"}
                  </button>
                  {card.credentialKind === "api-key" ? (
                    <ConnectKeyPopover
                      busy={busy === card.id}
                      credentialFields={card.credentialFields}
                      fieldValues={connectorCredentialFields}
                      keyCreationUrl={card.keyCreationUrl}
                      label={
                        card.credentialPlaceholder ?? `${card.name} API key`
                      }
                      onClose={() => {
                        setKeyPanel(undefined);
                        setConnectorKey("");
                        setConnectorCredentialFields({});
                      }}
                      onFieldChange={(name, value) =>
                        setConnectorCredentialFields((current) => ({
                          ...current,
                          [name]: value,
                        }))
                      }
                      onKeyChange={setConnectorKey}
                      onSubmit={() => void reconnectWithKey(card)}
                      open={keyPanel === card.id}
                      placeholder={
                        card.credentialPlaceholder ?? "Paste API key"
                      }
                      submitDisabled={
                        !connectorCredentialComplete(
                          card,
                          connectorKey,
                          connectorCredentialFields,
                        ) || busy !== undefined
                      }
                      submitLabel="Test connection"
                      value={connectorKey}
                    />
                  ) : null}
                </div>
              )
            ) : setupRequired || comingSoon ? (
              <span className="quiet-button secondary disabled">
                {setupRequired ? "Setup required" : "Coming soon"}
              </span>
            ) : (
              <button
                className="quiet-button"
                disabled={!card.setupVariantId || busy !== undefined}
                onClick={() => void connectFeatured(card)}
                type="button"
              >
                {busy === card.id
                  ? "Opening…"
                  : card.credentialKind === "oauth"
                    ? "Sign in"
                    : "Connect"}
              </button>
            )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <Page>
      <PageHeading
        title="Integrations."
        action={
          <div className="heading-actions">
            <Link className="button" to="/integrations/new">
              <PlusIcon />
              Add integration
            </Link>
            <FilterControl
              label="Filter integrations"
              on={filterOn}
              open={filterOpen}
              setOpen={setFilterOpen}
            >
              <input
                aria-label="Search integrations"
                className="filter-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search integrations"
                type="search"
                value={query}
              />
              <div className="filter-section-label">Status</div>
              <div className="filter-chips">
                {(["all", "connected", "disconnected"] as const).map(
                  (status) => (
                    <button
                      className={`filter-chip ${
                        statusFilter === status ? "on" : ""
                      }`}
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      type="button"
                    >
                      {status === "all"
                        ? "All"
                        : status === "connected"
                          ? "Connected"
                          : "Not connected"}
                    </button>
                  ),
                )}
              </div>
              {filterOn ? (
                <button
                  className="text-action filter-clear"
                  onClick={clearFilters}
                  type="button"
                >
                  Clear filters
                </button>
              ) : null}
            </FilterControl>
          </div>
        }
      />
      {connections.loading ? <LoadingLine /> : null}
      {connections.error ? (
        <ErrorNotice error={connections.error} retry={connections.reload} />
      ) : null}
      {searchParams.get("oauthError") ? (
        <ErrorNotice error={searchParams.get("oauthError")} />
      ) : null}

      {/* One-Click Quick Connect: Clean logo shell to start a connection */}
      {!connections.loading && oneClickCards.length > 0 && !filterOn ? (
        <section
          className="integration-quick-section"
          aria-label="One-click connectors"
        >
          <div className="integration-quick-header">
            <h2 className="integration-quick-title">One-click connectors</h2>
          </div>
          <section
            className="integration-quick-row"
            aria-label="One-click connectors list"
          >
            {oneClickCards.map((card) => {
              const providerName = card.providerName ?? card.name;
              const quickState = oneClickIntegrationState(card);
              const connected = quickState === "connected";
              const needsAttention =
                quickState === "needs_attention" && !card.oauthPending;
              return (
                <button
                  type="button"
                  aria-label={
                    connected
                      ? `Connected ${providerName}`
                      : needsAttention
                        ? `${providerName} needs attention`
                        : undefined
                  }
                  className={`integration-quick-item ${
                    connected
                      ? "connected"
                      : needsAttention
                        ? "needs-attention"
                        : ""
                  }`}
                  key={card.manifestId ?? card.id}
                  disabled={busy !== undefined}
                  onClick={() => {
                    if (card.installed) {
                      navigate(`/integrations/${encodeURIComponent(card.id)}`);
                    } else if (card.setupVariantId) {
                      void connectFeatured(card);
                    } else {
                      void reconnect(card);
                    }
                  }}
                  title={
                    connected
                      ? `${providerName} is connected`
                      : needsAttention
                        ? `${providerName} needs attention`
                        : `Connect ${providerName}`
                  }
                >
                  <div className="integration-quick-logo">
                    <ProviderMark
                      name={providerName}
                      svg={card.logoSvg}
                      url={card.logoUrl}
                    />
                    {connected || needsAttention ? (
                      <span
                        aria-hidden="true"
                        className={`integration-quick-status ${
                          connected ? "connected" : "needs-attention"
                        }`}
                      >
                        {connected ? "✓" : "!"}
                      </span>
                    ) : null}
                  </div>
                  <span className="integration-quick-name">
                    {busy === card.id ? "…" : providerName}
                  </span>
                </button>
              );
            })}
          </section>
          <hr className="integration-divider" />
        </section>
      ) : null}

      {filterOn && accountCards.length === 0 && catalogCards.length > 0 ? (
        <EmptyState
          title="No matches"
          body="No connected integrations match the current filters."
          action={
            <button
              className="text-action"
              onClick={clearFilters}
              type="button"
            >
              Clear filters
            </button>
          }
        />
      ) : null}
      {!connections.loading && !filterOn && accountCards.length === 0 ? (
        <EmptyState
          title="No connected integrations"
          body="Select Add integration and tell Springroll which service you want to connect."
        />
      ) : null}

      {pendingCards.length > 0 ? (
        <>
          <div className="integration-section-header">
            <h2 className="integration-section-title">
              Sign-in pending ({pendingCards.length})
            </h2>
          </div>
          <p className="muted">
            Finish sign-in in your browser, then return here. If you already
            approved access, open the integration to reconnect or remove the
            unfinished setup.
          </p>
          <div className="integration-grid">
            {pendingCards.map((card) => renderCard(card, true))}
          </div>
        </>
      ) : null}

      {attentionCards.length > 0 ? (
        <div className="integration-section-header">
          <h2 className="integration-section-title">
            Needs attention ({attentionCards.length})
          </h2>
        </div>
      ) : null}

      <div className="integration-grid">
        {attentionCards.map((card) => renderCard(card, true))}
      </div>

      {connectedCards.length > 0 ? (
        <div className="integration-section-header integration-connected-header">
          <h2 className="integration-section-title">
            Connected integrations ({connectedCards.length})
          </h2>
        </div>
      ) : null}

      <div className="integration-grid">
        {connectedCards.map((card) => renderCard(card, true))}
      </div>
    </Page>
  );
}

function ConnectionDetailPage() {
  const { confirm, confirmation } = useConfirmationDialog();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const loadConnection = useCallback(() => api.connection(id), [id]);
  const connection = useLoad(loadConnection);
  useRefreshOnReturn(connection.reload);
  const [updatingTool, setUpdatingTool] = useState<string>();
  const [updatingHosted, setUpdatingHosted] = useState(false);
  const [upgradingPermission, setUpgradingPermission] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [addingKey, setAddingKey] = useState(false);
  const [reconnectingKey, setReconnectingKey] = useState(false);
  const [connectorKey, setConnectorKey] = useState("");
  const [connectorCredentialFields, setConnectorCredentialFields] = useState<
    Record<string, string>
  >({});
  useAskBarChip("connection", connection.value?.name);

  const updateToolPolicy = async (
    toolName: string,
    mode: ConnectorToolMode,
  ) => {
    setUpdatingTool(toolName);
    try {
      await api.updateConnectionToolPolicy(id, toolName, mode);
      await connection.reload();
    } catch (error) {
      connection.setError(error);
    } finally {
      setUpdatingTool(undefined);
    }
  };

  const updateHostedCredential = async (enabled: boolean) => {
    setUpdatingHosted(true);
    try {
      if (enabled) {
        await api.enableConnectionHosted(id);
      } else {
        await api.disableConnectionHosted(id);
      }
      await connection.reload();
    } catch (error) {
      connection.setError(error);
    } finally {
      setUpdatingHosted(false);
    }
  };

  const upgradePermission = async (permissionSet: string) => {
    setUpgradingPermission(permissionSet);
    connection.setError(undefined);
    try {
      const result = await api.startConnectorOAuth(
        id,
        undefined,
        permissionSet,
      );
      if (result.status === "redirect") {
        window.location.assign(result.authorizationUrl);
        return;
      }
      await connection.reload();
    } catch (error) {
      connection.setError(error);
    } finally {
      setUpgradingPermission(undefined);
    }
  };

  const reconnect = async () => {
    const card = connection.value;
    if (!card) return;
    if (
      card.credentialKind === "api-key" &&
      !(
        card.credentialConfigured &&
        card.connectionIssue === "verification_required"
      )
    ) {
      setAddingKey(false);
      setConnectorKey("");
      setConnectorCredentialFields({});
      setReconnectingKey(true);
      return;
    }
    setBusy(true);
    connection.setError(undefined);
    try {
      if (card.credentialKind === "oauth") {
        const result = await api.startConnectorOAuth(id);
        if (result.status === "redirect") {
          window.location.assign(result.authorizationUrl);
          return;
        }
      } else {
        await api.connectConnector(id);
      }
      await connection.reload();
    } catch (error) {
      connection.setError(error);
    } finally {
      setBusy(false);
    }
  };

  const reconnectWithKey = async () => {
    const card = connection.value;
    if (!card) return;
    setBusy(true);
    connection.setError(undefined);
    try {
      await api.connectConnector(
        id,
        connectorCredentialInput(card, connectorKey, connectorCredentialFields),
      );
      setReconnectingKey(false);
      setConnectorKey("");
      setConnectorCredentialFields({});
      await connection.reload();
    } catch (error) {
      connection.setError(error);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!connection.value) return;
    const action =
      connection.value.credentialKind === "oauth"
        ? "Sign out"
        : connection.value.credentialKind === "none"
          ? "Disable"
          : "Disconnect";
    const consequence =
      connection.value.credentialKind === "oauth"
        ? "Springroll will remove its OAuth credential from this Mac and disable its tools, but keep the connector so you can sign in again later. This does not revoke the provider-side grant."
        : connection.value.credentialKind === "api-key"
          ? "Springroll will remove its API credential from Keychain and disable its tools, but keep the connector so you can reconnect later."
          : "Springroll will disable its tools but keep the connector so you can enable it again later.";
    if (
      !(await confirm(
        `${action} ${connection.value.name} on this Mac? ${consequence}`,
      ))
    ) {
      return;
    }
    setBusy(true);
    connection.setError(undefined);
    try {
      await api.disconnectConnector(id);
      await connection.reload();
    } catch (error) {
      connection.setError(error);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!connection.value) return;
    if (
      !(await confirm(
        `Remove ${connection.value.name} from Springroll? This deletes the installed connector configuration and any saved credential. It cannot be removed while a recipe still uses it.`,
      ))
    ) {
      return;
    }
    setBusy(true);
    connection.setError(undefined);
    try {
      await api.removeConnector(id);
      navigate("/integrations", { replace: true });
    } catch (error) {
      connection.setError(error);
      setBusy(false);
    }
  };

  const addAccount = async () => {
    const card = connection.value;
    if (card?.canAddAnother !== true) return;
    if (card.credentialKind === "api-key") {
      setReconnectingKey(false);
      setConnectorKey("");
      setConnectorCredentialFields({});
      setAddingKey(true);
      return;
    }
    setBusy(true);
    connection.setError(undefined);
    try {
      const result = await api.startConnectorOAuth(connectorProviderId(card));
      if (result.status === "redirect") {
        window.location.assign(result.authorizationUrl);
        return;
      }
      await connection.reload();
    } catch (error) {
      connection.setError(error);
    } finally {
      setBusy(false);
    }
  };

  const addAccountWithKey = async () => {
    const card = connection.value;
    if (!card) return;
    setBusy(true);
    connection.setError(undefined);
    try {
      await api.connectConnector(
        connectorProviderId(card),
        connectorCredentialInput(card, connectorKey, connectorCredentialFields),
      );
      setAddingKey(false);
      setConnectorKey("");
      setConnectorCredentialFields({});
      navigate("/integrations");
    } catch (error) {
      connection.setError(error);
    } finally {
      setBusy(false);
    }
  };

  const renameAccount = async () => {
    if (!connection.value) return;
    const currentTitle = connectionCardTitle(connection.value, true);
    const name = window.prompt("Account label", currentTitle)?.trim();
    if (!name || name === currentTitle) return;
    setBusy(true);
    connection.setError(undefined);
    try {
      await api.renameConnection(id, name);
      await connection.reload();
    } catch (error) {
      connection.setError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <BackLink to="/integrations">Integrations</BackLink>
      {confirmation}
      {connection.loading ? <LoadingLine /> : null}
      {connection.error ? (
        <ErrorNotice error={connection.error} retry={connection.reload} />
      ) : null}
      {connection.value ? (
        <>
          <ConnectionDetailContent
            reconnectAction={
              connection.value.status !== "connected" ? (
                <div className="connect-wrap">
                  <button
                    aria-expanded={reconnectingKey}
                    className="button primary"
                    disabled={busy}
                    onClick={() => void reconnect()}
                    type="button"
                  >
                    {busy
                      ? connection.value.credentialKind === "oauth"
                        ? "Opening sign-in…"
                        : "Testing…"
                      : connection.value.connectionIssue ===
                          "verification_required"
                        ? "Test connection"
                        : `Reconnect ${connection.value.providerName ?? connection.value.name}`}
                  </button>
                  {connection.value.credentialKind === "api-key" ? (
                    <ConnectKeyPopover
                      busy={busy}
                      credentialFields={connection.value.credentialFields}
                      fieldValues={connectorCredentialFields}
                      keyCreationUrl={connection.value.keyCreationUrl}
                      label={
                        connection.value.credentialPlaceholder ??
                        `${connection.value.name} API key`
                      }
                      onClose={() => {
                        setReconnectingKey(false);
                        setConnectorKey("");
                        setConnectorCredentialFields({});
                      }}
                      onFieldChange={(name, value) =>
                        setConnectorCredentialFields((current) => ({
                          ...current,
                          [name]: value,
                        }))
                      }
                      onKeyChange={setConnectorKey}
                      onSubmit={() => void reconnectWithKey()}
                      open={reconnectingKey}
                      placeholder={
                        connection.value.credentialPlaceholder ??
                        "Paste API key"
                      }
                      submitDisabled={
                        !connectorCredentialComplete(
                          connection.value,
                          connectorKey,
                          connectorCredentialFields,
                        ) || busy
                      }
                      submitLabel="Test connection"
                      value={connectorKey}
                    />
                  ) : null}
                </div>
              ) : undefined
            }
            addAccountAction={
              connection.value.status === "connected" &&
              connection.value.canAddAnother === true ? (
                <div className="connect-wrap">
                  <button
                    aria-expanded={addingKey}
                    className="quiet-button"
                    disabled={busy}
                    onClick={() => void addAccount()}
                    type="button"
                  >
                    {busy && !addingKey
                      ? "Opening…"
                      : busy
                        ? "Connecting…"
                        : "Add another account"}
                  </button>
                  {connection.value.credentialKind === "api-key" ? (
                    <ConnectKeyPopover
                      busy={busy}
                      credentialFields={connection.value.credentialFields}
                      fieldValues={connectorCredentialFields}
                      keyCreationUrl={connection.value.keyCreationUrl}
                      label={
                        connection.value.credentialPlaceholder ??
                        `${connection.value.name} API key`
                      }
                      onClose={() => {
                        setAddingKey(false);
                        setConnectorKey("");
                        setConnectorCredentialFields({});
                      }}
                      onFieldChange={(name, value) =>
                        setConnectorCredentialFields((current) => ({
                          ...current,
                          [name]: value,
                        }))
                      }
                      onKeyChange={setConnectorKey}
                      onSubmit={() => void addAccountWithKey()}
                      open={addingKey}
                      placeholder={
                        connection.value.credentialPlaceholder ??
                        "Paste API key"
                      }
                      submitDisabled={
                        !connectorCredentialComplete(
                          connection.value,
                          connectorKey,
                          connectorCredentialFields,
                        ) || busy
                      }
                      submitLabel="Add account"
                      value={connectorKey}
                    />
                  ) : null}
                </div>
              ) : undefined
            }
            connection={connection.value}
            updatingHosted={updatingHosted}
            updateHostedCredential={updateHostedCredential}
            upgradingPermission={upgradingPermission}
            upgradePermission={upgradePermission}
            updatingTool={updatingTool}
            updateToolPolicy={updateToolPolicy}
          />
          <div className="record-actions" style={{ marginTop: 40 }}>
            {connection.value.status === "connected" ? (
              <button
                className="quiet-button secondary"
                disabled={busy}
                onClick={() => void disconnect()}
                type="button"
              >
                {connection.value.credentialKind === "oauth"
                  ? "Sign out on this Mac"
                  : connection.value.credentialKind === "none"
                    ? "Disable on this Mac"
                    : "Disconnect on this Mac"}
              </button>
            ) : null}
            <button
              className="quiet-button secondary"
              disabled={busy}
              onClick={() => void renameAccount()}
              type="button"
            >
              Rename account
            </button>
            <DeleteButton
              label="Remove this integration"
              disabled={busy}
              onClick={() => void remove()}
            />
          </div>
        </>
      ) : null}
    </Page>
  );
}

function ConnectionDetailContent({
  addAccountAction,
  connection,
  reconnectAction,
  updatingHosted,
  updateHostedCredential,
  upgradingPermission,
  upgradePermission,
  updatingTool,
  updateToolPolicy,
}: {
  readonly addAccountAction?: ReactNode;
  readonly connection: ConnectionDetailDto;
  readonly reconnectAction?: ReactNode;
  readonly updatingHosted: boolean;
  readonly updateHostedCredential: (enabled: boolean) => Promise<void>;
  readonly upgradingPermission: string | undefined;
  readonly upgradePermission: (permissionSet: string) => Promise<void>;
  readonly updatingTool: string | undefined;
  readonly updateToolPolicy: (
    toolName: string,
    mode: ConnectorToolMode,
  ) => Promise<void>;
}) {
  const connected = connection.status === "connected";
  const [expandedTools, setExpandedTools] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const toggleTool = (name: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const catalogLabel =
    connection.catalogSource === "live"
      ? "Live catalog"
      : connection.catalogSource === "last-discovered"
        ? "Last discovered catalog"
        : "Catalog unavailable";
  const accountTitle = connectionCardTitle(connection, true);
  const account = connectionAccountLabel(connection);

  const transport = connection.transportDetails;
  const primaryEndpoint =
    transport?.endpoint ?? connection.endpoint ?? "Endpoint not configured";
  const copyValue =
    transport?.clientConfigSnippet ?? transport?.copySnippet ?? primaryEndpoint;

  const handleCopySnippet = async () => {
    if (!copyValue) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyValue);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = copyValue;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    } catch {
      // Ignore clipboard error
    }
  };

  const statusLabel =
    connection.status === "connected"
      ? "Connected"
      : connection.status === "coming_soon"
        ? connection.oauthReady === false
          ? "OAuth app setup required"
          : "Coming soon"
        : connection.connectionIssue === "verification_required"
          ? "Not tested — a successful connection test is required"
          : connection.connectionIssue === "credential_invalid"
            ? "Credential invalid — reconnect required"
            : connection.connectionIssue === "credential_missing"
              ? connection.credentialKind === "oauth"
                ? "Sign-in expired — reconnect required"
                : "Credential missing — reconnect required"
              : connection.oauthPending
                ? "Sign-in pending — finish in your browser, then return here"
                : "Not connected";

  return (
    <>
      <div className="connection-detail-heading">
        <ProviderMark
          name={connection.providerName ?? connection.name}
          svg={connection.logoSvg}
          url={connection.logoUrl}
        />
        <PageHeading
          eyebrow={connected ? "Connected" : "Integration"}
          title={`${accountTitle}.`}
          action={reconnectAction}
        />
      </div>
      <p className="page-intro">{connection.description}</p>

      <dl className="detail-grid connection-detail-grid">
        <div>
          <dt>Status</dt>
          <dd>{statusLabel}</dd>
        </div>
        {account && account !== accountTitle ? (
          <div>
            <dt>Account</dt>
            <dd>{account}</dd>
          </div>
        ) : null}
        <div>
          <dt>Protocol</dt>
          <dd>
            {transport?.protocolLabel ??
              (connection.connectionType === "local"
                ? "Local MCP (Stdio)"
                : connection.connectionType === "api"
                  ? "REST / Documented API"
                  : "Model Context Protocol")}
          </dd>
        </div>
        <div>
          <dt>Authentication</dt>
          <dd>
            {transport?.authLabel ??
              (connection.credentialKind === "oauth"
                ? "OAuth 2.0 PKCE"
                : connection.credentialKind === "api-key"
                  ? "API key in Keychain"
                  : "None")}
          </dd>
        </div>
        <div>
          <dt>Where it runs</dt>
          <dd>
            {transport?.executionScopeLabel ??
              (connection.availableIn?.includes("hosted")
                ? "This Mac and Cloud"
                : "This Mac only")}
            {connection.availableIn?.includes("hosted") ? null : (
              <small>Recipes using this integration stay on this Mac.</small>
            )}
            {connected && connection.hostedEligible ? (
              connection.hostedCredentialEscrowAvailable ? (
                <button
                  className="quiet-button secondary hosted-credential-action"
                  disabled={updatingHosted}
                  onClick={() =>
                    void updateHostedCredential(
                      connection.hostedCredentialEscrowed !== true,
                    )
                  }
                  type="button"
                >
                  {updatingHosted
                    ? "Updating…"
                    : connection.hostedCredentialEscrowed
                      ? "Keep on this Mac"
                      : "Enable Cloud runs"}
                </button>
              ) : (
                <small>
                  Cloud runs will be available when hosted credential storage is
                  configured.
                </small>
              )
            ) : null}
          </dd>
        </div>
        {["gmail", "google-calendar", "google-drive"].includes(
          connection.manifestId ?? connection.id,
        ) ? (
          <div>
            <dt>AI data protection</dt>
            <dd>
              {connection.googleDataProtection?.enforced
                ? "Direct API providers · OpenRouter ZDR enforced"
                : "ZDR protection not enabled"}
            </dd>
          </div>
        ) : null}
      </dl>

      {/* Connection configuration block (Option 1) */}
      <div className="section-heading connection-details-heading">
        <div>
          <div className="section-label">Connection configuration</div>
          <h2>{transport?.protocolLabel ?? "Connection details"}</h2>
        </div>
        <span className="status status-quiet">{catalogLabel}</span>
      </div>

      {transport?.clientConfigSnippet ? (
        <div className="code-container">
          <div className="code-card-header">
            <span className="code-card-label">
              {transport.kind === "mcp-remote" || transport.kind === "mcp-local"
                ? "mcpServers configuration"
                : "Configuration"}
            </span>
            <button
              className={`copy-action${copiedSnippet ? " copied" : ""}`}
              onClick={handleCopySnippet}
              type="button"
            >
              {copiedSnippet ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
              <span>{copiedSnippet ? "Copied" : "Copy JSON"}</span>
            </button>
          </div>
          <pre className="code-card-body">
            <code>{transport.clientConfigSnippet}</code>
          </pre>
          <div className="code-card-footer">
            <span>
              Auth: <b>{transport.authLabel ?? "None"}</b>
            </span>
            <span>
              Runs: <b>{transport.executionScopeLabel}</b>
            </span>
            {primaryEndpoint ? (
              <span>
                Endpoint: <b>{primaryEndpoint}</b>
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="code-container">
          <div className="code-card-header">
            <span className="code-card-label">Endpoint</span>
            <button
              className={`copy-action${copiedSnippet ? " copied" : ""}`}
              onClick={handleCopySnippet}
              type="button"
            >
              {copiedSnippet ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
              <span>{copiedSnippet ? "Copied" : "Copy"}</span>
            </button>
          </div>
          <div className="code-card-body">
            <code>{primaryEndpoint}</code>
          </div>
          <div className="code-card-footer">
            <span>
              Auth: <b>{transport?.authLabel ?? "None"}</b>
            </span>
            <span>
              Runs:{" "}
              <b>{transport?.executionScopeLabel ?? "This Mac and Cloud"}</b>
            </span>
          </div>
        </div>
      )}

      {addAccountAction ? (
        <div className="connection-accounts">
          <div className="section-heading connection-tools-heading connection-accounts-heading">
            <div>
              <div className="section-label">Accounts</div>
              <h2>{account ?? accountTitle}</h2>
            </div>
            {addAccountAction}
          </div>
        </div>
      ) : null}

      {connected && connection.permissionSets?.length ? (
        <div className="connection-permissions">
          <div className="section-heading connection-tools-heading">
            <div>
              <div className="section-label">Permissions</div>
              <h2>What this account can do</h2>
            </div>
            <span className="subtitle">
              Permissions granted to this account
            </span>
          </div>
          <div className="connection-permission-list">
            {connection.permissionSets.map((set) => (
              <article className="connection-permission-row" key={set.id}>
                <div>
                  <h3>{set.label}</h3>
                  <p>{set.summary}</p>
                </div>
                {set.granted ? (
                  <span className="connection-permission-granted">On</span>
                ) : (
                  <button
                    className="quiet-button"
                    disabled={upgradingPermission !== undefined}
                    onClick={() => void upgradePermission(set.id)}
                    type="button"
                  >
                    {upgradingPermission === set.id
                      ? "Opening Google…"
                      : "Reconnect"}
                  </button>
                )}
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {/* Available Tools Section (Option 1 Stacked List) */}
      <div className="section-heading connection-tools-heading">
        <div>
          <div className="section-label">Available tools</div>
          <h2>
            {connection.tools.length}{" "}
            {connection.tools.length === 1 ? "tool" : "tools"}
          </h2>
        </div>
        <span className="subtitle">
          Allow runs directly · Check first requests approval · Off blocks
          execution
        </span>
      </div>

      {connection.tools.length ? (
        <div className="d1-tool-list">
          {connection.tools.map((tool) => {
            const isOpen = expandedTools.has(tool.name);
            return (
              <article
                className={`d1-tool-item ${isOpen ? "open" : ""}`}
                key={tool.name}
              >
                {/* A button cannot contain the policy select that shares this row. */}
                {/* biome-ignore lint/a11y/useSemanticElements: composite disclosure row */}
                <div
                  className="d1-tool-row"
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("select")) return;
                    toggleTool(tool.name);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    if ((event.target as HTMLElement).closest("select")) return;
                    event.preventDefault();
                    toggleTool(tool.name);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="d1-tool-main">
                    <div className="d1-tool-name-line">
                      <span className={`caret-icon ${isOpen ? "open" : ""}`}>
                        <ChevronRightIcon size={14} />
                      </span>
                      <span className="tool-name">{tool.name}</span>
                    </div>
                  </div>
                  <div className="d1-tool-side">
                    <span className="tool-effect-label">{tool.effect}</span>
                    <select
                      aria-label={`${tool.name} connector policy`}
                      className="quiet-select"
                      disabled={!connected || updatingTool !== undefined}
                      onChange={(event) =>
                        void updateToolPolicy(
                          tool.name,
                          event.target.value as ConnectorToolMode,
                        )
                      }
                      value={tool.mode}
                    >
                      <option value="allow">Allow</option>
                      <option value="check_first">Check first</option>
                      <option value="off">Off</option>
                    </select>
                  </div>
                </div>

                {isOpen ? (
                  <div className="d1-drawer">
                    {tool.path ? (
                      <div className="d1-drawer-path">
                        <code>
                          {tool.method ? `${tool.method} ` : ""}
                          {tool.path}
                        </code>
                      </div>
                    ) : null}
                    <div className="d1-drawer-desc">
                      {tool.description?.trim() ? (
                        <RunMarkdown content={tool.description.trim()} />
                      ) : (
                        <p>
                          This connector did not provide a tool description.
                        </p>
                      )}
                    </div>
                    {tool.parameters && tool.parameters.length > 0 ? (
                      <div className="d1-drawer-inputs">
                        <div className="d1-drawer-label">Inputs:</div>
                        {tool.parameters.map((param) => (
                          <div className="param-item" key={param.name}>
                            <code>{param.name}</code>
                            <span className="type">
                              ({param.type ?? "parameter"}
                              {param.required ? ", required" : ", optional"}
                              {param.location ? `, ${param.location}` : ""})
                            </span>
                            {param.description ? (
                              <span className="desc">
                                — {param.description}
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          body={
            connected
              ? "Springroll could not load this connection's live tool catalog."
              : "Connect this service to discover the tools the agent can use."
          }
          title="No tool catalog yet"
        />
      )}

      {/* Credential Audit / Host-Side Activity */}
      {connection.credentialAudit.length ? (
        <section className="connection-audit-section">
          <div className="section-heading connection-tools-heading">
            <div>
              <div className="section-label">Host activity</div>
              <h2>Credential audit</h2>
            </div>
          </div>
          <ul className="audit-timeline">
            {connection.credentialAudit.map((event) => (
              <li className="audit-timeline-item" key={event.id}>
                <span className="audit-dot" />
                <div className="audit-timeline-content">
                  <span className="audit-action">
                    {credentialAuditActionLabel(event.action)}
                  </span>
                  {event.failureCategory ? (
                    <span className="audit-failure">
                      — {event.failureCategory.replaceAll("_", " ")}
                    </span>
                  ) : null}
                </div>
                <time className="audit-date">
                  {formatFullDate(event.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function credentialAuditActionLabel(
  action: ConnectionDetailDto["credentialAudit"][number]["action"],
): string {
  switch (action) {
    case "test":
      return "Credential tested";
    case "oauth_start":
      return "OAuth started";
    case "oauth_complete":
      return "OAuth completed";
    case "hosted_enable":
      return "Cloud runs enabled";
    case "hosted_disable":
      return "Cloud runs disabled";
    case "revoke":
      return "Credential revoked";
    case "remove":
      return "Connector removed";
  }
}

function capabilityModeLabel(mode: ConnectorToolMode): string {
  return mode === "check_first"
    ? "Check first"
    : mode === "off"
      ? "Off"
      : "Allow";
}

function NewIntegrationConversationEntryPage() {
  const [searchParams] = useSearchParams();
  const suggestedPrompt = searchParams.get("prompt")?.trim() || undefined;
  return (
    <ConversationEntryPage
      backTo="/integrations"
      entry={{
        mode: "new",
        context: {
          version: 1,
          intent: "connection.create",
          origin: "integrations",
          subjects: [],
          ...(suggestedPrompt ? { suggestedPrompt } : {}),
        },
      }}
    />
  );
}

function NewIntegrationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialPrompt = searchParams.get("prompt") ?? "";
  const [outcome, setOutcome] = useState<IntegrationProposalOutcomeDto>();
  const [selectedVariant, setSelectedVariant] = useState<string>();
  const [prepared, setPrepared] = useState<ConnectionCardDto>();
  const [customPrepared, setCustomPrepared] = useState<ConnectionCardDto>();
  const [customType, setCustomType] = useState<"mcp" | "api-docs" | "openapi">(
    "mcp",
  );
  const [customName, setCustomName] = useState("");
  const [customEndpoint, setCustomEndpoint] = useState("");
  const [customApiGoal, setCustomApiGoal] = useState("");
  const [customKeyCreationUrl, setCustomKeyCreationUrl] = useState("");
  const [customCredential, setCustomCredential] = useState<
    "oauth" | "api-key" | "none"
  >("oauth");
  const [customHeader, setCustomHeader] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [credentialFields, setCredentialFields] = useState<
    Record<string, string>
  >({});
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState<string>();
  const prefillSubmitted = useRef(false);

  const perform = async (name: string, action: () => Promise<unknown>) => {
    setBusy(name);
    setError(undefined);
    try {
      await action();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(undefined);
    }
  };

  useEffect(() => {
    if (!initialPrompt.trim() || prefillSubmitted.current) return;
    prefillSubmitted.current = true;
    void (async () => {
      try {
        const session = await api.enterChat({
          mode: "new",
          context: {
            version: 1,
            intent: "connection.create",
            origin: "integrations",
            subjects: [],
          },
        });
        navigate(`/chat/${encodeURIComponent(session.id)}`, {
          state: { pendingMessage: initialPrompt.trim() },
        });
      } catch (caught) {
        setError(caught);
      }
    })();
  }, [initialPrompt, navigate]);

  const beginSetup = async () => {
    if (outcome?.status !== "ready" || !selectedVariant) return;
    setBusy("setup");
    setError(undefined);
    try {
      const card = await api.prepareIntegrationVariant(
        outcome.proposal.templateId,
        selectedVariant,
      );
      setPrepared(card);
      if (card.credentialKind === "oauth") {
        const result = await api.startConnectorOAuth(connectorProviderId(card));
        if (result.status === "redirect") {
          window.location.assign(result.authorizationUrl);
          return;
        }
        setOutcome(undefined);
        setPrepared(undefined);
        navigate("/integrations");
      } else if (card.credentialKind === "none") {
        await api.connectConnector(card.id);
        setOutcome(undefined);
        setPrepared(undefined);
        navigate("/integrations");
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(undefined);
    }
  };

  const activeVariant =
    outcome?.status === "ready"
      ? outcome.proposal.variants.find(
          (variant) => variant.id === selectedVariant,
        )
      : undefined;

  return (
    <Page narrow>
      <BackLink to="/integrations">Integrations</BackLink>
      <PageHeading eyebrow="New integration" title="Add from configuration." />
      <p className="page-intro">
        Describe a service in the ask bar, or paste MCP configuration or API
        documentation here. Credentials are collected separately and never sent
        through chat.
      </p>
      <details className="integration-evidence custom-mcp-entry">
        <summary>I already have MCP configuration or API documentation</summary>
        <form
          className="connection-form"
          onSubmit={(event) => {
            event.preventDefault();
            void perform("custom", async () => {
              if (customType === "api-docs") {
                const session = await api.enterChat({
                  mode: "new",
                  context: {
                    version: 1,
                    intent: "connection.create",
                    origin: "integrations",
                    subjects: [],
                    suggestedPrompt: `Create a small API integration${customName.trim() ? ` named ${customName.trim()}` : ""} for this goal: ${customApiGoal.trim()}\n\nAPI documentation: ${customEndpoint.trim()}`,
                  },
                });
                navigate(`/chat/${session.id}`);
                return;
              }
              const card =
                customType === "openapi"
                  ? await api.prepareCustomOpenApi({
                      ...(customName.trim() ? { name: customName.trim() } : {}),
                      specUrl: customEndpoint.trim(),
                      ...(customKeyCreationUrl.trim()
                        ? { keyCreationUrl: customKeyCreationUrl.trim() }
                        : {}),
                    })
                  : await api.prepareImportedRemoteMcp({
                      ...(customName.trim() ? { name: customName.trim() } : {}),
                      configuration: customEndpoint.trim(),
                      credentialKind: customCredential,
                      ...(customCredential === "api-key" && customHeader.trim()
                        ? { header: customHeader.trim() }
                        : {}),
                    });
              setCustomPrepared(card);
              if (card.credentialKind === "oauth") {
                const result = await api.startConnectorOAuth(
                  connectorProviderId(card),
                );
                if (result.status === "redirect") {
                  window.location.assign(result.authorizationUrl);
                  return;
                }
                navigate("/integrations");
              } else if (card.credentialKind === "none") {
                await api.connectConnector(card.id);
                navigate("/integrations");
              }
            });
          }}
        >
          <label>
            Connection type
            <select
              onChange={(event) => {
                setCustomType(
                  event.target.value as "mcp" | "api-docs" | "openapi",
                );
                setCustomPrepared(undefined);
                setError(undefined);
              }}
              value={customType}
            >
              <option value="mcp">Remote MCP server</option>
              <option value="api-docs">API documentation</option>
              <option value="openapi">OpenAPI 3.x API</option>
            </select>
          </label>
          <label>
            Name <small>optional</small>
            <input
              onChange={(event) => setCustomName(event.target.value)}
              placeholder="My connector"
              value={customName}
            />
          </label>
          <label htmlFor="custom-integration-endpoint">
            {customType === "openapi"
              ? "OpenAPI JSON URL"
              : customType === "api-docs"
                ? "API documentation URL"
                : "MCP URL or configuration JSON"}
            {customType === "mcp" ? (
              <textarea
                id="custom-integration-endpoint"
                onChange={(event) => setCustomEndpoint(event.target.value)}
                placeholder={
                  'https://example.com/mcp\n\nor\n\n{"mcpServers":{"example":{"url":"https://example.com/mcp"}}}'
                }
                required
                value={customEndpoint}
              />
            ) : (
              <input
                id="custom-integration-endpoint"
                onChange={(event) => setCustomEndpoint(event.target.value)}
                placeholder={
                  customType === "openapi"
                    ? "https://example.com/openapi.json"
                    : "https://example.com/api/docs"
                }
                required
                type="url"
                value={customEndpoint}
              />
            )}
          </label>
          {customType === "api-docs" ? (
            <>
              <label>
                What should Springroll do with this API?
                <textarea
                  onChange={(event) => setCustomApiGoal(event.target.value)}
                  placeholder="Look up the current exchange rate for a currency pair"
                  required
                  value={customApiGoal}
                />
              </label>
              <p className="proposal-mode">
                Springroll will summarize only the operations needed for this
                goal, show the adapter for review, and run an explicitly safe
                test when the documentation identifies one. OpenAPI is optional.
              </p>
            </>
          ) : null}
          {customType === "openapi" ? (
            <>
              <p className="proposal-mode">
                Springroll reads the API server, authentication header, and
                operations from the specification. Header API keys and bearer
                tokens are supported.
              </p>
              <label>
                API-key setup URL <small>optional</small>
                <input
                  onChange={(event) =>
                    setCustomKeyCreationUrl(event.target.value)
                  }
                  placeholder="https://example.com/settings/api-keys"
                  type="url"
                  value={customKeyCreationUrl}
                />
              </label>
            </>
          ) : customType === "mcp" ? (
            <>
              <label>
                Authentication
                <select
                  onChange={(event) =>
                    setCustomCredential(
                      event.target.value as "oauth" | "api-key" | "none",
                    )
                  }
                  value={customCredential}
                >
                  <option value="oauth">OAuth sign-in</option>
                  <option value="api-key">API key</option>
                  <option value="none">None</option>
                </select>
              </label>
              {customCredential === "api-key" ? (
                <label>
                  Header{" "}
                  <small>optional; defaults to Bearer authorization</small>
                  <input
                    onChange={(event) => setCustomHeader(event.target.value)}
                    placeholder="X-API-Key"
                    value={customHeader}
                  />
                </label>
              ) : null}
            </>
          ) : null}
          <div className="proposal-actions">
            <button
              className="button"
              disabled={
                !customEndpoint.trim() ||
                (customType === "api-docs" && !customApiGoal.trim()) ||
                busy !== undefined
              }
              type="submit"
            >
              {busy === "custom"
                ? "Checking…"
                : customType === "api-docs"
                  ? "Summarize API"
                  : "Continue"}
            </button>
          </div>
        </form>
        {customPrepared?.credentialKind === "api-key" ? (
          <form
            className="connection-form secure-credential-form"
            onSubmit={(event) => {
              event.preventDefault();
              void perform("custom-credential", async () => {
                await api.connectConnector(customPrepared.id, apiKey);
                setApiKey("");
                navigate("/connections");
              });
            }}
          >
            <label>
              {customPrepared.name} API key
              <input
                autoComplete="off"
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  customPrepared.credentialPlaceholder ?? "Your API key"
                }
                type="password"
                value={apiKey}
              />
            </label>
            <div className="proposal-actions">
              <button
                className="button"
                disabled={!apiKey.trim() || busy !== undefined}
                type="submit"
              >
                {busy === "custom-credential"
                  ? "Connecting…"
                  : "Connect & discover tools"}
              </button>
            </div>
          </form>
        ) : null}
      </details>
      {searchParams.get("oauthError") ? (
        <ErrorNotice error={searchParams.get("oauthError")} />
      ) : null}
      {error ? <ErrorNotice error={error} /> : null}
      {outcome?.status === "ready" ? (
        <section className="proposal integration-proposal">
          <div className="section-label">Connection proposal</div>
          <h2>{outcome.proposal.name}</h2>
          <p className="proposal-mode">{outcome.proposal.description}</p>
          <div className="connector-trust-line">
            Hosted by {outcome.proposal.operator} ·{" "}
            {outcome.proposal.trust === "registry-verified"
              ? "publisher verified by the official MCP Registry · tools discovered after sign-in"
              : outcome.proposal.trust === "openapi-verified"
                ? "official OpenAPI document verified · server, authentication, and operations derived by Springroll"
                : outcome.proposal.trust === "package-verified"
                  ? "package identity and source repository verified · tools discovered after launch"
                  : outcome.proposal.trust === "user-reviewed"
                    ? "agent-authored API guidance · operations and destination reviewed before connecting"
                    : "Springroll curated · tools discovered after sign-in"}
          </div>
          {outcome.proposal.registryName ? (
            <p className="integration-registry-id">
              {outcome.proposal.registryName} · v
              {outcome.proposal.registryVersion}
            </p>
          ) : null}
          {outcome.proposal.tools?.length ? (
            <ul
              className="connector-tool-list integration-proposal-tools"
              aria-label={`${outcome.proposal.name} proposed tools`}
            >
              {outcome.proposal.tools.map((tool) => (
                <li key={tool.name}>
                  <i
                    className={`risk-dot risk-${tool.effect}`}
                    aria-hidden="true"
                  />
                  {tool.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="proposal-mode">
              The current tool list and schemas will be read directly from the
              connector after authentication.
            </p>
          )}
          <div
            className="integration-variants"
            role="radiogroup"
            aria-label="Setup method"
          >
            {outcome.proposal.variants.map((variant) => (
              <label key={variant.id}>
                <input
                  checked={selectedVariant === variant.id}
                  name="integration-variant"
                  onChange={() => {
                    setSelectedVariant(variant.id);
                    setPrepared(undefined);
                    setApiKey("");
                    setCredentialFields({});
                  }}
                  type="radio"
                  value={variant.id}
                />
                <span>
                  <b>{variant.label}</b>
                  {variant.recommended ? <small>Recommended</small> : null}
                </span>
              </label>
            ))}
          </div>
          {activeVariant ? (
            <div className="integration-guidance">
              <p>{activeVariant.guidance.summary}</p>
              <ol>
                {activeVariant.guidance.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <a
                href={activeVariant.guidance.docsUrl}
                rel="noreferrer"
                target="_blank"
              >
                Provider setup guide
              </a>
            </div>
          ) : null}
          {outcome.proposal.sources?.length ? (
            <details className="integration-evidence">
              <summary>Official sources reviewed</summary>
              <ul>
                {outcome.proposal.sources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} rel="noreferrer" target="_blank">
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {prepared?.credentialKind === "api-key" ? (
            <form
              className="connection-form secure-credential-form"
              onSubmit={(event) => {
                event.preventDefault();
                void perform("credential", async () => {
                  await api.connectConnector(
                    prepared.id,
                    connectorCredentialInput(
                      prepared,
                      apiKey,
                      credentialFields,
                    ),
                  );
                  setApiKey("");
                  setCredentialFields({});
                  setPrepared(undefined);
                  setOutcome(undefined);
                  navigate("/connections");
                });
              }}
            >
              {prepared.credentialFields?.length ? (
                prepared.credentialFields.map((field) => (
                  <label key={field.name}>
                    {field.label}
                    <input
                      autoComplete={field.autoComplete}
                      onChange={(event) =>
                        setCredentialFields((current) => ({
                          ...current,
                          [field.name]: event.target.value,
                        }))
                      }
                      type={field.secret ? "password" : "text"}
                      value={credentialFields[field.name] ?? ""}
                    />
                  </label>
                ))
              ) : (
                <label>
                  {prepared.name} API key
                  <input
                    autoComplete="off"
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={
                      prepared.credentialPlaceholder ?? "Your API key"
                    }
                    type="password"
                    value={apiKey}
                  />
                </label>
              )}
              <div className="proposal-actions">
                <button
                  className="button"
                  disabled={
                    !connectorCredentialComplete(
                      prepared,
                      apiKey,
                      credentialFields,
                    ) || busy !== undefined
                  }
                  type="submit"
                >
                  {busy === "credential" ? "Verifying…" : "Verify & connect"}
                </button>
              </div>
            </form>
          ) : (
            <div className="proposal-actions">
              <button
                className="button"
                disabled={!activeVariant || busy !== undefined}
                onClick={() => void beginSetup()}
                type="button"
              >
                {busy === "setup"
                  ? "Opening…"
                  : (activeVariant?.label ?? "Continue")}
              </button>
            </div>
          )}
        </section>
      ) : outcome ? (
        <section className="proposal unavailable-proposal" role="status">
          <div className="section-label">
            {outcome.status === "unavailable"
              ? "Not ready yet"
              : "Not in the registry"}
          </div>
          <h2>{outcome.title}</h2>
          <p>{outcome.explanation}</p>
        </section>
      ) : null}
    </Page>
  );
}

function WebResearchProviderCard({
  provider,
  onChanged,
}: {
  readonly provider: import("../shared.ts").WebResearchSettingsDto["providers"][number];
  readonly onChanged: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const perform = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      setKey("");
      setOpen(false);
      await onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsProviderCard
      name={provider.name}
      logoName={provider.name}
      logoSvg={provider.logoSvg}
      label="Web research"
      description={provider.description}
      footer={
        <>
          {provider.credentialConfigured ? (
            <ConnectedRow
              detail="Keychain · this Mac"
              disabled={busy}
              onDisconnect={() =>
                void perform(() => api.disconnectWebProvider(provider.id))
              }
            />
          ) : (
            <div className="provider-foot">
              <span className="provider-get-key">
                {provider.id === "exa"
                  ? "Free search available"
                  : "API key required"}
              </span>
              <span className="connect-wrap">
                <button
                  className="quiet-button"
                  type="button"
                  aria-expanded={open}
                  disabled={busy}
                  onClick={() => setOpen(!open)}
                >
                  {provider.id === "exa" ? "Add personal key" : "Connect"}
                </button>
                <ConnectKeyPopover
                  open={open}
                  busy={busy}
                  error={error}
                  label={`${provider.name} API key`}
                  placeholder={`Your ${provider.name} key`}
                  keyCreationUrl={provider.keyCreationUrl}
                  value={key}
                  onKeyChange={setKey}
                  onClose={() => {
                    setOpen(false);
                    setKey("");
                  }}
                  onSubmit={() =>
                    void perform(() => api.connectWebProvider(provider.id, key))
                  }
                  submitDisabled={!key.trim() || busy}
                  submitLabel="Verify & save"
                />
              </span>
            </div>
          )}
          {error && !open ? (
            <p role="alert" className="connect-panel-error">
              {error}
            </p>
          ) : null}
        </>
      }
    />
  );
}

export function BuiltInCapabilitiesSettingsSection({
  configuration,
  view = "all",
}: {
  readonly configuration: ReturnType<typeof useLoad<ModelSettingsDto>>;
  readonly view?: "all" | "web" | "images";
}) {
  const connections = useLoad(api.connections);
  const research = useLoad(api.webResearch);
  useEffect(() => {
    if (configuration.value) void connections.reload();
  }, [configuration.value, connections.reload]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<unknown>();
  const updateImage = async (selection: ModelSelectionDto | null) => {
    setImageBusy(true);
    setImageError(undefined);
    try {
      await api.updateImageModel(selection);
      await Promise.all([configuration.reload(), connections.reload()]);
    } catch (caught) {
      setImageError(caught);
    } finally {
      setImageBusy(false);
    }
  };
  const imageGenerationCard = connections.value?.find(
    (card) => card.id === "image-generation",
  );
  const imageGenerationReady = imageGenerationCard?.status === "connected";
  const update = async (
    selection: Pick<
      import("../shared.ts").WebResearchSettingsDto,
      "searchProvider" | "readerProvider"
    >,
  ) => {
    setBusy(true);
    setError(undefined);
    try {
      await api.updateWebResearch(selection);
      await research.reload();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="model-settings-section"
      aria-label={
        view === "images"
          ? "Images"
          : view === "web"
            ? "Web researcher"
            : "Web researcher and images"
      }
    >
      <div className="provider-groups">
        <div
          className="provider-group capability-settings-group"
          id="web-research"
          hidden={view === "images"}
        >
          <div className="section-heading">
            <div className="section-label">Web researcher</div>
          </div>
          {research.loading ? <LoadingLine /> : null}
          {research.error ? (
            <ErrorNotice error={research.error} retry={research.reload} />
          ) : null}
          {error ? <ErrorNotice error={error} /> : null}
          {research.value ? (
            <>
              <div className="model-default-card settings-defaults-grid">
                <div className="settings-control-column">
                  <div className="model-role-row">
                    <div className="model-role-info">
                      <h2>Search provider</h2>
                    </div>
                    <SettingsPicker
                      label="Search provider"
                      disabled={busy}
                      value={research.value.searchProvider}
                      options={research.value.providers.map((provider) => ({
                        value: provider.id,
                        label:
                          provider.name +
                          (provider.connected ? "" : " — connect first"),
                        disabled: !provider.connected,
                      }))}
                      onChange={(value) => {
                        if (!research.value) return;
                        void update({
                          searchProvider:
                            value as import("../shared.ts").WebProviderId,
                          readerProvider: research.value.readerProvider,
                        });
                      }}
                    />
                  </div>
                </div>
                <div className="settings-control-column">
                  <div className="model-role-row">
                    <div className="model-role-info">
                      <h2>Page reader</h2>
                    </div>
                    <SettingsPicker
                      label="Page reader"
                      disabled={busy}
                      value={research.value.readerProvider}
                      options={[
                        { value: "direct", label: "Direct page reading" },
                        ...research.value.providers.map((provider) => ({
                          value: provider.id,
                          label:
                            (provider.id === "exa"
                              ? "Exa / direct fallback"
                              : provider.name) +
                            (provider.connected ? "" : " — connect first"),
                          disabled: !provider.connected,
                        })),
                      ]}
                      onChange={(value) => {
                        if (!research.value) return;
                        void update({
                          searchProvider: research.value.searchProvider,
                          readerProvider:
                            value as import("../shared.ts").WebReaderId,
                        });
                      }}
                    />
                  </div>
                </div>
                <details className="settings-about">
                  <summary>About these settings</summary>
                  <dl>
                    <dt>Search provider</dt>
                    <dd>Finds relevant sources on the public web.</dd>
                    <dt>Page reader</dt>
                    <dd>Retrieves page content after search discovery.</dd>
                  </dl>
                  <p>Connecting a key does not change your defaults.</p>
                </details>
              </div>
              <p className="connect-panel-note">
                Provider verification makes a small search request and may use
                credits. Search and page-reading charges are separate from model
                usage.
              </p>
              <div className="provider-grid">
                {research.value.providers.map((provider) => (
                  <WebResearchProviderCard
                    key={provider.id}
                    provider={provider}
                    onChanged={research.reload}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
        <section
          className="provider-group capability-settings-group"
          aria-labelledby="image-generation-heading"
          hidden={view === "web"}
        >
          <div className="section-heading">
            <div className="section-label" id="image-generation-heading">
              Images
            </div>
          </div>
          {configuration.loading ? <LoadingLine /> : null}
          {configuration.error ? (
            <ErrorNotice
              error={configuration.error}
              retry={configuration.reload}
            />
          ) : null}
          {imageError ? <ErrorNotice error={imageError} /> : null}
          {configuration.value ? (
            <div className="model-default-card settings-defaults-grid">
              <div className="settings-control-column">
                <div className="model-role-row">
                  <div className="model-role-info">
                    <h2>Default image model</h2>
                  </div>
                  <ModelPicker
                    align="end"
                    disabled={imageBusy}
                    inheritLabel="Automatic"
                    models={configuration.value.imageModels}
                    onChange={updateImage}
                    value={configuration.value.imageSelection}
                  />
                </div>
              </div>
              <details className="settings-about">
                <summary>About this setting</summary>
                <p>
                  Used unless a recipe chooses another image model. Choose
                  Automatic to let Springroll select an available image model.
                </p>
              </details>
            </div>
          ) : null}
          <div className="provider-grid">
            <SettingsProviderCard
              description="Creates images and saves them as local artifacts."
              footer={
                <div className="provider-foot">
                  <span
                    className={`status ${imageGenerationReady ? "status-good" : "status-quiet"}`}
                  >
                    {imageGenerationReady
                      ? "Image provider connected"
                      : "Needs an image provider"}
                  </span>
                </div>
              }
              label="Built-in"
              logoName="Image generation"
              logoSvg={imageGenerationCard?.logoSvg}
              name="Image Generation"
            />
          </div>
        </section>
      </div>
    </section>
  );
}

function SettingsPage() {
  const configuration = useLoad(api.models);
  const [params, setParams] = useSearchParams();
  const sections = [
    ["models", "Models & limits"],
    ["providers", "AI providers"],
    ["web", "Web researcher"],
    ["images", "Images"],
    ["appearance", "Appearance"],
    ["reset", "Data & reset"],
  ] as const;
  const section =
    sections.find(([id]) => id === params.get("section"))?.[0] ?? "models";
  const [themeId, setThemeId] = useState<ThemeId>(readThemePreference);
  const [textSize, setTextSize] = useState<TextSize>(readTextSizePreference);
  const [appearanceError, setAppearanceError] = useState<unknown>();
  const appearanceSave = useRef(Promise.resolve());
  const persistAppearance = (input: { theme?: string; textSize?: string }) => {
    appearanceSave.current = appearanceSave.current.then(async () => {
      try {
        await api.updateAppearance(input);
        setAppearanceError(undefined);
      } catch {
        setAppearanceError(
          new Error(
            "Appearance changed for this session, but could not be saved. Select it again to retry.",
          ),
        );
      }
    });
  };

  const selectTheme = (nextThemeId: ThemeId) => {
    saveThemePreference(nextThemeId);
    setThemeId(nextThemeId);
    persistAppearance({ theme: nextThemeId });
  };

  const selectTextSize = (nextSize: TextSize) => {
    saveTextSizePreference(nextSize);
    setTextSize(nextSize);
    persistAppearance({ textSize: nextSize });
  };

  return (
    <Page className="settings-page">
      <PageHeading title="Settings." />
      <p className="sr-only">
        Model assignments, AI providers, built-in capabilities, and local device
        preferences.
      </p>
      <div className="settings-layout">
        <nav className="settings-sections" aria-label="Settings sections">
          {sections.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={section === id ? "on" : ""}
              aria-pressed={section === id}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set("section", id);
                setParams(next);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          <div hidden={section !== "models" && section !== "providers"}>
            <ModelSettingsSection
              configuration={configuration}
              view={section === "providers" ? "providers" : "models"}
            />
          </div>
          <div hidden={section !== "web" && section !== "images"}>
            <BuiltInCapabilitiesSettingsSection
              configuration={configuration}
              view={section === "images" ? "images" : "web"}
            />
          </div>
          <div hidden={section !== "appearance"}>
            {appearanceError ? <ErrorNotice error={appearanceError} /> : null}
            <section className="theme-settings" aria-labelledby="theme-heading">
              <div className="section-heading">
                <div className="section-label" id="theme-heading">
                  Theme
                </div>
              </div>
              <ThemeSelector value={themeId} onChange={selectTheme} />
            </section>
            <section
              className="text-size-settings"
              aria-labelledby="text-size-heading"
            >
              <div className="section-heading">
                <div className="section-label" id="text-size-heading">
                  Text size
                </div>
              </div>
              <div
                className="size-options"
                role="radiogroup"
                aria-label="Text size"
              >
                {textSizes.map((size) => {
                  const selected = size.id === textSize;
                  return (
                    <label
                      className={`size-option ${selected ? "selected" : ""}`}
                      key={size.id}
                    >
                      <input
                        checked={selected}
                        name="text-size"
                        onChange={() => selectTextSize(size.id)}
                        type="radio"
                        value={size.id}
                      />
                      {size.name}
                    </label>
                  );
                })}
              </div>
            </section>
          </div>
          <div hidden={section !== "reset"}>
            <ResetSettings />
          </div>
        </div>
      </div>
    </Page>
  );
}

function ConnectedRow({
  detail,
  disabled,
  onDisconnect,
  actionLabel = "Disconnect",
}: {
  readonly detail: string;
  readonly disabled: boolean;
  readonly onDisconnect: () => void;
  readonly actionLabel?: string;
}) {
  return (
    <div className="connected-row">
      <span>
        <i aria-hidden="true" />
        {detail}
      </span>
      <button
        className="quiet-button"
        disabled={disabled}
        onClick={onDisconnect}
        type="button"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function Page({
  children,
  narrow = false,
  className,
}: {
  readonly children: ReactNode;
  readonly narrow?: boolean;
  readonly className?: string;
}) {
  return (
    <div
      className={["page", narrow ? "narrow" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

function FilterControl({
  label,
  on,
  open,
  setOpen,
  children,
}: {
  readonly label: string;
  readonly on: boolean;
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly children: ReactNode;
}) {
  return (
    <span className="filter-wrap">
      <button
        aria-expanded={open}
        aria-label={label}
        className="icon-button"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <SlidersIcon />
        {on ? <i className="filter-on-dot" /> : null}
      </button>
      {open ? (
        <>
          <button
            aria-label="Close filters"
            className="enable-backdrop"
            onClick={() => setOpen(false)}
            type="button"
          />
          <div className="filter-panel">{children}</div>
        </>
      ) : null}
    </span>
  );
}

function PageHeading({
  eyebrow,
  title,
  action,
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow ? <div className="section-label">{eyebrow}</div> : null}
        <h1 className="display-title">{title}</h1>
      </div>
      {action}
    </div>
  );
}

function ConversationEntryPage({
  entry,
  backTo,
}: {
  readonly entry: ChatSessionEntryDto;
  readonly backTo: string;
}) {
  const navigate = useNavigate();
  const started = useRef(false);
  const [error, setError] = useState<unknown>();

  const open = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    setError(undefined);
    try {
      const session = await api.enterChat(entry);
      navigate(`/chat/${encodeURIComponent(session.id)}`, { replace: true });
    } catch (caught) {
      setError(caught);
    }
  }, [entry, navigate]);

  useEffect(() => void open(), [open]);

  return (
    <Page narrow>
      <BackLink to={backTo}>Back</BackLink>
      <PageHeading title="Opening Springroll…" />
      {!error ? <LoadingLine /> : null}
      {error ? (
        <ErrorNotice
          error={error}
          retry={async () => {
            started.current = false;
            await open();
          }}
        />
      ) : null}
    </Page>
  );
}

function BackLink({
  to,
  children,
}: {
  readonly to: string;
  readonly children: ReactNode;
}) {
  return (
    <Link className="back-link" to={to}>
      ‹ {children}
    </Link>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  readonly title: string;
  readonly body: string;
  readonly action?: ReactNode;
}) {
  return (
    <section className="empty-state">
      <span className="empty-orbit" aria-hidden="true" />
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </section>
  );
}

function LoadingLine() {
  return <div className="loading-line" aria-label="Loading" role="status" />;
}

function TaskToolRepairNotice({
  busy,
  error,
  loading,
  onRepairAndRun,
  outcome,
}: {
  readonly busy: boolean;
  readonly error: unknown;
  readonly loading: boolean;
  readonly onRepairAndRun: () => Promise<void>;
  readonly outcome: TaskToolRepairProposalOutcomeDto | undefined;
}) {
  const copy =
    outcome?.status === "ready"
      ? taskToolRepairCopy(outcome)
      : outcome
        ? outcome.explanation
        : "Checking the connection's current tool contract…";
  return (
    <div className="tool-repair-notice" role="status">
      <div>
        <strong>
          {outcome?.status === "ready"
            ? "Recipe tool update required"
            : (outcome?.title ?? "Recipe tool changed")}
        </strong>
        <span>{copy}</span>
        {error ? <small>{errorMessage(error)}</small> : null}
      </div>
      {loading ? <LoadingLine /> : null}
      {outcome?.status === "ready" ? (
        <button
          className="button"
          disabled={busy}
          onClick={() => void onRepairAndRun()}
          type="button"
        >
          <PlayIcon size={13} />
          {busy ? "Updating…" : "Update tool & run"}
        </button>
      ) : null}
    </div>
  );
}

function taskToolRepairRequired(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    message.startsWith("Pinned tool schema changed:") ||
    message.startsWith("Pinned tool risk changed:") ||
    message.startsWith("Recipe tool review required:")
  );
}

function taskToolRepairCopy(
  outcome: Extract<TaskToolRepairProposalOutcomeDto, { status: "ready" }>,
): string {
  if (outcome.proposal.changes.length !== 1) {
    return `${outcome.proposal.changes.length} connected tools changed since this recipe was saved. Review their current contracts before running.`;
  }
  const change = outcome.proposal.changes[0];
  if (!change) return "A connected tool changed since this recipe was saved.";
  const riskUnchanged =
    change.previousRisk.effect === change.proposedRisk.effect &&
    change.previousRisk.openWorld === change.proposedRisk.openWorld &&
    change.previousRisk.idempotent === change.proposedRisk.idempotent;
  return riskUnchanged
    ? `${change.connectionName}'s ${change.toolName} input changed since this recipe was saved. Access remains ${change.proposedRisk.effect}.`
    : `${change.connectionName}'s ${change.toolName} behavior changed. Access is ${change.previousRisk.effect} → ${change.proposedRisk.effect}.`;
}

function ErrorNotice({
  error,
  retry,
  action,
}: {
  readonly error: unknown;
  readonly retry?: () => Promise<unknown>;
  readonly action?: ReactNode;
}) {
  return (
    <div className="error-notice" role="alert">
      <span>{error instanceof Error ? error.message : String(error)}</span>
      {retry ? (
        <button
          className="quiet-button"
          onClick={() => void retry()}
          type="button"
        >
          Try again
        </button>
      ) : (
        action
      )}
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function useRefreshOnReturn(reload: () => Promise<unknown>) {
  useEffect(() => {
    const refresh = () => {
      void reload();
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [reload]);
}

function useLoad<T>(load: () => Promise<T>) {
  const gate = useRef(new RequestGate());
  const latestLoad = useRef(load);
  latestLoad.current = load;
  const [value, setValue] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const current = gate.current.begin();
    const valid = () => current() && latestLoad.current === load;
    setLoading(true);
    setError(undefined);
    try {
      const result = await load();
      if (!valid()) return undefined;
      setValue(result);
      return result;
    } catch (caught) {
      if (valid()) setError(caught);
      return undefined;
    } finally {
      if (valid()) setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    void reload();
    const activeGate = gate.current;
    return () => activeGate.invalidate();
  }, [reload]);

  return { value, error, loading, reload, setError };
}

function trailDotClass(status: RunSummaryDto["status"]): string {
  return {
    claimed: "",
    running: "live",
    waiting_for_approval: "attention",
    succeeded: "ok",
    failed: "bad",
  }[status];
}

function formatNextRun(value: string): string {
  const next = new Date(value);
  const now = new Date();
  const time = formatTime(value);
  const dayOf = (date: Date) => date.toDateString();
  if (dayOf(next) === dayOf(now)) {
    return `${time} today`;
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (dayOf(next) === dayOf(tomorrow)) {
    return `${time} tomorrow`;
  }
  return `${time} ${next.toLocaleDateString(undefined, { weekday: "short" })}`;
}

function humanStatus(status: RunSummaryDto["status"]): string {
  return {
    claimed: "Waiting",
    running: "Running",
    waiting_for_approval: "Waiting for approval",
    succeeded: "Finished",
    failed: "Failed",
  }[status];
}

function runStatusClass(status: RunSummaryDto["status"]): string {
  return {
    claimed: "status-quiet",
    running: "status-running",
    waiting_for_approval: "status-needs-you",
    succeeded: "status-good",
    failed: "status-failed",
  }[status];
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatFullDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

function describeSchedule(schedule: string): string {
  const match = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(schedule);
  if (!match) {
    return schedule;
  }
  const minute = Number(match[1]);
  const hour = Number(match[2]);
  const at = new Date(2000, 0, 1, hour, minute);
  return `Daily at ${new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(at)}`;
}

import { ExecutionLimitPicker } from "./execution-limit-picker.tsx";
import { SettingsPicker } from "./settings-picker.tsx";
import { ThemeSelector } from "./theme-selector.tsx";
