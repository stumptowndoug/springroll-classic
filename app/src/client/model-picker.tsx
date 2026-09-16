import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type {
  ModelOptionDto,
  ModelProviderId,
  ModelSelectionDto,
  ModelSettingsDto,
} from "../shared.ts";

import { SettingsPicker } from "./settings-picker.tsx";

export function ModelPicker({
  models,
  value,
  inheritLabel,
  disabled,
  onChange,
  align = "start",
  compact = false,
  openUp = false,
  googleDataProtected = false,
  inheritedValue,
}: {
  readonly googleDataProtected?: boolean | undefined;
  readonly inheritedValue?: ModelSelectionDto | undefined;
  readonly models: readonly ModelOptionDto[];
  readonly value: ModelSelectionDto | undefined;
  readonly inheritLabel: string;
  readonly disabled: boolean;
  readonly onChange: (selection: ModelSelectionDto | null) => void;
  readonly align?: "start" | "end";
  readonly compact?: boolean;
  readonly openUp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState<ModelProviderId | "all">(
    "all",
  );
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [active, setActive] = useState(0);
  const unavailable = (model: ModelOptionDto | undefined) =>
    googleDataProtected &&
    (!model ||
      model.googleDataCompatibility === "unavailable" ||
      !model.googleDataCompatibility);
  const inheritedModel = models.find(
    (model) =>
      model.providerId === inheritedValue?.providerId &&
      model.modelId === inheritedValue?.modelId,
  );
  const inheritUnavailable = unavailable(inheritedModel);

  const searchRef = useRef<HTMLInputElement>(null);

  const selected = value
    ? models.find(
        (model) =>
          model.providerId === value.providerId &&
          model.modelId === value.modelId,
      )
    : undefined;
  const triggerLabel = compact
    ? (selected?.name ??
      (value ? value.modelId : compactInheritedModelLabel(inheritLabel)))
    : value
      ? selected
        ? `${providerName(selected.providerId)} · ${selected.name}`
        : `${providerName(value.providerId)} · ${value.modelId}`
      : inheritLabel;

  const normalizedQuery = query.trim().toLowerCase();
  const providers = modelProviders(models);
  const filteredModels = models.filter(
    (model) =>
      availabilityFilter === "all" ||
      model.googleDataCompatibility === availabilityFilter,
  );
  const providerModels =
    providerFilter === "all"
      ? filteredModels
      : filteredModels.filter((model) => model.providerId === providerFilter);
  const visibleModels = normalizedQuery
    ? providerModels.filter(
        (model) =>
          model.name.toLowerCase().includes(normalizedQuery) ||
          model.modelId.toLowerCase().includes(normalizedQuery) ||
          providerName(model.providerId)
            .toLowerCase()
            .includes(normalizedQuery),
      )
    : providerModels;
  const grouped = groupModels(visibleModels);
  const showInherit =
    normalizedQuery === "" &&
    providerFilter === "all" &&
    availabilityFilter === "all";
  const optionCount = visibleModels.length + (showInherit ? 1 : 0);
  const flatIndexByModel = new Map(
    visibleModels.map((model, index) => [
      modelValue(model),
      index + (showInherit ? 1 : 0),
    ]),
  );

  useEffect(() => {
    if (open) {
      searchRef.current?.focus();
    }
  }, [open]);

  const choose = (option: ModelOptionDto | null) => {
    if (option ? unavailable(option) : inheritUnavailable) return;
    setOpen(false);
    onChange(
      option
        ? { providerId: option.providerId, modelId: option.modelId }
        : null,
    );
  };

  const chooseActive = () => {
    if (optionCount === 0) {
      return;
    }
    if (showInherit && active === 0) {
      choose(null);
      return;
    }
    const option = visibleModels[active - (showInherit ? 1 : 0)];
    if (option) choose(option);
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, optionCount - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      chooseActive();
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const optionClass = (index: number, isSelected: boolean) =>
    `combo-option ${index === active ? "active" : ""} ${
      isSelected ? "selected" : ""
    }`;
  const activeRef = (index: number) =>
    index === active
      ? (element: HTMLButtonElement | null) =>
          element?.scrollIntoView({ block: "nearest" })
      : undefined;

  return (
    <div className={`model-picker${compact ? " compact" : ""}`}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Choose model"
        className="combo-trigger"
        disabled={disabled || models.length === 0}
        onClick={() => {
          setQuery("");
          setProviderFilter("all");
          setAvailabilityFilter("all");
          setActive(0);
          setOpen((wasOpen) => !wasOpen);
        }}
        type="button"
      >
        <span className="combo-value">{triggerLabel}</span>
        <span aria-hidden="true" className="combo-chev">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {googleDataProtected ? (
        <small
          className={
            unavailable(value ? selected : inheritedModel)
              ? "execution-error"
              : undefined
          }
        >
          {unavailable(value ? selected : inheritedModel)
            ? "Uses Google data · Choose a compatible model."
            : "Uses Google data · Compatible providers only."}
        </small>
      ) : null}
      {!compact && models.length === 0 ? (
        <small>Connect an AI provider to choose a model.</small>
      ) : null}
      {open ? (
        <>
          <button
            aria-label="Close model list"
            className="enable-backdrop"
            onClick={() => setOpen(false)}
            type="button"
          />
          <div
            className={`combo-panel model-catalog-panel${align === "end" ? " align-end" : ""}${
              openUp ? " open-up" : ""
            }`}
          >
            {providers.length > 1 ? (
              <div className="combo-provider-filter">
                <span>Provider</span>
                <SettingsPicker
                  className="model-filter-picker"
                  label="Filter models by provider"
                  disabled={false}
                  value={providerFilter}
                  options={[
                    { value: "all", label: "All providers" },
                    ...providers.map((providerId) => ({
                      value: providerId,
                      label: providerName(providerId),
                    })),
                  ]}
                  onChange={(value) => {
                    setProviderFilter(value as ModelProviderId | "all");
                    setActive(0);
                  }}
                />
              </div>
            ) : null}
            {googleDataProtected ? (
              <div className="combo-provider-filter">
                <span>
                  {providerFilter === "openrouter"
                    ? "ZDR routing"
                    : "Google data"}
                </span>
                <SettingsPicker
                  className="model-filter-picker"
                  label="Filter models by Google data compatibility"
                  disabled={false}
                  value={availabilityFilter}
                  options={[
                    { value: "all", label: "All models" },
                    {
                      value: "available",
                      label:
                        providerFilter === "openrouter"
                          ? "ZDR available"
                          : "Compatible models",
                    },
                    { value: "unavailable", label: "Unavailable" },
                    { value: "unknown", label: "Availability unknown" },
                  ]}
                  onChange={(value) => {
                    setAvailabilityFilter(value);
                    setActive(0);
                  }}
                />
              </div>
            ) : null}
            <div className="combo-search">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search models"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={onSearchKeyDown}
                placeholder={`Search ${models.length} models`}
                ref={searchRef}
                value={query}
              />
            </div>
            <div aria-label="AI model" className="combo-list" role="listbox">
              {showInherit ? (
                <button
                  aria-selected={!value}
                  aria-disabled={inheritUnavailable}
                  className={`${optionClass(0, !value)} combo-default`}
                  onClick={() => choose(null)}
                  onMouseEnter={() => setActive(0)}
                  ref={activeRef(0)}
                  role="option"
                  type="button"
                >
                  <span aria-hidden="true" className="combo-tick">
                    ✓
                  </span>
                  <span className="combo-name">{inheritLabel}</span>
                  {inheritUnavailable ? (
                    <span className="combo-facts">
                      Choose a compatible model explicitly
                    </span>
                  ) : null}
                </button>
              ) : null}
              {visibleModels.length === 0 ? (
                <p className="combo-empty">No matching models</p>
              ) : null}
              {[...grouped.entries()].map(([providerId, options]) => (
                <div key={providerId}>
                  <div className="combo-group">
                    <span>{providerName(providerId)}</span>
                    <span>{providerTypeLabel(providerId)}</span>
                  </div>
                  {options.map((model) => {
                    const index = flatIndexByModel.get(modelValue(model)) ?? 0;
                    const isSelected =
                      value?.providerId === model.providerId &&
                      value?.modelId === model.modelId;
                    const facts = modelFactsLine(model);
                    return (
                      <button
                        aria-selected={isSelected}
                        aria-disabled={unavailable(model)}
                        title={
                          googleDataProtected
                            ? model.googleDataReason
                            : undefined
                        }
                        className={optionClass(index, isSelected)}
                        key={modelValue(model)}
                        onClick={() => choose(model)}
                        onMouseEnter={() => setActive(index)}
                        ref={activeRef(index)}
                        role="option"
                        type="button"
                      >
                        <span aria-hidden="true" className="combo-tick">
                          ✓
                        </span>
                        <span className="combo-name">{model.name}</span>
                        {googleDataProtected ? (
                          <span className="combo-facts">
                            {model.googleDataCompatibility === "available"
                              ? "ZDR available"
                              : model.googleDataCompatibility === "unavailable"
                                ? model.providerId === "openrouter"
                                  ? "No ZDR endpoint"
                                  : "Google data unavailable"
                                : "ZDR availability unknown"}
                          </span>
                        ) : null}
                        {facts ? (
                          <span className="combo-facts">{facts}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function compactInheritedModelLabel(label: string): string {
  return label.split(" · ").at(-1) ?? label;
}

export function defaultModelLabel(
  configuration: ModelSettingsDto | undefined,
): string {
  if (!configuration?.defaultSelection) return "App default · Automatic";
  const selected = configuration.recipeModels.find(
    (model) =>
      model.providerId === configuration.defaultSelection?.providerId &&
      model.modelId === configuration.defaultSelection.modelId,
  );
  return selected
    ? `App default · ${selected.name}`
    : "App default · Automatic";
}

export function defaultRecipeModelLabel(
  configuration: ModelSettingsDto | undefined,
): string {
  if (!configuration) return "Recipe default · Automatic";
  const selection = configuration.defaultSelection;
  if (!selection) return "Recipe default · Automatic";
  const selected = configuration.recipeModels.find(
    (model) =>
      model.providerId === selection.providerId &&
      model.modelId === selection.modelId,
  );
  return selected
    ? `Recipe default · ${selected.name}`
    : "Recipe default · Automatic";
}

export function defaultImageModelLabel(
  configuration: ModelSettingsDto | undefined,
): string {
  if (!configuration?.imageSelection) return "Image default · Automatic";
  const selected = configuration.imageModels.find(
    (model) =>
      model.providerId === configuration.imageSelection?.providerId &&
      model.modelId === configuration.imageSelection.modelId,
  );
  return selected
    ? `Image default · ${selected.name}`
    : "Image default · Automatic";
}

export function providerName(providerId: ModelProviderId): string {
  if (providerId === "openrouter") return "OpenRouter";
  if (providerId === "openai") return "OpenAI";
  if (providerId === "xai") return "xAI";
  if (providerId === "anthropic") return "Anthropic";
  if (providerId === "google") return "Google AI";
  if (providerId === "groq") return "Groq";
  if (providerId === "claude") return "Claude";
  return "Codex";
}

export function providerTypeLabel(providerId: ModelProviderId): string {
  if (providerId === "openrouter") return "Aggregator";
  if (providerId === "claude" || providerId === "codex") {
    return "Subscription";
  }
  return "API key";
}

function modelFactsLine(model: ModelOptionDto): string | undefined {
  const price =
    model.inputUsdPerMillionTokens !== undefined &&
    model.outputUsdPerMillionTokens !== undefined
      ? `$${formatPrice(model.inputUsdPerMillionTokens)} / $${formatPrice(
          model.outputUsdPerMillionTokens,
        )}`
      : undefined;
  const context = model.contextTokens
    ? compactNumber(model.contextTokens)
    : undefined;
  const line = [price, context]
    .filter((fact): fact is string => Boolean(fact))
    .join(" · ");
  return line || undefined;
}

function modelValue(selection: ModelSelectionDto): string {
  return `${selection.providerId}::${selection.modelId}`;
}

function groupModels(
  models: readonly ModelOptionDto[],
): ReadonlyMap<ModelProviderId, readonly ModelOptionDto[]> {
  const grouped = new Map<ModelProviderId, ModelOptionDto[]>();
  for (const model of models) {
    const options = grouped.get(model.providerId) ?? [];
    options.push(model);
    grouped.set(model.providerId, options);
  }
  return grouped;
}

function modelProviders(
  models: readonly ModelOptionDto[],
): readonly ModelProviderId[] {
  return [...new Set(models.map((model) => model.providerId))];
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPrice(value: number): string {
  return value < 0.01
    ? value.toFixed(4)
    : value < 1
      ? value.toFixed(2)
      : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
