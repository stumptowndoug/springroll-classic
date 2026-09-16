import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  type FileUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import {
  createContext,
  type FormEvent,
  type MutableRefObject,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  type AssistantMessageDto,
  type AssistantWorkflowDto,
  type ChatDetailDto,
  type ChatSessionContextDto,
  type ChatToolCallDto,
  type ChatTurnDto,
  type ConnectionCardDto,
  connectorProviderId,
  type IntegrationProposalOutcomeDto,
  type ModelSelectionDto,
  type RecipeConversationRunDto,
  type ToolApprovalDto,
} from "../shared.ts";
import { api } from "./api.ts";
import {
  ArtifactDocument,
  referencedArtifactIds,
} from "./artifact-document.tsx";
import {
  askBarComposerAction,
  imagePartsFromFiles,
  pendingAskBarSubmissionFromState,
  useAvailableChatModels,
} from "./ask-bar.tsx";
import { RequestGate, startSerialPolling } from "./async-refresh.ts";
import { BrandLogo } from "./brand-logo.tsx";
import {
  ASK_BAR_PLACEHOLDER,
  chatOriginBackLink,
  chatSessionTitle,
  chatSubjectHref,
  chatWelcome,
  initialChatDraft,
} from "./chat-session-entry.ts";
import { chatStatusInfo } from "./chat-status.ts";
import {
  type ChatToolValidationIssue,
  chatToolProgressLabel,
  chatToolResultSummary,
  connectorProposalValidationIssuesFromToolPart,
  describeChatToolPart,
  savedRecipeFromToolPart,
  visibleConnectionResearchOutcomeFromToolPart,
} from "./chat-tool-presentation.ts";
import { useConfirmationDialog } from "./confirmation-dialog.tsx";
import {
  connectorCredentialComplete,
  connectorCredentialInput,
} from "./connector-credential-input.ts";
import { EndingActions } from "./copy-button.tsx";
import { CloseIcon, PaperclipIcon } from "./icons.tsx";
import { defaultModelLabel, ModelPicker } from "./model-picker.tsx";
import { modelSetupStage } from "./model-readiness.ts";
import { recipeConversationTimeline } from "./recipe-conversation.ts";
import { RollmarkDocument } from "./rollmark-document.tsx";
import { RunArtifacts } from "./run-artifacts.tsx";
import { RunMarkdown } from "./run-markdown.tsx";
import { toolApprovalDetails } from "./tool-approval-details.ts";
import {
  chatTurnUsage,
  EMPTY_TURN_ACTIVITY,
  type TurnActivity,
  type TurnStepInput,
  turnActivity,
} from "./turn-activity.ts";
import { StopTurnButton, TurnWork } from "./turn-meter.tsx";

const ChatSurfaceContext = createContext<{
  readonly sessionId: string;
  readonly returnTo: string;
} | null>(null);

function useChatSurface() {
  const surface = useContext(ChatSurfaceContext);
  if (!surface) {
    throw new Error("Chat surface is missing");
  }
  return surface;
}

export function ChatDetailPage() {
  const { confirm, confirmation } = useConfirmationDialog();
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ChatDetailDto>();
  const [recipeRuns, setRecipeRuns] = useState<
    readonly RecipeConversationRunDto[]
  >([]);
  const [error, setError] = useState<unknown>();
  const [subjectLabel, setSubjectLabel] = useState<string>();
  const [turnWorking, setTurnWorking] = useState(false);
  const initialPending = pendingAskBarSubmissionFromState(location.state);
  const pendingReplyRef = useRef<string | undefined>(initialPending.text);
  const pendingFilesRef = useRef<readonly FileUIPart[]>(initialPending.files);
  const submittedEntrySessionRef = useRef<string | undefined>(undefined);
  if (
    id &&
    (initialPending.text !== undefined || initialPending.files.length > 0)
  ) {
    submittedEntrySessionRef.current = id;
  }

  const requestGate = useRef(new RequestGate());
  const fullLoads = useRef(0);
  const loadedDetail = useRef(detail);
  loadedDetail.current = detail;
  const routeId = useRef(id);
  routeId.current = id;
  const load = useCallback(
    async (progressOnly = false) => {
      if (!id) return;
      if (
        progressOnly &&
        (fullLoads.current > 0 || loadedDetail.current?.session.id !== id)
      )
        return;
      const fullLoad = !progressOnly;
      if (fullLoad) fullLoads.current += 1;
      const current = requestGate.current.begin();
      const valid = () => current() && routeId.current === id;
      try {
        setError(undefined);
        let next = progressOnly
          ? await api.chatProgress(id)
          : await api.chat(id);
        if (!valid()) return;
        // A terminal transition needs one full sync to recover final messages.
        if (progressOnly && !next.session.activeTurnId) {
          next = await api.chat(id);
          progressOnly = false;
          if (!valid()) return;
        }
        const taskId = next.session.context?.subjects?.find(
          (subject) => subject.kind === "task",
        )?.id;
        const runs =
          !progressOnly && taskId
            ? await api.taskRuns(taskId).catch(() => [])
            : [];
        if (!valid()) return;
        setDetail((previous) =>
          progressOnly && previous?.session.id === id
            ? {
                ...next,
                messages: previous.messages,
                turns: [
                  ...previous.turns.filter(
                    (turn) =>
                      !next.turns.some((update) => update.id === turn.id),
                  ),
                  ...next.turns,
                ],
              }
            : next,
        );
        if (!progressOnly) setRecipeRuns(runs);
      } catch (caught) {
        if (valid()) setError(caught);
      } finally {
        if (fullLoad) fullLoads.current -= 1;
      }
    },
    [id],
  );
  useEffect(() => {
    void load();
    const gate = requestGate.current;
    return () => gate.invalidate();
  }, [load]);
  const subject = detail?.session.context?.subjects?.[0];
  useEffect(() => {
    if (
      !detail ||
      (!pendingAskBarSubmissionFromState(location.state).text &&
        pendingAskBarSubmissionFromState(location.state).files.length === 0)
    )
      return;
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: {},
    });
  }, [detail, location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (!subject) {
      setSubjectLabel(undefined);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const label =
          subject.kind === "task"
            ? (await api.task(subject.id)).name
            : subject.kind === "connection"
              ? (await api.connection(subject.id)).name
              : (await api.run(subject.id)).taskName;
        if (!cancelled) setSubjectLabel(label);
      } catch {
        if (!cancelled) setSubjectLabel(undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subject]);
  const permanentlyDelete = async () => {
    if (!id) return;
    if (
      !(await confirm(
        "Permanently delete this conversation and its usage history? This cannot be undone.",
      ))
    )
      return;
    try {
      setError(undefined);
      await api.deleteChat(id);
      navigate("/inbox", { replace: true });
    } catch (caught) {
      setError(caught);
    }
  };

  if (!id) return null;
  if (!detail && !error) {
    return (
      <section className="page">
        <div className="loading-line" role="status" />
      </section>
    );
  }
  const initialPrompt = initialChatDraft({
    enteredWithSubmission: submittedEntrySessionRef.current === id,
    messageCount: detail?.messages.length ?? 0,
    suggestedPrompt: detail?.session.context?.suggestedPrompt,
  });

  const back =
    subject && subjectLabel
      ? { to: chatSubjectHref(subject.kind, subject.id), label: subjectLabel }
      : chatOriginBackLink(detail?.session.context?.origin);
  const title =
    detail?.session.title ||
    pendingReplyRef.current ||
    (detail ? chatSessionTitle(detail.session) : "New conversation");

  const isEmptyCreation = Boolean(
    detail &&
      detail.messages.length === 0 &&
      recipeRuns.length === 0 &&
      !turnWorking &&
      !detail.session.activeTurnId &&
      (detail.session.context?.intent === "task.create" ||
        detail.session.context?.intent === "connection.create"),
  );
  const isWorking = turnWorking || Boolean(detail?.session.activeTurnId);
  const statusInfo = chatStatusInfo(detail, isWorking);

  return (
    <section className="page chat-detail-page">
      {confirmation}
      <header className="thread-head">
        <div className="thread-head-nav">
          <Link className="back-link" to={back.to}>
            ‹ {back.label}
          </Link>
        </div>
        <div className="thread-head-title-row">
          <h1 className="chat-thread-title">{title}</h1>
        </div>
        {!isEmptyCreation ? (
          <p className="thread-subtitle">
            {subject ? (
              <Link
                className="thread-chip"
                to={chatSubjectHref(subject.kind, subject.id)}
                title={`View ${subject.kind}`}
              >
                <span className="thread-chip-dot" aria-hidden="true" />
                <span className="thread-chip-kind">{subject.kind}:</span>
                <span className="thread-chip-name">
                  {subjectLabel ?? subject.kind}
                </span>
              </Link>
            ) : (
              <span>Springroll conversation</span>
            )}
            {detail?.session.createdAt ? (
              <span>{formatFullDate(detail.session.createdAt)}</span>
            ) : null}
            <span className={`status ${statusInfo.className}`}>
              {statusInfo.label}
            </span>
          </p>
        ) : null}
      </header>
      {error ? <ChatError error={error} retry={load} /> : null}
      {detail ? (
        <ChatConversation
          detail={detail}
          onDelete={permanentlyDelete}
          onWorkingChange={setTurnWorking}
          pendingReplyRef={pendingReplyRef}
          pendingFilesRef={pendingFilesRef}
          recipeRuns={recipeRuns}
          returnTo={`/chat/${encodeURIComponent(id)}`}
          {...(initialPrompt ? { initialDraft: initialPrompt } : undefined)}
          onReload={load}
        />
      ) : null}
    </section>
  );
}

function resizeThreadComposer(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "0px";
  element.style.height = `${Math.min(element.scrollHeight, 176)}px`;
}

export function ChatConversation({
  detail,
  initialDraft,
  onDelete,
  onReload,
  onWorkingChange,
  pendingReplyRef,
  pendingFilesRef,
  recipeRuns,
  returnTo,
}: {
  readonly detail: ChatDetailDto;
  readonly initialDraft?: string | undefined;
  readonly onDelete?: (() => Promise<void> | void) | undefined;
  readonly onReload: (progressOnly?: boolean) => Promise<void>;
  readonly onWorkingChange?: (working: boolean) => void;
  readonly pendingReplyRef?: MutableRefObject<string | undefined> | undefined;
  readonly pendingFilesRef?:
    | MutableRefObject<readonly FileUIPart[]>
    | undefined;
  readonly recipeRuns: readonly RecipeConversationRunDto[];
  readonly returnTo: string;
}) {
  const availableModels = useAvailableChatModels();
  const [syncError, setSyncError] = useState<unknown>();
  const [composerError, setComposerError] = useState<unknown>();
  const [draft, setDraft] = useState(initialDraft ?? "");
  const [files, setFiles] = useState<readonly FileUIPart[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const serverMessageIdRef = useRef(detail.messages.at(-1)?.id);
  const sessionId = detail.session.id;
  const [searchParams] = useSearchParams();
  const transport = useMemo(
    () =>
      new DefaultChatTransport<AssistantMessageDto>({
        api: `/api/chats/${encodeURIComponent(sessionId)}/messages`,
        prepareSendMessagesRequest: ({ messages, trigger }) => {
          if (trigger !== "submit-message") {
            throw new Error("Regeneration is not available yet");
          }
          const message = messages.at(-1);
          if (message?.role === "user") {
            return { body: { message } };
          }
          const approvals = message
            ? approvalDecisionsFromMessage(message)
            : [];
          if (approvals.length === 0) {
            throw new Error("A new user message or approval is required");
          }
          return { body: { approvals } };
        },
      }),
    [sessionId],
  );
  const {
    messages,
    addToolApprovalResponse,
    sendMessage,
    setMessages,
    status,
    error,
    clearError,
    stop,
  } = useChat<AssistantMessageDto>({
    id: sessionId,
    messages: [...detail.messages],
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: () => void syncFromServer(),
    onError: () => void syncFromServer(),
  });
  const conversationItemCount = messages.length + recipeRuns.length;
  const welcome = chatWelcome(detail.session.context?.intent);
  const isEmptyCreation =
    conversationItemCount === 0 &&
    (detail.session.context?.intent === "task.create" ||
      detail.session.context?.intent === "connection.create");

  async function syncFromServer() {
    try {
      const next = await api.chat(sessionId);
      serverMessageIdRef.current = next.messages.at(-1)?.id;
      setMessages([...next.messages]);
      if (!next.session.activeTurnId) clearError();
      await onReload();
    } catch (caught) {
      setSyncError(caught);
    }
  }

  useEffect(() => {
    const nextMessageId = detail.messages.at(-1)?.id;
    if (
      (status === "ready" || status === "error") &&
      nextMessageId !== serverMessageIdRef.current
    ) {
      serverMessageIdRef.current = nextMessageId;
      setMessages([...detail.messages]);
      if (status === "error") clearError();
    }
  }, [clearError, detail.messages, setMessages, status]);
  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior:
        conversationItemCount > 0 && status !== "error" ? "smooth" : "auto",
      block: "end",
    });
  }, [conversationItemCount, status]);
  useEffect(() => {
    if (!initialDraft) return;
    setDraft(initialDraft);
    requestAnimationFrame(() => {
      resizeThreadComposer(composerRef.current);
      composerRef.current?.focus();
    });
  }, [initialDraft]);
  const busy = status === "submitted" || status === "streaming";
  const working = busy || Boolean(detail.session.activeTurnId);
  useEffect(() => {
    onWorkingChange?.(working);
  }, [onWorkingChange, working]);
  useEffect(() => {
    if (!working) return;
    return startSerialPolling(
      () => onReload(true),
      () => !document.hidden,
    );
  }, [working, onReload]);
  const activeTurn = detail.turns.find(
    (turn) => turn.id === detail.session.activeTurnId,
  );
  const pendingUsage = chatTurnUsage(activeTurn);
  const repairingConnection =
    !busy &&
    detail.workflows.some(
      (workflow) =>
        workflow.kind === "connection_setup" &&
        workflow.status === "waiting_for_user" &&
        isUnknownRecord(workflow.outcome?.connectionTest) &&
        workflow.outcome.connectionTest.status === "failed",
    );
  const archived = detail.session.status === "archived";
  useEffect(() => {
    const text = pendingReplyRef?.current?.trim() ?? "";
    const files = pendingFilesRef?.current ?? [];
    if (
      (!text && files.length === 0) ||
      archived ||
      modelSetupStage(availableModels) !== "ready" ||
      status !== "ready" ||
      detail.session.activeTurnId
    ) {
      return;
    }
    if (pendingReplyRef) pendingReplyRef.current = undefined;
    if (pendingFilesRef) pendingFilesRef.current = [];
    setSyncError(undefined);
    clearError();
    void sendMessage({
      ...(text ? { text } : undefined),
      ...(files.length > 0 ? { files: [...files] } : undefined),
    });
  }, [
    archived,
    availableModels,
    clearError,
    detail.session.activeTurnId,
    pendingReplyRef,
    pendingFilesRef,
    sendMessage,
    status,
  ]);
  const latestTurn = detail.turns.at(-1);
  const waitingForApproval = latestTurn?.status === "waiting_for_user";
  const turnById = new Map(
    detail.turns.map((turn) => [turn.id, turn] as const),
  );
  const timeline = recipeConversationTimeline(messages, recipeRuns);
  const lastItem = timeline.at(-1);
  const endingMessageId =
    onDelete &&
    !working &&
    lastItem?.kind === "message" &&
    lastItem.message.role === "assistant"
      ? lastItem.id
      : undefined;
  const composerDisabled =
    archived ||
    (status !== "ready" && status !== "error") ||
    Boolean(detail.session.activeTurnId) ||
    modelSetupStage(availableModels) !== "ready";

  const submitComposer = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if ((!text && files.length === 0) || composerDisabled) return;
    setComposerError(undefined);
    setSyncError(undefined);
    clearError();
    // sendMessage resolves after the streamed reply, not when the user sends.
    // Clear now so submitted text does not linger throughout the run.
    setDraft("");
    setFiles([]);
    requestAnimationFrame(() => resizeThreadComposer(composerRef.current));
    try {
      await sendMessage({
        ...(text ? { text } : undefined),
        ...(files.length > 0 ? { files: [...files] } : undefined),
      });
    } catch (caught) {
      setComposerError(caught);
    }
  };

  const addFiles = async (incoming: readonly File[]) => {
    setComposerError(undefined);
    try {
      setFiles(await imagePartsFromFiles(incoming, files));
      composerRef.current?.focus();
    } catch (caught) {
      setComposerError(caught);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onComposerPaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = [...event.clipboardData.files].filter((file) =>
      file.type.startsWith("image/"),
    );
    if (pasted.length === 0) return;
    event.preventDefault();
    void addFiles(pasted);
  };

  const onComposerKeyDown = (
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
  ) => {
    const action = askBarComposerAction(event.key, event.shiftKey);
    if (action === "blur") {
      event.currentTarget.blur();
      return;
    }
    if (action === "submit") {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const retryLatestTurn = async () => {
    if (
      archived ||
      status !== "ready" ||
      detail.session.activeTurnId ||
      modelSetupStage(availableModels) !== "ready"
    )
      return;
    const original = messages.findLast(
      (message) =>
        message.role === "user" && message.metadata?.turnId === latestTurn?.id,
    );
    const text = original ? messageText(original) : undefined;
    setSyncError(undefined);
    clearError();
    if (text) {
      await sendMessage({ text });
      return;
    }
    const connectionWorkflow = detail.workflows.findLast(
      (workflow) =>
        workflow.kind === "connection_setup" &&
        (workflow.status === "completed" ||
          (workflow.status === "waiting_for_user" &&
            isUnknownRecord(workflow.outcome?.connectionTest) &&
            workflow.outcome.connectionTest.status === "failed") ||
          (workflow.status === "cancelled" &&
            workflow.outcome?.state === "declined")),
    );
    if (!connectionWorkflow) return;
    try {
      await api.continueConnectionWorkflow(sessionId, connectionWorkflow.id);
      await syncFromServer();
    } catch (caught) {
      setSyncError(caught);
    }
  };

  const editMessage = (message: AssistantMessageDto) => {
    const text = messageText(message);
    if (!text || archived || busy || detail.session.activeTurnId) return;
    setDraft(text);
    requestAnimationFrame(() => {
      resizeThreadComposer(composerRef.current);
      composerRef.current?.focus();
    });
  };

  const stopActiveTurn = async () => {
    if (!busy && !detail.session.activeTurnId) return;
    setSyncError(undefined);
    try {
      await api.cancelChat(sessionId);
      await stop();
      await syncFromServer();
    } catch (caught) {
      setSyncError(caught);
    }
  };
  const stopActiveTurnRef = useRef(stopActiveTurn);
  stopActiveTurnRef.current = stopActiveTurn;

  const setModel = useCallback(
    async (selection: ModelSelectionDto | null) => {
      await api.updateChat(sessionId, { modelSelection: selection });
      await onReload();
    },
    [onReload, sessionId],
  );
  const pickerModels = files.length
    ? (availableModels?.recipeModels.filter((model) =>
        model.inputModalities.includes("image"),
      ) ?? [])
    : (availableModels?.recipeModels ?? []);

  return (
    <ChatSurfaceContext.Provider value={{ sessionId, returnTo }}>
      <div className={`chat-shell${timeline.length === 0 ? " empty" : ""}`}>
        {searchParams.get("oauthError") ? (
          <ChatError error={searchParams.get("oauthError")} />
        ) : null}
        {searchParams.get("oauth") === "connected" ? (
          <div className="chat-oauth-return" role="status">
            Sign-in completed. Springroll connected and discovered the live
            tools.
          </div>
        ) : null}
        <div className="chat-transcript" aria-live="polite">
          {timeline.length === 0 ? (
            <div className="chat-welcome">
              <BrandLogo className="chat-brand-mark" />
              <h2>{welcome.heading}</h2>
              <p>{welcome.description}</p>
            </div>
          ) : null}
          {timeline.map((item) =>
            item.kind === "run" ? (
              <RecipeRunTurn key={`run:${item.id}`} run={item.run} />
            ) : (
              <ChatMessage
                approvals={detail.approvals.filter(
                  (approval) => approval.messageId === item.message.id,
                )}
                artifacts={detail.artifacts.filter(
                  (artifact) =>
                    artifact.turnId === item.message.metadata?.turnId,
                )}
                context={detail.session.context}
                interactive={
                  !archived &&
                  !busy &&
                  (!detail.session.activeTurnId || waitingForApproval)
                }
                key={`message:${item.id}`}
                message={item.message}
                pending={
                  item.message.id === messages.at(-1)?.id &&
                  (busy ||
                    (!waitingForApproval &&
                      Boolean(detail.session.activeTurnId) &&
                      item.message.metadata?.turnId ===
                        detail.session.activeTurnId))
                }
                workflows={detail.workflows.filter(
                  (workflow) => workflow.sourceMessageId === item.message.id,
                )}
                onReload={syncFromServer}
                onApproval={(id, approved) =>
                  addToolApprovalResponse({
                    id,
                    approved,
                    ...(!approved ? { reason: "Denied by user" } : undefined),
                  })
                }
                {...(item.message.role === "assistant" &&
                item.message.metadata?.turnId
                  ? { turn: turnById.get(item.message.metadata.turnId) }
                  : undefined)}
                {...(item.message.role === "user" &&
                !archived &&
                !busy &&
                !detail.session.activeTurnId
                  ? { onEdit: () => editMessage(item.message) }
                  : undefined)}
                {...(onDelete && item.id === endingMessageId
                  ? { onDelete }
                  : undefined)}
              />
            ),
          )}
          {error || syncError ? <ChatError error={error ?? syncError} /> : null}
          {archived ? (
            <div className="chat-turn-notice">
              <div>
                <strong>This conversation is archived.</strong>
                <span>Restore it to continue chatting.</span>
              </div>
            </div>
          ) : null}
          {(latestTurn?.status === "failed" ||
            latestTurn?.status === "cancelled") &&
          !busy ? (
            <div className="chat-turn-notice" role="alert">
              <div>
                <strong>
                  {latestTurn.status === "cancelled"
                    ? "The previous response was stopped."
                    : "The previous response did not finish."}
                </strong>
                <span>
                  {latestTurn.status === "cancelled"
                    ? "You can retry the same request whenever you're ready."
                    : latestTurn.error
                      ? `${latestTurn.error} Retry starts a clean model continuation without the failed tool trace.`
                      : "Springroll could not complete it. Retry starts a clean model continuation."}
                </span>
              </div>
              <button
                className="quiet-button"
                disabled={archived || Boolean(detail.session.activeTurnId)}
                onClick={() => void retryLatestTurn()}
                type="button"
              >
                Try again
              </button>
            </div>
          ) : null}
          {onDelete && !endingMessageId && !isEmptyCreation ? (
            <div className="thread-footer-actions">
              <EndingActions
                deleteDisabled={Boolean(detail.session.activeTurnId)}
                deleteLabel="Delete conversation"
                onDelete={() => void onDelete()}
              />
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
        <div className="chat-composer-dock">
          {working &&
          !waitingForApproval &&
          (!busy || messages.at(-1)?.role !== "assistant") ? (
            <div
              role="status"
              aria-live="polite"
              className="chat-background-activity"
            >
              {!busy ? (
                <p>
                  {repairingConnection
                    ? "Springroll is diagnosing the failed connection test and checking how to fix it."
                    : "Springroll is continuing your request in the background."}{" "}
                  You can stop this response to send a follow-up.
                </p>
              ) : null}
              {!busy ? (
                <StopTurnButton
                  onStop={() => void stopActiveTurnRef.current()}
                />
              ) : null}
              <TurnWork
                activity={EMPTY_TURN_ACTIVITY}
                live
                label={
                  busy
                    ? "Thinking"
                    : repairingConnection
                      ? "Diagnosing connection test"
                      : "Continuing in the background"
                }
                {...(pendingUsage ? { usage: pendingUsage } : undefined)}
                {...(activeTurn?.startedAt
                  ? { startedAt: activeTurn.startedAt }
                  : undefined)}
              />
            </div>
          ) : null}
          {modelSetupStage(availableModels) !== "ready" ? (
            <p>
              Connect a model to get started.{" "}
              <Link
                to={
                  modelSetupStage(availableModels) === "provider"
                    ? "/settings?section=providers"
                    : "/settings?section=models"
                }
              >
                Open Settings
              </Link>
            </p>
          ) : null}
          {working && !busy ? null : (
            <form
              className="chat-composer"
              onSubmit={(event) => void submitComposer(event)}
            >
              {files.length > 0 ? (
                <section
                  className="chat-composer-attachments"
                  aria-label="Attached images"
                >
                  {files.map((file, index) => (
                    <figure className="chat-composer-attachment" key={file.url}>
                      <img
                        alt={file.filename ?? `Attachment ${index + 1}`}
                        src={file.url}
                      />
                      <button
                        aria-label={`Remove ${file.filename ?? `attachment ${index + 1}`}`}
                        onClick={() =>
                          setFiles((current) =>
                            current.filter(
                              (_, candidate) => candidate !== index,
                            ),
                          )
                        }
                        type="button"
                      >
                        <CloseIcon size={12} />
                      </button>
                    </figure>
                  ))}
                </section>
              ) : null}
              <textarea
                aria-label="Message Springroll"
                disabled={composerDisabled}
                maxLength={8_000}
                onChange={(event) => {
                  setDraft(event.target.value);
                  resizeThreadComposer(event.currentTarget);
                }}
                onKeyDown={onComposerKeyDown}
                onPaste={onComposerPaste}
                placeholder={
                  archived
                    ? "Restore this conversation to continue"
                    : isEmptyCreation
                      ? ""
                      : ASK_BAR_PLACEHOLDER
                }
                ref={composerRef}
                rows={1}
                value={draft}
              />
              <div className="chat-composer-foot">
                <div className="chat-composer-tools">
                  <ModelPicker
                    compact
                    disabled={composerDisabled}
                    inheritLabel={defaultModelLabel(availableModels)}
                    models={pickerModels}
                    onChange={(selection) => {
                      setComposerError(undefined);
                      void setModel(selection).catch(setComposerError);
                    }}
                    openUp
                    value={detail.session.modelOverride}
                    googleDataProtected={detail.googleDataProtected}
                    inheritedValue={availableModels?.defaultSelection}
                  />
                  <input
                    accept="image/png,image/jpeg,image/webp"
                    className="chat-composer-file-input"
                    multiple
                    onChange={(event) =>
                      void addFiles(
                        event.currentTarget.files
                          ? [...event.currentTarget.files]
                          : [],
                      )
                    }
                    ref={fileInputRef}
                    type="file"
                  />
                  <button
                    aria-label="Attach images"
                    className="chat-composer-attach"
                    disabled={composerDisabled || files.length >= 4}
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach images"
                    type="button"
                  >
                    <PaperclipIcon />
                  </button>
                </div>
                <span>Enter to send · Shift+Enter for a new line</span>
                {working ? (
                  <StopTurnButton
                    iconOnly
                    onStop={() => void stopActiveTurnRef.current()}
                  />
                ) : (
                  <button
                    className="button"
                    disabled={
                      composerDisabled ||
                      (draft.trim().length === 0 && files.length === 0)
                    }
                    type="submit"
                  >
                    Send
                  </button>
                )}
              </div>
            </form>
          )}
          {composerError ? <ChatError error={composerError} /> : null}
        </div>
      </div>
    </ChatSurfaceContext.Provider>
  );
}

function ChatMessage({
  approvals,
  artifacts,
  context,
  message,
  interactive,
  onEdit,
  pending,
  turn,
  workflows,
  onApproval,
  onReload,
  onDelete,
}: {
  readonly approvals: readonly ToolApprovalDto[];
  readonly artifacts: ChatDetailDto["artifacts"];
  readonly message: AssistantMessageDto;
  readonly context: ChatSessionContextDto | null;
  readonly interactive: boolean;
  readonly onEdit?: () => void;
  readonly pending: boolean;
  readonly turn?: ChatTurnDto | undefined;
  readonly workflows: readonly AssistantWorkflowDto[];
  readonly onReload: () => Promise<void>;
  readonly onDelete?: () => Promise<void> | void;
  readonly onApproval: (
    id: string,
    approved: boolean,
  ) => void | PromiseLike<void>;
}) {
  const assistant = message.role === "assistant";
  const user = message.role === "user";
  const text = messageText(message);
  const createdAt = message.metadata?.createdAt ?? turn?.startedAt ?? undefined;
  const timeLabel = formatMessageTime(createdAt);
  const activity: TurnActivity<ChatWorkStep> = assistant
    ? turnActivity(workStepsFromMessage(message, turn?.toolCalls ?? []))
    : EMPTY_TURN_ACTIVITY;
  const usage = chatTurnUsage(turn);
  const model = assistantMessageModel(message);
  // Tool proposals arrive before the final explanation; present the action last.
  const displayParts = [...message.parts].sort(
    (left, right) =>
      Number(
        Boolean(
          visibleConnectionResearchOutcomeFromToolPart(
            left,
            message.parts,
            pending,
          ),
        ),
      ) -
      Number(
        Boolean(
          visibleConnectionResearchOutcomeFromToolPart(
            right,
            message.parts,
            pending,
          ),
        ),
      ),
  );
  const referencedArtifacts = new Set(
    message.parts.flatMap((part) =>
      part.type === "text" ? [...referencedArtifactIds(part.text)] : [],
    ),
  );
  const visibleArtifacts = artifacts.filter((artifact) =>
    user
      ? artifact.payload?.origin === "attachment"
      : artifact.payload?.origin !== "attachment",
  );
  const unreferencedArtifacts = visibleArtifacts.filter(
    (artifact) => !referencedArtifacts.has(artifact.id),
  );
  return (
    <article className={`chat-message ${message.role}`}>
      {user ? (
        <div className="chat-message-role">
          <div className="chat-message-author">
            <span className="chat-message-name">You</span>
            {timeLabel ? (
              <time className="chat-message-time" dateTime={createdAt}>
                {timeLabel}
              </time>
            ) : null}
          </div>
          {onEdit ? (
            <button
              className="chat-message-edit-btn"
              onClick={onEdit}
              type="button"
            >
              Edit
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="chat-message-content">
        {displayParts.map((part) => (
          <ChatPart
            approvals={approvals}
            artifacts={artifacts}
            key={`${message.id}:${chatPartKey(part)}`}
            part={part}
            role={message.role}
            interactive={interactive}
            context={context}
            messageParts={message.parts}
            pending={pending}
            workflows={workflows}
            onReload={onReload}
            onApproval={onApproval}
          />
        ))}
        {user ? (
          <RunArtifacts
            ariaLabel="Attached images"
            artifacts={unreferencedArtifacts}
          />
        ) : (
          <RunArtifacts artifacts={unreferencedArtifacts} />
        )}
      </div>
      {assistant && pending ? (
        <TurnWork
          activity={activity}
          live
          label={messageProgressLabel(message)}
          {...(usage ? { usage } : undefined)}
          {...(turn?.startedAt ? { startedAt: turn.startedAt } : undefined)}
        />
      ) : assistant ? (
        <TurnWork
          activity={activity}
          actions={
            <EndingActions
              copy={text}
              {...(onDelete
                ? {
                    deleteLabel: "Delete conversation",
                    onDelete: () => void onDelete(),
                  }
                : undefined)}
            />
          }
          {...(usage ? { usage } : undefined)}
          {...(model ? { model } : undefined)}
        />
      ) : null}
    </article>
  );
}

interface ChatWorkStep extends TurnStepInput {
  readonly issues?: readonly ChatToolValidationIssue[];
}

function RecipeRunTurn({ run }: { readonly run: RecipeConversationRunDto }) {
  const report =
    run.report ??
    (run.status === "waiting_for_approval"
      ? "This run is waiting for approval before it can continue."
      : run.status === "claimed" || run.status === "running"
        ? "This run is still working."
        : "This run did not produce a report.");
  const markdown = run.report ?? report;
  return (
    <article className="chat-message assistant recipe-run-turn">
      <div className="chat-message-role">
        <span>Springroll run</span>
      </div>
      <div className="chat-message-content">
        <div className="letter-body">
          {run.report ? (
            <RollmarkDocument content={run.report} />
          ) : (
            <RunMarkdown content={report} />
          )}
        </div>
        <Link className="chat-source" to={`/inbox/${run.id}`}>
          Open run details
        </Link>
      </div>
      <div className="chat-message-footer">
        <small className="chat-message-meta">
          {recipeRunStatus(run.status)} · {formatChatDate(run.scheduledTime)}
        </small>
        <EndingActions copy={markdown} />
      </div>
    </article>
  );
}

function recipeRunStatus(status: RecipeConversationRunDto["status"]): string {
  switch (status) {
    case "claimed":
      return "Queued";
    case "running":
      return "Running";
    case "waiting_for_approval":
      return "Waiting for approval";
    case "succeeded":
      return "Completed";
    case "failed":
      return "Failed";
  }
}

function parseDateSafe(
  value?: string | Date | null | undefined,
): Date | undefined {
  if (!value) return undefined;
  try {
    const date = typeof value === "string" ? new Date(value) : value;
    return Number.isNaN(date.getTime()) ? undefined : date;
  } catch {
    return undefined;
  }
}

function formatFullDate(value?: string | Date | null | undefined): string {
  const date = parseDateSafe(value);
  if (!date) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "full",
      timeStyle: "short",
    }).format(date);
  } catch {
    return "";
  }
}

function formatChatDate(value?: string | Date | null | undefined): string {
  const date = parseDateSafe(value);
  if (!date) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return "";
  }
}

function formatMessageTime(
  value?: string | Date | null | undefined,
): string | undefined {
  if (!value) return undefined;
  try {
    const date = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return undefined;
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return undefined;
  }
}

function ChatPart({
  approvals,
  artifacts,
  context,
  part,
  role,
  interactive,
  messageParts,
  workflows,
  pending,
  onApproval,
  onReload,
}: {
  readonly approvals: readonly ToolApprovalDto[];
  readonly artifacts: ChatDetailDto["artifacts"];
  readonly part: AssistantMessageDto["parts"][number];
  readonly context: ChatSessionContextDto | null;
  readonly role: AssistantMessageDto["role"];
  readonly interactive: boolean;
  readonly messageParts: AssistantMessageDto["parts"];
  readonly pending: boolean;
  readonly workflows: readonly AssistantWorkflowDto[];
  readonly onReload: () => Promise<void>;
  readonly onApproval: (
    id: string,
    approved: boolean,
  ) => void | PromiseLike<void>;
}) {
  if (part.type === "text") {
    if (role !== "assistant") return <p>{part.text}</p>;
    // Streaming text renders as plain Markdown; the completed message mounts
    // through Rollmark so chart and Mermaid blocks draw instead of showing as
    // code fences. Rollmark re-mounts its whole tree (and mermaid) whenever
    // the content changes, so it cannot run per streamed token. Both wrap in
    // letter-body for the shared prose typography.
    return (
      <div className="letter-body">
        <ArtifactDocument
          artifacts={artifacts}
          content={part.text}
          pending={pending}
          showUnreferenced={false}
        />
      </div>
    );
  }
  if (part.type === "source-url") {
    const href = safeExternalUrl(part.url);
    if (!href) {
      return <div className="chat-source">Source link unavailable</div>;
    }
    return (
      <a className="chat-source" href={href} rel="noreferrer" target="_blank">
        {part.title || part.url}
      </a>
    );
  }
  if (part.type === "source-document") {
    return <div className="chat-source">Source: {part.title}</div>;
  }
  if (isToolPart(part)) {
    // Keep actionable results visible while the call details stay in Show work.
    const savedRecipe =
      role === "assistant" ? savedRecipeFromToolPart(part) : undefined;
    const researchOutcome = visibleConnectionResearchOutcomeFromToolPart(
      part,
      messageParts,
      pending,
    );
    const approval = approvalFromToolPart(part);
    if (!approval && !researchOutcome && !savedRecipe) return null;
    const workflow =
      "toolCallId" in part && typeof part.toolCallId === "string"
        ? workflows.find(
            (candidate) => candidate.sourceToolCallId === part.toolCallId,
          )
        : undefined;
    const durableApproval = approval
      ? approvals.find((candidate) => candidate.id === approval.id)
      : undefined;
    return (
      <div className="chat-tool-event">
        {savedRecipe ? (
          <div className="chat-recipe-receipt">
            <span>
              {savedRecipe.label} · <strong>{savedRecipe.name}</strong>
            </span>
            <Link className="quiet-button" to={savedRecipe.href}>
              View recipe →
            </Link>
          </div>
        ) : null}
        {approval ? (
          <ToolApprovalCard
            approval={approval}
            input={"input" in part ? part.input : undefined}
            interactive={interactive}
            label={describeChatToolPart(part).label}
            onDecision={onApproval}
            riskEffect={durableApproval?.riskEffect ?? "destructive"}
          />
        ) : null}
        {researchOutcome ? (
          <ConnectionResearchCard
            context={context}
            interactive={interactive}
            onReload={onReload}
            outcome={researchOutcome}
            {...(workflow ? { workflow } : undefined)}
          />
        ) : null}
      </div>
    );
  }
  if (part.type.startsWith("data-")) {
    return (
      <div className="chat-tool-state">
        Springroll updated this conversation.
      </div>
    );
  }
  return null;
}

function ToolApprovalCard({
  approval,
  input,
  interactive,
  label,
  onDecision,
  riskEffect,
}: {
  readonly approval: {
    readonly id: string;
    readonly approved?: boolean;
    readonly reason?: string;
    readonly state: "requested" | "responded";
  };
  readonly input: unknown;
  readonly interactive: boolean;
  readonly label: string;
  readonly riskEffect: "read" | "write" | "destructive";
  readonly onDecision: (
    id: string,
    approved: boolean,
  ) => void | PromiseLike<void>;
}) {
  const [deciding, setDeciding] = useState(false);
  const details = toolApprovalDetails(input);
  const decide = async (approved: boolean) => {
    if (
      !interactive ||
      deciding ||
      approval.state !== "requested" ||
      (approved && details.blockedReason)
    )
      return;
    setDeciding(true);
    try {
      await onDecision(approval.id, approved);
    } finally {
      setDeciding(false);
    }
  };
  return (
    <section className="chat-tool-approval">
      <strong>{label}</strong>
      <details>
        <summary>View call details</summary>
        <span>Effect: {riskEffect}</span>
        {details.connectionId ? (
          <span>Connection: {details.connectionId}</span>
        ) : null}
        {details.toolName ? <span>Tool: {details.toolName}</span> : null}
        <pre>{details.input}</pre>
      </details>
      {details.blockedReason ? (
        <p role="alert">{details.blockedReason}</p>
      ) : null}
      {approval.state === "requested" ? (
        <div className="chat-card-actions">
          <button
            className="button primary"
            disabled={
              !interactive || deciding || Boolean(details.blockedReason)
            }
            onClick={() => void decide(true)}
            type="button"
          >
            {deciding ? "Approving…" : "Approve"}
          </button>
          <button
            className="quiet-button"
            disabled={!interactive || deciding}
            onClick={() => void decide(false)}
            type="button"
          >
            Deny
          </button>
        </div>
      ) : (
        <small>
          {approval.approved ? "Approved" : "Denied"}
          {approval.reason ? ` · ${approval.reason}` : ""}
        </small>
      )}
    </section>
  );
}

function safeUrlHostname(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "API host";
  }
}

function ConnectionResearchCard({
  context,
  outcome,
  interactive,
  onReload,
  workflow,
}: {
  readonly outcome: IntegrationProposalOutcomeDto;
  readonly context: ChatSessionContextDto | null;
  readonly interactive: boolean;
  readonly onReload: () => Promise<void>;
  readonly workflow?: AssistantWorkflowDto;
}) {
  if (outcome.status === "candidate") {
    const registryHref = safeExternalUrl(outcome.candidate.registryUrl);
    const repositoryHref = safeExternalUrl(outcome.candidate.repositoryUrl);
    const logoHref = outcome.candidate.logo
      ? safeHttpsExternalUrl(outcome.candidate.logo.url)
      : undefined;
    return (
      <section className="chat-connection-result">
        <div className="section-label">GitHub MCP Registry candidate</div>
        <div className="chat-connection-candidate-heading">
          {logoHref ? (
            <img
              alt=""
              className="chat-connection-candidate-logo"
              referrerPolicy="no-referrer"
              src={logoHref}
            />
          ) : null}
          <strong>{outcome.title}</strong>
        </div>
        <p>{outcome.explanation}</p>
        <div className="chat-task-facts">
          <span>{outcome.candidate.packageName}</span>
          <span>
            {outcome.candidate.credentialRequired
              ? "Credential required"
              : "No credential declared"}
          </span>
        </div>
        <nav className="chat-connection-sources" aria-label="Candidate sources">
          {registryHref ? (
            <a href={registryHref} rel="noreferrer" target="_blank">
              GitHub registry entry
            </a>
          ) : null}
          {repositoryHref ? (
            <a href={repositoryHref} rel="noreferrer" target="_blank">
              Official repository candidate
            </a>
          ) : null}
        </nav>
        <p className="chat-connection-guidance">
          Springroll is verifying this package before offering setup.
        </p>
      </section>
    );
  }
  if (outcome.status !== "ready") {
    const noUserAction = outcome.userAction === "none";
    return (
      <section className="chat-connection-result unavailable">
        <div className="section-label">
          {noUserAction
            ? "Unavailable in this build"
            : "More information needed"}
        </div>
        <strong>{outcome.title}</strong>
        <p>{outcome.explanation}</p>
        {noUserAction ? (
          <p>There is nothing you need to configure or provide.</p>
        ) : (
          <>
            <p>
              If you have official documentation or setup instructions, send the
              URL in this chat and Springroll will continue researching it.
            </p>
            <Link className="quiet-button" to="/connections/manual">
              I already have an MCP server URL
            </Link>
          </>
        )}
      </section>
    );
  }
  return (
    <ReadyConnectionProposal
      context={context}
      interactive={interactive}
      onReload={onReload}
      outcome={outcome}
      {...(workflow ? { workflow } : undefined)}
    />
  );
}

function ReadyConnectionProposal({
  context,
  outcome,
  interactive,
  onReload,
  workflow,
}: {
  readonly outcome: Extract<
    IntegrationProposalOutcomeDto,
    { readonly status: "ready" }
  >;
  readonly interactive: boolean;
  readonly onReload: () => Promise<void>;
  readonly context: ChatSessionContextDto | null;
  readonly workflow?: AssistantWorkflowDto;
}) {
  const navigate = useNavigate();
  const { sessionId, returnTo } = useChatSurface();
  const [searchParams] = useSearchParams();
  const { proposal } = outcome;
  const recommended =
    proposal.variants.find((variant) => variant.recommended) ??
    proposal.variants[0];
  const [selectedId, setSelectedId] = useState(recommended?.id ?? "");
  const [prepared, setPrepared] = useState<ConnectionCardDto>();
  const [apiKey, setApiKey] = useState("");
  const [credentialFields, setCredentialFields] = useState<
    Record<string, string>
  >({});
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [setupError, setSetupError] = useState<unknown>();
  const selected = proposal.variants.find(
    (variant) => variant.id === selectedId,
  );
  const localLaunchCommand = proposal.packageName
    ? [
        "npx",
        "--yes",
        `${proposal.packageName}@${proposal.packageVersion ?? "verified version"}`,
        ...(proposal.packageArgs ?? []),
      ].join(" ")
    : undefined;
  const durablePrepared = preparedConnectionWorkflow(workflow);
  const declined =
    workflow?.status === "cancelled" && workflow.outcome?.state === "declined";
  const durableConnectionId =
    workflow?.subjectKind === "connection"
      ? (workflow.subjectId ?? undefined)
      : undefined;

  const markConnected = useCallback(
    async (connectorId: string, updateContext = true) => {
      setConnected(true);
      if (sessionId && updateContext) {
        await api.updateChatContext(sessionId, {
          version: 1,
          intent: "connection.manage",
          origin: "connections",
          subjects: [{ kind: "connection", id: connectorId }],
        });
      }
    },
    [sessionId],
  );

  useEffect(() => {
    const connectorId =
      durableConnectionId ??
      searchParams.get("connector") ??
      (context?.intent === "connection.manage"
        ? context?.subjects?.find((subject) => subject.kind === "connection")
            ?.id
        : undefined);
    if (!connectorId) return;
    void api
      .connections()
      .then((connections) => {
        const connection = connections.find(
          (candidate) => candidate.id === connectorId,
        );
        if (!connection || (!workflow && connection.name !== proposal.name)) {
          return;
        }
        if (
          durablePrepared?.credentialKind === "api-key" &&
          workflow?.status === "waiting_for_user"
        ) {
          setPrepared(connection);
        }
        if (connection.status === "connected") {
          setPrepared(connection);
          if (interactive) {
            void markConnected(connectorId, !workflow).catch(setSetupError);
          } else {
            setConnected(true);
          }
        }
      })
      .catch(() => undefined);
  }, [
    context,
    durableConnectionId,
    durablePrepared?.credentialKind,
    interactive,
    markConnected,
    proposal.name,
    searchParams,
    workflow,
  ]);

  const begin = async () => {
    if (!interactive || !selected || busy) return;
    setBusy(true);
    setSetupError(undefined);
    try {
      if (workflow) {
        const result = await api.prepareConnectionWorkflow(
          sessionId ?? workflow.sessionId,
          workflow.id,
          selected.id,
        );
        if (result.status === "declined") {
          await onReload();
          return;
        }
        setPrepared(result.connection);
        if (result.status === "redirect") {
          window.location.assign(result.authorizationUrl);
          return;
        }
        if (result.status === "connected") {
          setPrepared(result.connection);
          await markConnected(result.connection.id, false);
          await onReload();
        }
        return;
      }
      const connection = await api.prepareIntegrationVariant(
        proposal.templateId,
        selected.id,
      );
      setPrepared(connection);
      if (connection.credentialKind === "oauth") {
        const providerId = connectorProviderId(connection);
        const oauthReturnTo = `${returnTo}${returnTo.includes("?") ? "&" : "?"}connector=${encodeURIComponent(providerId)}`;
        const result = await api.startConnectorOAuth(providerId, oauthReturnTo);
        if (result.status === "redirect") {
          window.location.assign(result.authorizationUrl);
          return;
        }
        setPrepared(result.connection);
        await markConnected(result.connection.id);
      } else if (connection.credentialKind === "none") {
        const tested = await api.connectConnector(connection.id);
        setPrepared(tested);
        await markConnected(connection.id);
      }
    } catch (caught) {
      setSetupError(caught);
    } finally {
      setBusy(false);
    }
  };

  const connectWithKey = async (event: FormEvent) => {
    event.preventDefault();
    if (
      !interactive ||
      !prepared ||
      !connectorCredentialComplete(prepared, apiKey, credentialFields) ||
      busy
    )
      return;
    setBusy(true);
    setSetupError(undefined);
    try {
      let connection: ConnectionCardDto;
      if (workflow) {
        const result = await api.connectConnectionWorkflow(
          sessionId ?? workflow.sessionId,
          workflow.id,
          connectorCredentialInput(prepared, apiKey, credentialFields),
        );
        if (result.status !== "connected") {
          throw new Error("Connection setup did not finish");
        }
        connection = result.connection;
      } else {
        connection = await api.connectConnector(
          prepared.id,
          connectorCredentialInput(prepared, apiKey, credentialFields),
        );
      }
      setPrepared(connection);
      setApiKey("");
      setCredentialFields({});
      await markConnected(connection.id, !workflow);
      if (workflow) await onReload();
    } catch (caught) {
      setSetupError(caught);
      if (workflow) await onReload();
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    if (!interactive || !workflow || busy) return;
    setBusy(true);
    setSetupError(undefined);
    try {
      await api.declineConnectionWorkflow(
        sessionId ?? workflow.sessionId,
        workflow.id,
      );
      setApiKey("");
      await onReload();
    } catch (caught) {
      setSetupError(caught);
    } finally {
      setBusy(false);
    }
  };

  if (declined) {
    return (
      <section className="chat-connection-result unavailable">
        <div className="section-label">Setup declined</div>
        <strong>{proposal.name} was not connected</strong>
        <p>
          Declining did not send a credential. You can ask Springroll to revisit
          this connection whenever you need it.
        </p>
      </section>
    );
  }

  return (
    <section className="chat-connection-result ready">
      <div className="section-label">
        {proposal.trust === "registry-verified"
          ? "Registry verified"
          : proposal.trust === "package-verified"
            ? "Package metadata verified"
            : proposal.trust === "openapi-verified"
              ? "Official OpenAPI verified"
              : proposal.trust === "user-reviewed"
                ? "User-reviewed API guidance"
                : "Springroll curated"}
      </div>
      <h3>{proposal.name}</h3>
      <p>{proposal.description}</p>
      <div className="chat-connection-host">
        {localLaunchCommand
          ? `${localLaunchCommand} · runs locally · operator ${proposal.operator}`
          : `Hosted by ${proposal.operator}`}
      </div>
      {proposal.sources?.length ? (
        <nav className="chat-connection-sources" aria-label="Research sources">
          {proposal.sources.map((source) => {
            const href = safeExternalUrl(source.url);
            return href ? (
              <a href={href} key={source.url} rel="noreferrer" target="_blank">
                {source.title}
              </a>
            ) : null;
          })}
        </nav>
      ) : null}
      {proposal.api ? (
        <div className="chat-api-review">
          <div className="chat-task-facts">
            <span>API</span>
            <span>{proposal.api.operationCount} operations</span>
            <span>{safeUrlHostname(proposal.api.baseUrl)}</span>
          </div>
          {proposal.tools?.length ? (
            <details>
              <summary>Review discovered API operations</summary>
              <ul className="chat-api-operation-list">
                {proposal.tools.map((tool) => (
                  <li key={tool.name}>
                    <i
                      className={`risk-dot risk-${tool.effect}`}
                      aria-hidden="true"
                    />
                    <span>
                      <strong>{tool.name}</strong>
                      {tool.description ? (
                        <small>{tool.description}</small>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {proposal.api.verification ? (
            <div className="chat-api-verification">
              <strong>Connection test</strong>
              <span>{proposal.api.verification.note}</span>
              <code>{proposal.api.verification.tool}</code>
            </div>
          ) : (
            <p className="chat-task-update-note">
              A read-only connection test is missing. Springroll must prepare
              one before this integration can be connected.
            </p>
          )}
          {proposal.api.notes?.length ? (
            <ul className="chat-api-notes">
              {proposal.api.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {proposal.variants.length > 1 ? (
        <fieldset disabled={!interactive || busy || connected}>
          <legend>Setup method</legend>
          {proposal.variants.map((variant) => (
            <label key={variant.id}>
              <input
                checked={selectedId === variant.id}
                name={`chat-connection-${proposal.templateId}`}
                onChange={() => {
                  setSelectedId(variant.id);
                  setPrepared(undefined);
                  setApiKey("");
                  setSetupError(undefined);
                }}
                type="radio"
              />
              {variant.label}
            </label>
          ))}
        </fieldset>
      ) : null}
      {selected ? (
        <div className="chat-connection-guidance">
          <p>{selected.guidance.summary}</p>
          {selected.guidance.steps.length ? (
            <ol>
              {selected.guidance.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : null}
          {safeExternalUrl(selected.guidance.docsUrl) ? (
            <a
              href={safeExternalUrl(selected.guidance.docsUrl)}
              rel="noreferrer"
              target="_blank"
            >
              Official setup documentation
            </a>
          ) : null}
        </div>
      ) : null}
      {!connected && (setupError || workflow?.error) ? (
        <ChatError error={setupError ?? workflow?.error} />
      ) : null}
      {connected ? (
        <div className="chat-connection-success" role="status">
          <strong>
            {prepared?.connectionTest?.status === "passed"
              ? prepared.connectionTest.kind === "api-read"
                ? `Test passed: ${prepared.connectionTest.tool}. Integration connected.`
                : "Connection test passed: MCP server reached and tools discovered. Individual operations have not been tested."
              : "No connection test result was recorded. Ask Springroll to verify this integration."}
          </strong>
          <button
            className="quiet-button"
            onClick={() => navigate("/connections")}
            type="button"
          >
            View connection
          </button>
        </div>
      ) : prepared?.credentialKind === "api-key" ? (
        <form
          className="chat-credential-form"
          onSubmit={(event) => void connectWithKey(event)}
        >
          {prepared.credentialFields?.length ? (
            prepared.credentialFields.map((field) => (
              <label key={field.name}>
                {field.label}
                <input
                  autoComplete={field.autoComplete}
                  disabled={!interactive || busy}
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
              {prepared.credentialPlaceholder ?? `${prepared.name} API key`}
              <input
                autoComplete="off"
                disabled={!interactive || busy}
                onChange={(event) => setApiKey(event.target.value)}
                type="password"
                value={apiKey}
              />
            </label>
          )}
          <small>
            The test sends your credential directly to the service, never to the
            model. It is saved to the system keychain only after the test
            passes.
          </small>
          <button
            className="button primary"
            disabled={
              !interactive ||
              !connectorCredentialComplete(
                prepared,
                apiKey,
                credentialFields,
              ) ||
              busy
            }
            type="submit"
          >
            {busy ? "Testing…" : "Test connection"}
          </button>
          {workflow ? (
            <button
              className="quiet-button"
              disabled={!interactive || busy}
              onClick={() => void decline()}
              type="button"
            >
              Not now
            </button>
          ) : null}
        </form>
      ) : (
        <div className="chat-card-actions">
          <button
            className="button primary"
            disabled={!interactive || !selected || busy}
            onClick={() => void begin()}
            type="button"
          >
            {busy
              ? "Preparing…"
              : workflow?.error && proposal.packageName
                ? "Retry local setup"
                : workflow?.error
                  ? "Try again"
                  : selected?.credentialKind === "oauth"
                    ? selected.label
                    : selected?.credentialKind === "api-key"
                      ? "Continue securely"
                      : "Connect & test"}
          </button>
          {workflow ? (
            <button
              className="quiet-button"
              disabled={!interactive || busy}
              onClick={() => void decline()}
              type="button"
            >
              Not now
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ChatError({
  error,
  retry,
}: {
  readonly error: unknown;
  readonly retry?: () => Promise<void>;
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
      ) : null}
    </div>
  );
}

function isToolPart(part: AssistantMessageDto["parts"][number]): boolean {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function toolPartFinished(part: AssistantMessageDto["parts"][number]): boolean {
  const state =
    "state" in part && typeof part.state === "string" ? part.state : "";
  return state.startsWith("output") || state === "approval-responded";
}

function workStepsFromMessage(
  message: AssistantMessageDto,
  timings: readonly ChatToolCallDto[],
): readonly ChatWorkStep[] {
  const durations = toolCallDurations(timings);
  return message.parts.flatMap((part) => {
    if (!isToolPart(part)) return [];
    const presentation = describeChatToolPart(part);
    const issues = connectorProposalValidationIssuesFromToolPart(part);
    const result = chatToolResultSummary(part);
    const durationMs =
      "toolCallId" in part && typeof part.toolCallId === "string"
        ? durations.get(part.toolCallId)
        : undefined;
    return [
      {
        key: chatPartKey(part),
        label: presentation.label,
        running: !toolPartFinished(part),
        failed: result?.tone === "danger",
        signature: toolPartSignature(part),
        ...(presentation.detail ? { detail: presentation.detail } : undefined),
        ...(issues ? { issues } : undefined),
        ...(result ? { result } : undefined),
        ...(durationMs === undefined ? undefined : { durationMs }),
      },
    ];
  });
}

/**
 * Turns recorded before tool timings existed simply have none, and their
 * trails stay flat rather than pretending to a duration.
 */
function toolCallDurations(
  timings: readonly ChatToolCallDto[],
): ReadonlyMap<string, number> {
  const durations = new Map<string, number>();
  for (const timing of timings) {
    if (!timing.finishedAt) continue;
    const started = Date.parse(timing.startedAt);
    const finished = Date.parse(timing.finishedAt);
    if (!Number.isFinite(started) || !Number.isFinite(finished)) continue;
    if (finished < started) continue;
    durations.set(timing.toolCallId, finished - started);
  }
  return durations;
}

/**
 * Two calls with the same tool and the same input inside one turn are the
 * agent repeating itself. Marking them costs nothing and is the fastest way
 * to see a loop that is going nowhere.
 */
function toolPartSignature(part: AssistantMessageDto["parts"][number]): string {
  const input = "input" in part ? part.input : undefined;
  let encoded = "";
  try {
    encoded = JSON.stringify(input ?? null) ?? "";
  } catch {
    encoded = String(input);
  }
  return `${part.type}:${encoded.slice(0, 600)}`;
}

/** What the one status line says right now. */
function messageProgressLabel(message: AssistantMessageDto): string {
  const unfinished = message.parts.findLast(
    (part) => isToolPart(part) && !toolPartFinished(part),
  );
  if (unfinished) return chatToolProgressLabel(unfinished);
  const writing = message.parts.some(
    (part) => part.type === "text" && part.text.trim(),
  );
  if (writing) return "Writing";
  const lastTool = message.parts.findLast(isToolPart);
  return lastTool ? chatToolProgressLabel(lastTool) : "Thinking";
}

function approvalFromToolPart(part: AssistantMessageDto["parts"][number]):
  | {
      readonly id: string;
      readonly approved?: boolean;
      readonly reason?: string;
      readonly state: "requested" | "responded";
    }
  | undefined {
  if (
    !("state" in part) ||
    (part.state !== "approval-requested" &&
      part.state !== "approval-responded") ||
    !("approval" in part) ||
    !isUnknownRecord(part.approval) ||
    typeof part.approval.id !== "string"
  ) {
    return undefined;
  }
  return {
    id: part.approval.id,
    state: part.state === "approval-requested" ? "requested" : "responded",
    ...(typeof part.approval.approved === "boolean"
      ? { approved: part.approval.approved }
      : undefined),
    ...(typeof part.approval.reason === "string"
      ? { reason: part.approval.reason }
      : undefined),
  };
}

function approvalDecisionsFromMessage(message: AssistantMessageDto) {
  return message.parts.flatMap((part) => {
    const approval = approvalFromToolPart(part);
    return approval?.state === "responded" &&
      typeof approval.approved === "boolean"
      ? [
          {
            id: approval.id,
            approved: approval.approved,
            ...(approval.reason ? { reason: approval.reason } : undefined),
          },
        ]
      : [];
  });
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeExternalUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function safeHttpsExternalUrl(value: string): string | undefined {
  const url = safeExternalUrl(value);
  return url?.startsWith("https://") ? url : undefined;
}

function preparedConnectionWorkflow(workflow: AssistantWorkflowDto | undefined):
  | {
      readonly connectorId: string;
      readonly credentialKind: "oauth" | "api-key" | "none";
    }
  | undefined {
  const outcome = workflow?.outcome;
  if (
    outcome?.phase !== "prepared" ||
    typeof outcome.connectorId !== "string" ||
    (outcome.credentialKind !== "oauth" &&
      outcome.credentialKind !== "api-key" &&
      outcome.credentialKind !== "none")
  ) {
    return undefined;
  }
  return {
    connectorId: outcome.connectorId,
    credentialKind: outcome.credentialKind,
  };
}

function chatPartKey(part: AssistantMessageDto["parts"][number]): string {
  if ("id" in part && typeof part.id === "string") {
    return `${part.type}:${part.id}`;
  }
  if ("toolCallId" in part && typeof part.toolCallId === "string") {
    return `${part.type}:${part.toolCallId}`;
  }
  if (part.type === "text") return `text:${part.text.slice(0, 120)}`;
  if (part.type === "source-url") return `source:${part.url}`;
  return part.type;
}

function messageText(message: AssistantMessageDto): string | undefined {
  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
  return text || undefined;
}

/**
 * Model identity for the expanded fold. Usage (duration, tokens, cost)
 * lives in the shared TurnUsage model so chat and runs render the same.
 */
function assistantMessageModel(
  message: AssistantMessageDto,
): string | undefined {
  if (message.role !== "assistant") return undefined;
  return message.metadata?.modelId
    ? message.metadata.provider
      ? `${message.metadata.provider} · ${message.metadata.modelId}`
      : message.metadata.modelId
    : undefined;
}
