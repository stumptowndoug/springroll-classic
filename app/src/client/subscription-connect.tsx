import { useEffect, useState } from "react";
import type {
  SubscriptionRuntimeId,
  SubscriptionRuntimeStatus,
} from "../shared.ts";
import { api } from "./api.ts";

export function SubscriptionConnect({
  id,
  busy,
  onConnect,
}: {
  readonly id: SubscriptionRuntimeId;
  readonly busy: string | undefined;
  readonly onConnect: () => void;
}) {
  const [status, setStatus] = useState<SubscriptionRuntimeStatus>();
  const [requesting, setRequesting] = useState(false);
  const name = id === "codex" ? "Codex" : "Claude";
  const downloading =
    status?.state === "downloading" || status?.state === "installing";
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        const next = await api.subscriptionRuntime(id);
        if (!active) return;
        setStatus(next);
        if (
          downloading ||
          next.state === "downloading" ||
          next.state === "installing"
        )
          timer = setTimeout(() => void read(), 750);
      } catch (error) {
        if (active)
          setStatus({
            state: "error",
            error:
              error instanceof Error
                ? error.message
                : "Cannot check subscription support",
          });
      }
    };
    void read();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id, downloading]);

  const perform = async (action: () => Promise<SubscriptionRuntimeStatus>) => {
    setRequesting(true);
    try {
      setStatus(await action());
    } catch (error) {
      setStatus({
        state: "error",
        error:
          error instanceof Error
            ? error.message
            : "Support setup failed. Please retry.",
      });
    } finally {
      setRequesting(false);
    }
  };
  const disabled = busy !== undefined || requesting;
  const percent = status?.totalBytes
    ? Math.min(
        100,
        Math.floor(((status.receivedBytes ?? 0) / status.totalBytes) * 100),
      )
    : undefined;
  return (
    <div className="subscription-runtime-setup">
      {status?.state === "ready" ? (
        <div className="provider-foot">
          <span className="provider-get-key">
            {status.source === "existing"
              ? `Using installed ${name}`
              : "Ready on this Mac"}
          </span>
          <button
            className="quiet-button"
            type="button"
            disabled={disabled}
            onClick={onConnect}
          >
            {busy === id
              ? "Signing in…"
              : id === "codex"
                ? "Sign in with ChatGPT"
                : "Sign in with Claude"}
          </button>
        </div>
      ) : downloading ? (
        <>
          <p role="status">
            {status?.state === "installing"
              ? `Verifying and installing ${name} support…`
              : `Downloading ${name} support${percent === undefined ? "…" : ` — ${percent}%`}`}
          </p>
          <progress
            aria-label={`${name} support download`}
            max={100}
            {...(percent === undefined || status?.state === "installing"
              ? {}
              : { value: percent })}
          />
          <button
            className="quiet-button"
            type="button"
            disabled={requesting}
            onClick={() =>
              void perform(() => api.cancelSubscriptionRuntimeDownload(id))
            }
          >
            Cancel download
          </button>
        </>
      ) : (
        <>
          <p>
            {status
              ? status.error
                ? `Your installed ${name} needs attention. You can update it or use Springroll’s managed copy.`
                : `Install ${name} on this Mac, or download a copy for Springroll to use.`
              : `Checking for ${name} on this Mac…`}
          </p>
          {status?.error ? (
            <p className="connect-panel-error" role="alert">
              {status.error}
            </p>
          ) : null}
          <button
            className="quiet-button"
            type="button"
            disabled={disabled || !status}
            onClick={() =>
              void perform(() => api.installSubscriptionRuntime(id))
            }
          >
            {requesting
              ? "Preparing…"
              : status?.state === "error"
                ? "Retry setup"
                : `Download ${name} support`}
          </button>
        </>
      )}
    </div>
  );
}
