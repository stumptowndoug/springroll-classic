import { describe, expect, test } from "bun:test";
import {
  chatToolProgressLabel,
  chatToolResultSummary,
  connectionResearchOutcomeFromToolPart,
  connectorProposalValidationIssuesFromToolPart,
  describeChatToolPart,
  describeRunToolCall,
  runToolProgressLabel,
  savedRecipeFromToolPart,
  toolApprovalRiskPresentation,
  visibleConnectionResearchOutcomeFromToolPart,
} from "../src/client/chat-tool-presentation.ts";

describe("describeChatToolPart", () => {
  test("names Codex dynamic calls and progress using their actual tool", () => {
    const part = {
      type: "dynamic-tool",
      toolName: "create_task",
      input: {},
    };
    expect(describeChatToolPart(part)).toEqual({ label: "Create recipe" });
    expect(chatToolProgressLabel(part)).toBe("Creating the recipe");
    expect(
      describeChatToolPart({ ...part, toolName: "custom_lookup" }),
    ).toEqual({ label: "Custom lookup" });
    expect(part.type).toBe("dynamic-tool");
  });

  test("recognizes wrapped validation issues from dynamic connector proposals", () => {
    const part = {
      type: "dynamic-tool",
      toolName: "propose_connection",
      state: "output-available",
      output: {
        structuredContent: {
          status: "invalid_input",
          issues: [{ path: "url", message: "Use an HTTPS URL." }],
        },
      },
    };
    expect(connectorProposalValidationIssuesFromToolPart(part)).toEqual([
      { path: "url", message: "Use an HTTPS URL." },
    ]);
    expect(describeChatToolPart(part)).toEqual({
      label: "Correct connection proposal",
    });
    expect(chatToolResultSummary(part)).toEqual({
      text: "needs correction",
      tone: "danger",
    });
  });

  test("distinguishes write approval from irreversible destructive consent", () => {
    expect(toolApprovalRiskPresentation("write")).toEqual({
      eyebrow: "Write approval required",
      title: "This action changes external data",
      description:
        "This connector call can create or modify external data. Review the exact call before allowing it to run.",
      approveLabel: "Approve and run",
      className: "write",
    });
    expect(toolApprovalRiskPresentation("destructive")).toEqual({
      eyebrow: "Destructive approval required",
      title: "This action may be irreversible",
      description:
        "This connector call may delete data or cause an irreversible external change. Review the exact call before allowing it to run.",
      approveLabel: "Approve destructive action",
      className: "destructive",
    });
  });

  test("names a web read by its host and keeps the query as the detail", () => {
    expect(
      describeChatToolPart({
        type: "tool-search_web",
        toolCallId: "call-1",
        state: "output-available",
        input: { query: "springroll pricing" },
        output: {
          content: ["> Distilled by Springroll's research distiller..."],
          structuredContent: { distilled: true, distillerModelId: "mimo" },
        },
      }),
    ).toEqual({
      label: "Search web",
      detail: "springroll pricing",
    });
    expect(
      describeChatToolPart({
        type: "tool-fetch_public_url",
        toolCallId: "call-2",
        state: "output-available",
        input: { url: "https://one.test/pricing" },
        output: { content: ["a short raw read"] },
      }),
    ).toEqual({
      label: "Read one.test",
      detail: "/pricing",
    });
    expect(
      describeChatToolPart({
        type: "tool-fetch_public_url",
        toolCallId: "call-3",
        state: "output-available",
        input: { url: "https://www.two.test/", focus: "current pricing tiers" },
      }),
    ).toEqual({
      label: "Read two.test",
      detail: "current pricing tiers",
    });
  });

  test("shows the underlying connection tool and useful input", () => {
    expect(
      describeChatToolPart({
        type: "tool-call_read_connection_tool",
        toolCallId: "call-1",
        state: "output-available",
        input: {
          connectionId: "web-search",
          toolName: "search_web",
          input: { query: "weather today in Redmond Oregon" },
        },
      }),
    ).toEqual({
      label: "Web search · Search web",
      detail: "weather today in Redmond Oregon",
    });
    expect(
      describeChatToolPart({
        type: "tool-call_connection_tool",
        state: "approval-requested",
        input: {
          connectionId: "stripe",
          toolName: "create_refund",
          input: { paymentIntent: "pi_123" },
        },
      }),
    ).toEqual({ label: "Stripe · Create refund" });
  });

  test("describes connected-tool discovery without exposing raw results", () => {
    expect(
      describeChatToolPart({
        type: "tool-search_connection_tools",
        toolCallId: "call-search",
        state: "output-available",
        input: { query: "property records" },
      }),
    ).toEqual({
      label: "Search connection tools",
      detail: "property records",
    });
    expect(
      describeChatToolPart({
        type: "tool-describe_connection_tools",
        toolCallId: "call-2",
        state: "output-available",
        input: { connectionId: "neon" },
      }),
    ).toEqual({ label: "Neon · Inspect tools" });
    expect(
      describeChatToolPart({
        type: "tool-activate_connection_tools",
        toolCallId: "call-activate",
        state: "output-available",
        input: {
          connectionId: "assessor-search",
          toolNames: ["get_property"],
        },
      }),
    ).toEqual({ label: "Assessor search · Activate tools" });
  });

  test("describes bounded operational inspection", () => {
    expect(
      describeChatToolPart({
        type: "tool-list_approvals",
        state: "output-available",
        input: { status: "pending" },
      }),
    ).toEqual({ label: "Inspect approvals", detail: "pending" });
    expect(
      describeChatToolPart({
        type: "tool-get_usage",
        state: "output-available",
        input: { contextKind: "chat" },
      }),
    ).toEqual({ label: "Inspect usage", detail: "chat" });
    expect(
      describeChatToolPart({
        type: "tool-get_application_state",
        state: "output-available",
        input: {},
      }),
    ).toEqual({ label: "Inspect application state" });
  });

  test("describes connector research using the user's intent", () => {
    expect(
      describeChatToolPart({
        type: "tool-research_connection",
        toolCallId: "call-3",
        state: "output-available",
        input: { intent: "Connect Microsoft Clarity" },
      }),
    ).toEqual({
      label: "Research connection",
      detail: "Connect Microsoft Clarity",
    });
  });

  test("accepts a GitHub Registry local-package candidate as research progress", () => {
    const part = {
      type: "tool-research_connection",
      state: "output-available",
      output: {
        status: "candidate",
        title: "Clarity was found in GitHub's MCP Registry",
        explanation: "Springroll has not verified or installed it yet.",
        instruction: "Inspect the official repository next.",
        candidate: {
          kind: "local-mcp",
          name: "Clarity",
          operator: "Microsoft",
          description: "Fetch Clarity analytics via MCP clients.",
          packageName: "@microsoft/clarity-mcp-server",
          repositoryUrl: "https://github.com/microsoft/clarity-mcp-server",
          registryUrl: "https://github.com/mcp/microsoft/clarity-mcp-server",
          credentialRequired: true,
          logo: {
            url: "https://raw.githubusercontent.com/microsoft/clarity-mcp-server/main/icon.png",
            source: "github-repository",
            kind: "asset",
            format: "raster",
          },
        },
      },
    } as const;

    expect(connectionResearchOutcomeFromToolPart(part)).toEqual(part.output);
    expect(
      visibleConnectionResearchOutcomeFromToolPart(part, [part], false),
    ).toBeUndefined();
    expect(
      connectionResearchOutcomeFromToolPart({
        ...part,
        output: {
          ...part.output,
          candidate: {
            ...part.output.candidate,
            logo: {
              ...part.output.candidate.logo,
              url: "https://example.com/unverified-icon.png",
            },
          },
        },
      }),
    ).toBeUndefined();
  });

  test("surfaces actionable connector proposal validation", () => {
    const part = {
      type: "tool-propose_local_mcp",
      state: "output-available",
      input: { packageName: "@microsoft/clarity-mcp-server" },
      output: {
        status: "invalid_input",
        issues: [{ path: "sourceUrls", message: "Expected at least two URLs" }],
      },
    };

    expect(describeChatToolPart(part)).toEqual({
      label: "Correct local MCP proposal",
      detail: "@microsoft/clarity-mcp-server",
    });
    expect(connectorProposalValidationIssuesFromToolPart(part)).toEqual([
      { path: "sourceUrls", message: "Expected at least two URLs" },
    ]);

    expect(
      describeChatToolPart({
        ...part,
        type: "tool-propose_connection",
        input: { name: "Microsoft Clarity" },
      }),
    ).toEqual({
      label: "Correct connection proposal",
      detail: "Microsoft Clarity",
    });
  });

  test("shows the official source URL being inspected", () => {
    expect(
      describeChatToolPart({
        type: "tool-inspect_connector_source",
        state: "output-available",
        input: { url: "https://clarity.microsoft.com/blog/mcp" },
      }),
    ).toEqual({
      label: "Inspect official source",
      detail: "https://clarity.microsoft.com/blog/mcp",
    });
  });

  test("accepts a complete verified connection proposal for native rendering", () => {
    expect(
      connectionResearchOutcomeFromToolPart({
        type: "tool-research_connection",
        state: "output-available",
        output: {
          status: "ready",
          proposal: {
            templateId: "neon",
            name: "Neon",
            description: "Neon databases",
            operator: "Neon",
            trust: "curated",
            variants: [
              {
                id: "oauth",
                label: "Sign in with Neon",
                recommended: true,
                credentialKind: "oauth",
                guidance: {
                  summary: "Use your Neon account.",
                  steps: ["Review access", "Sign in"],
                  docsUrl: "https://neon.com/docs/ai/neon-mcp-server",
                },
              },
            ],
          },
        },
      }),
    ).toEqual({
      status: "ready",
      proposal: {
        templateId: "neon",
        name: "Neon",
        description: "Neon databases",
        operator: "Neon",
        trust: "curated",
        variants: [
          {
            id: "oauth",
            label: "Sign in with Neon",
            recommended: true,
            credentialKind: "oauth",
            guidance: {
              summary: "Use your Neon account.",
              steps: ["Review access", "Sign in"],
              docsUrl: "https://neon.com/docs/ai/neon-mcp-server",
            },
          },
        ],
      },
    });
  });

  test("renders a host-verified local package proposal without its manifest", () => {
    const outcome = connectionResearchOutcomeFromToolPart({
      type: "tool-propose_local_mcp",
      state: "output-available",
      output: {
        status: "ready",
        proposal: {
          templateId: "research-clarity",
          name: "Microsoft Clarity",
          description: "Read Clarity analytics from this Mac.",
          operator: "Microsoft",
          trust: "package-verified",
          packageName: "@microsoft/clarity-mcp-server",
          packageVersion: "2.0.1",
          packageArgs: ["mcp"],
          manifest: {
            id: "microsoft-clarity",
            transport: { kind: "mcp-local" },
            credential: { kind: "api-key" },
          },
          sources: [
            {
              title: "Microsoft Learn",
              url: "https://learn.microsoft.com/clarity",
            },
          ],
          variants: [
            {
              id: "researched",
              label: "Connect Microsoft Clarity",
              recommended: true,
              credentialKind: "api-key",
              guidance: {
                summary: "Generate a Data Export API token.",
                steps: ["Open Settings, then Data Export."],
                docsUrl: "https://learn.microsoft.com/clarity",
              },
            },
          ],
        },
      },
    });

    expect(outcome).toMatchObject({
      status: "ready",
      proposal: {
        trust: "package-verified",
        packageName: "@microsoft/clarity-mcp-server",
        packageVersion: "2.0.1",
        packageArgs: ["mcp"],
      },
    });
    expect(JSON.stringify(outcome)).not.toContain("mcp-local");
    expect(
      describeChatToolPart({
        type: "tool-propose_local_mcp",
        state: "output-available",
        input: { packageName: "@microsoft/clarity-mcp-server" },
      }),
    ).toEqual({
      label: "Verify local MCP package",
      detail: "@microsoft/clarity-mcp-server",
    });
  });

  test("renders a provider-verified generic remote MCP proposal", () => {
    const outcome = connectionResearchOutcomeFromToolPart({
      type: "tool-propose_connection",
      state: "output-available",
      output: {
        status: "ready",
        proposal: {
          templateId: "clerk",
          name: "Clerk",
          description: "Use Clerk's SDK documentation tools.",
          operator: "Clerk",
          trust: "provider-verified",
          tools: [
            {
              name: "clerk_sdk_snippet",
              description: "Find an SDK snippet.",
              effect: "read",
            },
          ],
          variants: [
            {
              id: "researched",
              label: "Connect Clerk",
              recommended: true,
              credentialKind: "none",
              guidance: {
                summary: "Connect Clerk's provider-operated MCP server.",
                steps: ["Review the endpoint and discovered tools."],
                docsUrl:
                  "https://clerk.com/docs/guides/ai/mcp/clerk-mcp-server",
              },
            },
          ],
        },
      },
    });

    expect(outcome).toMatchObject({
      status: "ready",
      proposal: {
        name: "Clerk",
        trust: "provider-verified",
        tools: [{ name: "clerk_sdk_snippet", effect: "read" }],
      },
    });
    expect(
      describeChatToolPart({
        type: "tool-propose_connection",
        state: "output-available",
        input: { name: "Clerk" },
      }),
    ).toEqual({ label: "Verify connection", detail: "Clerk" });
  });

  test("renders a host-verified OpenAPI proposal with operations and metering", () => {
    const outcome = connectionResearchOutcomeFromToolPart({
      type: "tool-propose_openapi_connection",
      state: "output-available",
      output: {
        status: "ready",
        proposal: {
          templateId: "research-assessor-search",
          name: "Assessor Search",
          description: "Read public property records.",
          operator: "AssessorSearch",
          trust: "openapi-verified",
          api: {
            specUrl:
              "https://assessorsearch.com/property-data-api/openapi.json",
            baseUrl: "https://api.assessorsearch.com/",
            operationCount: 2,
            verification: {
              tool: "lookup_property_v1_properties_get",
              note: "A non-match uses zero credits.",
            },
            notes: ["Matched records consume credits."],
          },
          tools: [
            {
              name: "lookup_property_v1_properties_get",
              description: "Look up a property",
              effect: "read",
            },
          ],
          variants: [
            {
              id: "researched",
              label: "Connect Assessor Search",
              recommended: true,
              credentialKind: "api-key",
              guidance: {
                summary: "Use an API key.",
                steps: ["Create a key."],
                docsUrl: "https://assessorsearch.com/property-data-api/docs",
              },
            },
          ],
        },
      },
    });

    expect(outcome).toMatchObject({
      status: "ready",
      proposal: {
        trust: "openapi-verified",
        api: {
          operationCount: 2,
          verification: {
            tool: "lookup_property_v1_properties_get",
          },
        },
        tools: [
          {
            name: "lookup_property_v1_properties_get",
            description: "Look up a property",
            effect: "read",
          },
        ],
      },
    });
    expect(
      describeChatToolPart({
        type: "tool-propose_openapi_connection",
        input: {
          name: "Assessor Search",
          specUrl: "https://assessorsearch.com/property-data-api/openapi.json",
        },
      }),
    ).toEqual({ label: "Verify official API", detail: "Assessor Search" });
  });

  test("rejects malformed research output instead of rendering setup controls", () => {
    expect(
      connectionResearchOutcomeFromToolPart({
        type: "tool-research_connection",
        state: "output-available",
        output: {
          status: "ready",
          proposal: {
            templateId: "unsafe",
            name: "Unsafe",
            description: "Missing a credential rail",
            operator: "Unknown",
            variants: [{ id: "bad" }],
          },
        },
      }),
    ).toBeUndefined();
  });

  test("hides an intermediate registry miss when local research succeeds", () => {
    const miss = {
      type: "tool-research_connection",
      state: "output-available",
      output: {
        status: "not_found",
        title: "No official remote connector",
        explanation: "Checking reviewed local packages next.",
      },
    };
    const ready = {
      type: "tool-propose_local_mcp",
      state: "output-available",
      output: {
        status: "ready",
        proposal: {
          templateId: "research-firebase",
          name: "Firebase MCP",
          description: "Local Firebase tools",
          operator: "Google Firebase",
          variants: [
            {
              id: "researched",
              label: "Connect Firebase MCP",
              recommended: true,
              credentialKind: "api-key",
              guidance: {
                summary: "Use a Firebase token.",
                steps: ["Generate the token."],
                docsUrl: "https://firebase.google.com/docs/cli/mcp-server",
              },
            },
          ],
        },
      },
    };

    expect(
      visibleConnectionResearchOutcomeFromToolPart(miss, [miss], true),
    ).toBeUndefined();
    expect(
      visibleConnectionResearchOutcomeFromToolPart(miss, [miss, ready], false),
    ).toBeUndefined();
    expect(
      visibleConnectionResearchOutcomeFromToolPart(miss, [miss], false),
    ).toBeUndefined();
    expect(
      visibleConnectionResearchOutcomeFromToolPart(ready, [miss, ready], false),
    ).toMatchObject({ status: "ready" });
  });

  test("shows only the last duplicate ready connector proposal", () => {
    const output = {
      status: "ready",
      proposal: {
        templateId: "research-clarity",
        name: "Microsoft Clarity",
        description: "Read Clarity analytics.",
        operator: "Microsoft",
        variants: [
          {
            id: "researched",
            label: "Connect Microsoft Clarity",
            recommended: true,
            credentialKind: "api-key",
            guidance: {
              summary: "Use a Clarity token.",
              steps: ["Create the token."],
              docsUrl: "https://learn.microsoft.com/clarity",
            },
          },
        ],
      },
    } as const;
    const first = {
      type: "tool-propose_local_mcp",
      state: "output-available",
      output,
    } as const;
    const second = {
      type: "dynamic-tool",
      toolName: "propose_connection",
      state: "output-available",
      output: { content: [output], structuredContent: output },
    } as const;
    const parts = [first, second];

    expect(
      visibleConnectionResearchOutcomeFromToolPart(first, parts, false),
    ).toBeUndefined();
    expect(
      visibleConnectionResearchOutcomeFromToolPart(second, parts, false),
    ).toMatchObject({ status: "ready" });
    expect(
      connectionResearchOutcomeFromToolPart({
        ...second,
        toolName: "unrelated_tool",
      }),
    ).toBeUndefined();
    expect(
      connectionResearchOutcomeFromToolPart({
        ...second,
        state: "output-error",
      }),
    ).toBeUndefined();
    expect(
      connectionResearchOutcomeFromToolPart({
        ...second,
        output: { ...second.output, isError: true },
      }),
    ).toBeUndefined();
  });

  test("keeps registry and package misses in the work trace without explicit user action", () => {
    const registryMiss = {
      type: "tool-research_connection",
      state: "output-available",
      output: {
        status: "not_found",
        title: "No remote MCP",
        explanation: "Check other official paths.",
      },
    };
    const packageMiss = {
      type: "tool-propose_local_mcp",
      state: "output-available",
      output: {
        status: "not_found",
        title: "Package not verified",
        explanation: "Ask for an official URL.",
      },
    };

    expect(
      visibleConnectionResearchOutcomeFromToolPart(
        registryMiss,
        [registryMiss, packageMiss],
        false,
      ),
    ).toBeUndefined();
    expect(
      visibleConnectionResearchOutcomeFromToolPart(
        packageMiss,
        [registryMiss, packageMiss],
        false,
      ),
    ).toBeUndefined();
  });

  test("keeps registry outages in the work trace even after a final answer", () => {
    const outage = {
      type: "tool-research_connection",
      state: "output-available",
      output: {
        status: "unavailable",
        title: "Registry check unavailable",
        explanation: "Continue with official documentation.",
      },
    } as const;
    const answer = {
      type: "text",
      text: "What would you like to do with Snowflake?",
    };
    expect(connectionResearchOutcomeFromToolPart(outage)).toEqual(
      outage.output,
    );
    expect(
      visibleConnectionResearchOutcomeFromToolPart(
        outage,
        [outage, answer],
        false,
      ),
    ).toBeUndefined();
  });

  test("preserves an explicit request for a source after research is exhausted", () => {
    const blocker = {
      type: "tool-propose_connection",
      state: "output-available",
      output: {
        status: "not_found",
        title: "Official setup instructions needed",
        explanation: "Provide your organization's setup documentation.",
        userAction: "provide_source",
      },
    } as const;
    expect(
      visibleConnectionResearchOutcomeFromToolPart(blocker, [blocker], false),
    ).toEqual(blocker.output);
    expect(
      visibleConnectionResearchOutcomeFromToolPart(blocker, [blocker], true),
    ).toBeUndefined();
  });

  test("preserves an unavailable outcome that requires no user action", () => {
    const unavailable = {
      type: "tool-research_connection",
      state: "output-available",
      output: {
        status: "unavailable",
        title: "Official MCP Registry check is unavailable",
        explanation: "Springroll could not complete the remote-MCP check.",
        userAction: "none",
      },
    } as const;

    expect(
      visibleConnectionResearchOutcomeFromToolPart(
        unavailable,
        [unavailable],
        false,
      ),
    ).toEqual(unavailable.output);
  });

  test("describes direct connection actions", () => {
    expect(
      describeChatToolPart({
        type: "tool-remove_connection",
        input: { connectionId: "neon" },
      }),
    ).toEqual({ label: "Remove connection", detail: "neon" });
    expect(
      describeChatToolPart({
        type: "tool-reconnect_connection",
        input: { connectionId: "github" },
      }),
    ).toEqual({ label: "Reconnect connection", detail: "github" });
  });
});

describe("chatToolProgressLabel", () => {
  test("narrates the call in product language, not tool ids", () => {
    expect(
      chatToolProgressLabel({
        type: "tool-call_read_connection_tool",
        input: { connectionId: "neon", toolName: "run_sql" },
      }),
    ).toBe("Querying Neon");
    expect(
      chatToolProgressLabel({
        type: "tool-fetch_public_url",
        input: { url: "https://www.neon.tech/docs/billing" },
      }),
    ).toBe("Reading neon.tech");
    expect(chatToolProgressLabel({ type: "tool-search_web", input: {} })).toBe(
      "Searching the web",
    );
    expect(chatToolProgressLabel({ type: "tool-create_task", input: {} })).toBe(
      "Creating the recipe",
    );
  });

  test("falls back to the humanized tool name", () => {
    expect(
      chatToolProgressLabel({ type: "tool-update_task_notes", input: {} }),
    ).toBe("Saving recipe notes");
    expect(chatToolProgressLabel({ type: "dynamic-tool", input: {} })).toBe(
      "Dynamic tool",
    );
  });
});

describe("chatToolResultSummary", () => {
  test("reports what came back rather than that it came back", () => {
    expect(
      chatToolResultSummary({
        type: "tool-list_connections",
        state: "output-available",
        output: { connections: [{ id: "neon" }, { id: "exa" }] },
      }),
    ).toEqual({ text: "2 connections", tone: "neutral" });
    expect(
      chatToolResultSummary({
        type: "tool-get_task",
        state: "output-available",
        output: { found: false, taskId: "missing" },
      }),
    ).toEqual({ text: "not found", tone: "neutral" });
    expect(
      chatToolResultSummary({
        type: "tool-delete_task",
        state: "output-available",
        output: { deleted: true, taskId: "task-1" },
      }),
    ).toEqual({ text: "deleted", tone: "neutral" });
  });

  test("measures web reads and marks distilled ones", () => {
    expect(
      chatToolResultSummary({
        type: "tool-fetch_public_url",
        state: "output-available",
        output: { content: ["x".repeat(12_240)] },
      }),
    ).toEqual({ text: "12.2 kB", tone: "neutral" });
    expect(
      chatToolResultSummary({
        type: "tool-search_web",
        state: "output-available",
        output: {
          content: [{ type: "text", text: "y".repeat(400) }],
          structuredContent: { distilled: true },
        },
      }),
    ).toEqual({ text: "distilled · 400 characters", tone: "neutral" });
  });

  test("carries the real failure text in danger tone", () => {
    expect(
      chatToolResultSummary({
        type: "tool-call_read_connection_tool",
        state: "output-error",
        errorText: '  relation "consumption"\n  does not exist  ',
      }),
    ).toEqual({
      text: 'relation "consumption" does not exist',
      tone: "danger",
    });
    expect(
      chatToolResultSummary({
        type: "tool-propose_connection",
        state: "output-available",
        output: {
          status: "invalid_input",
          issues: [{ path: "variants.0", message: "credentialKind required" }],
        },
      }),
    ).toEqual({ text: "needs correction", tone: "danger" });
    expect(
      chatToolResultSummary({
        type: "tool-call_connection_tool",
        state: "approval-requested",
      }),
    ).toEqual({ text: "waiting for you", tone: "neutral" });
  });

  test("stays silent when the output says nothing useful", () => {
    expect(
      chatToolResultSummary({
        type: "tool-get_application_state",
        state: "output-available",
        output: { theme: "springroll-dark" },
      }),
    ).toBeUndefined();
    expect(
      chatToolResultSummary({
        type: "tool-list_runs",
        state: "input-available",
      }),
    ).toBeUndefined();
  });
});

describe("describeRunToolCall", () => {
  test("reuses chat labels for app tools and prefixes pinned connection tools", () => {
    expect(
      describeRunToolCall({
        toolName: "search_web",
        input: { query: "neon compute pricing" },
      }),
    ).toEqual({ label: "Search web", detail: "neon compute pricing" });
    expect(
      describeRunToolCall({
        toolName: "fetch_public_url",
        input: { url: "https://neon.tech/docs/billing" },
      }),
    ).toEqual({ label: "Read neon.tech", detail: "/docs/billing" });
    expect(
      describeRunToolCall({
        toolName: "run_sql",
        sourceId: "neon",
        input: { sql: "select 1" },
      }),
    ).toEqual({ label: "Neon · Run sql", detail: "select 1" });
    expect(describeRunToolCall({ toolName: "update_task_notes" })).toEqual({
      label: "Save recipe notes",
    });
  });
});

describe("runToolProgressLabel", () => {
  test("speaks the same verbs as chat", () => {
    expect(runToolProgressLabel({ toolName: "search_web" })).toBe(
      "Searching the web",
    );
    expect(
      runToolProgressLabel({
        toolName: "fetch_public_url",
        input: { url: "https://neon.tech/docs" },
      }),
    ).toBe("Reading neon.tech");
    expect(
      runToolProgressLabel({
        toolName: "run_sql",
        sourceId: "neon",
        label: "Neon · Run sql",
      }),
    ).toBe("Querying Neon");
    expect(runToolProgressLabel({ toolName: "update_task_notes" })).toBe(
      "Saving recipe notes",
    );
  });
});

describe("saved recipe receipts", () => {
  const task = { id: "recipe/123", name: "Daily briefing", enabled: false };
  const part = {
    type: "tool-create_task",
    state: "output-available",
    output: task,
  };

  test("links to the saved recipe, including paused recipes", () => {
    expect(savedRecipeFromToolPart(part)).toEqual({
      label: "Recipe created",
      name: "Daily briefing",
      href: "/recipes/recipe%2F123",
    });
  });

  test("recognizes dynamic and wrapped update results from subscription runtimes", () => {
    for (const output of [
      task,
      { structuredContent: task },
      { content: [{ type: "text", text: JSON.stringify(task) }] },
    ]) {
      expect(
        savedRecipeFromToolPart({
          type: "dynamic-tool",
          toolName: "update_task",
          state: "output-available",
          output,
        })?.label,
      ).toBe("Recipe updated");
    }
  });

  test("does not claim success for pending, failed, malformed, or unrelated calls", () => {
    for (const state of [
      "input-streaming",
      "input-available",
      "output-error",
      "output-denied",
    ]) {
      expect(savedRecipeFromToolPart({ ...part, state })).toBeUndefined();
    }
    for (const output of [
      undefined,
      { error: "Save failed", ...task },
      { isError: true, structuredContent: task },
      { status: "invalid_input", issues: [] },
      { truncated: true, preview: JSON.stringify(task) },
      { ...task, id: "" },
      { ...task, enabled: undefined },
    ]) {
      expect(savedRecipeFromToolPart({ ...part, output })).toBeUndefined();
    }
    expect(
      savedRecipeFromToolPart({ ...part, type: "tool-get_task" }),
    ).toBeUndefined();
  });
});

test("Google model compatibility notices are visible instead of a generic match count", () => {
  const output = {
    matches: [{ toolName: "search_threads" }],
    googleDataAccess: {
      status: "unavailable",
      message: "Choose a ZDR-available model for Google data.",
    },
  };
  for (const value of [output, { structuredContent: output }]) {
    expect(
      chatToolResultSummary({
        type: "tool-search_connection_tools",
        state: "output-available",
        output: value,
      }),
    ).toEqual({ text: output.googleDataAccess.message, tone: "danger" });
  }
});
