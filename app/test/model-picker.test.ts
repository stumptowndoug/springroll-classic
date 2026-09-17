import { describe, expect, test } from "bun:test";
import {
  compactInheritedModelLabel,
  defaultRecipeModelLabel,
  modelMatchesSearch,
  providerTypeLabel,
} from "../src/client/model-picker.tsx";

describe("compact model label", () => {
  test("shows the resolved app default instead of an ambiguous Default label", () => {
    expect(compactInheritedModelLabel("App default · GPT-5.6")).toBe("GPT-5.6");
    expect(compactInheritedModelLabel("App default · Automatic")).toBe(
      "Automatic",
    );
  });
});

describe("model provider presentation", () => {
  test("distinguishes aggregators, API keys, and subscriptions", () => {
    expect(providerTypeLabel("openrouter")).toBe("Aggregator");
    expect(providerTypeLabel("anthropic")).toBe("API key");
    expect(providerTypeLabel("claude")).toBe("Subscription");
    expect(providerTypeLabel("codex")).toBe("Subscription");
  });

  test("uses the shared app default for recipes", () => {
    expect(
      defaultRecipeModelLabel({
        providers: [],
        models: [],
        recipeModels: [
          {
            providerId: "claude",
            modelId: "sonnet",
            name: "Claude Sonnet",
            reasoning: true,
            toolCall: true,
            inputModalities: ["text"],
          },
        ],
        imageModels: [],
        defaultSelection: {
          providerId: "claude",
          modelId: "sonnet",
        },
        catalogStale: false,
      }),
    ).toBe("Recipe default · Claude Sonnet");
  });
});

test("model search matches separated words, punctuation and provider across fields", () => {
  const model = {
    providerId: "openrouter" as const,
    modelId: "qwen/qwen3-coder-flash",
    name: "Qwen: Qwen3 Coder Flash",
  };
  for (const query of [
    "qwen flash",
    "FLASH qwen",
    "openrouter coder",
    "qwen 3",
    "qwen3-coder",
    "",
  ]) {
    expect(modelMatchesSearch(model, query)).toBe(true);
  }
  expect(modelMatchesSearch(model, "qwen pro")).toBe(false);
  expect(
    modelMatchesSearch(
      { ...model, name: "GPT-5.4 Mini", modelId: "openai/gpt-5.4-mini" },
      "gpt 5.4 mini",
    ),
  ).toBe(true);
});
