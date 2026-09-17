import { ToolPolicyError } from "./tools.ts";

/** Enforce after SDK options are merged; OpenRouter owns ZDR endpoint eligibility. */
export function protectGoogleInferenceBody(body: string): string {
  const payload = JSON.parse(body) as Record<string, unknown>;
  if (
    (payload.plugins !== undefined &&
      (!Array.isArray(payload.plugins) || payload.plugins.length > 0)) ||
    payload.web_search_options
  ) {
    throw new ToolPolicyError(
      "Google data cannot use OpenRouter plugins or hosted web search because ZDR does not cover them",
    );
  }
  const provider = payload.provider;
  return JSON.stringify({
    ...payload,
    provider: {
      ...(provider && typeof provider === "object" && !Array.isArray(provider)
        ? provider
        : {}),
      data_collection: "deny",
      zdr: true,
    },
    store: false,
  });
}
