import {
  type ConnectorManifest,
  parseConnectorManifest,
} from "@springroll/kernel";
import { microsoftConnectorManifests } from "./microsoft-connectors.ts";

export interface ConnectorRegistryMetadata {
  readonly operator: string;
  readonly actionable?: boolean;
}

const gmailComposeInputSchema = {
  type: "object",
  properties: {
    to: { type: "string" },
    subject: { type: "string" },
    body: { type: "string" },
    cc: { type: "string" },
    bcc: { type: "string" },
    threadId: { type: "string" },
    inReplyTo: { type: "string" },
  },
  required: ["to", "subject", "body"],
  additionalProperties: false,
} as const;

const googleUserinfoIdentity = {
  endpoint: "https://www.googleapis.com/oauth2/v2/userinfo",
  field: "email",
} as const;

const googleUserinfoScope =
  "https://www.googleapis.com/auth/userinfo.email" as const;

const calendarDateTimeSchema = {
  type: "object",
  properties: {
    dateTime: { type: "string" },
    date: { type: "string" },
    timeZone: { type: "string" },
  },
  additionalProperties: false,
} as const;

const registryValues: readonly (readonly [
  ConnectorManifest,
  ConnectorRegistryMetadata,
])[] = [
  ...microsoftConnectorManifests.map(
    (manifest) =>
      [manifest, { operator: "Microsoft", actionable: false }] as const,
  ),
  [
    {
      id: "github",
      name: "GitHub",
      blurb:
        "<b>Code</b> — work with repositories through GitHub's official MCP server.",
      tags: ["code"],
      transport: {
        kind: "mcp-remote",
        endpoint: "https://api.githubcopilot.com/mcp/",
      },
      credential: {
        kind: "oauth",
        accountIdentity: {
          endpoint: "https://api.github.com/user",
          field: "login",
        },
      },
    },
    { operator: "GitHub", actionable: false },
  ],
  [
    {
      id: "jira",
      name: "Jira",
      blurb:
        "<b>Planning</b> — work with Jira through Atlassian's official MCP server.",
      tags: ["planning"],
      transport: {
        kind: "mcp-remote",
        endpoint: "https://mcp.atlassian.com/v1/mcp/authv2",
      },
      credential: { kind: "oauth" },
    },
    { operator: "Atlassian" },
  ],
  [
    {
      id: "slack",
      name: "Slack",
      blurb:
        "<b>Messages</b> — work with conversations through Slack's official MCP server.",
      tags: ["messaging"],
      transport: {
        kind: "mcp-remote",
        endpoint: "https://mcp.slack.com/mcp",
      },
      credential: {
        kind: "oauth",
        scopes: [
          "channels:history",
          "channels:read",
          "files:read",
          "groups:history",
          "groups:read",
          "im:history",
          "im:read",
          "mpim:history",
          "mpim:read",
          "search:read.files",
          "search:read.im",
          "search:read.mpim",
          "search:read.private",
          "search:read.public",
          "search:read.users",
          "users:read",
          "users:read.email",
        ],
        accountIdentity: {
          endpoint: "https://slack.com/api/auth.test",
          field: "team",
        },
      },
    },
    { operator: "Slack", actionable: false },
  ],
  [
    {
      id: "linear",
      name: "Linear",
      blurb:
        "<b>Planning</b> — work with issues and projects through Linear's official MCP server.",
      tags: ["planning"],
      transport: {
        kind: "mcp-remote",
        endpoint: "https://mcp.linear.app/mcp",
      },
      credential: { kind: "oauth" },
    },
    { operator: "Linear" },
  ],
  [
    {
      id: "gmail",
      name: "Gmail",
      blurb: "<b>Email</b> — connect your mail through Google's Gmail API.",
      tags: ["email", "google"],
      transport: {
        kind: "http-api",
        baseUrl: "https://gmail.googleapis.com/gmail/v1",
        operations: [
          {
            name: "search_threads",
            description:
              "Search or list Gmail email messages and threads, including recent inbox mail. For latest inbox emails use query in:inbox and maxResults, then get_thread with a returned thread ID. Supports Gmail search operators and pagination.",
            method: "GET",
            path: "/users/me/threads",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string" },
                maxResults: { type: "integer", minimum: 1, maximum: 100 },
                pageToken: { type: "string" },
                includeSpamTrash: { type: "boolean" },
              },
              additionalProperties: false,
            },
            parameters: [
              {
                input: "query",
                name: "q",
                location: "query",
                required: false,
              },
              {
                input: "maxResults",
                name: "maxResults",
                location: "query",
                required: false,
              },
              {
                input: "pageToken",
                name: "pageToken",
                location: "query",
                required: false,
              },
              {
                input: "includeSpamTrash",
                name: "includeSpamTrash",
                location: "query",
                required: false,
              },
            ],
            effect: "read",
          },
          {
            name: "get_thread",
            description:
              "Read a Gmail thread with its messages, headers, bodies, and attachments metadata.",
            method: "GET",
            path: "/users/me/threads/{threadId}",
            inputSchema: {
              type: "object",
              properties: {
                threadId: { type: "string" },
                format: {
                  type: "string",
                  enum: ["full", "metadata", "minimal"],
                },
              },
              required: ["threadId"],
              additionalProperties: false,
            },
            parameters: [
              {
                input: "threadId",
                name: "threadId",
                location: "path",
                required: true,
              },
              {
                input: "format",
                name: "format",
                location: "query",
                required: false,
              },
            ],
            effect: "read",
          },
          {
            name: "get_message",
            description:
              "Read one Gmail message with headers, body, and attachments metadata.",
            method: "GET",
            path: "/users/me/messages/{messageId}",
            inputSchema: {
              type: "object",
              properties: {
                messageId: { type: "string" },
                format: {
                  type: "string",
                  enum: ["full", "metadata", "minimal", "raw"],
                },
              },
              required: ["messageId"],
              additionalProperties: false,
            },
            parameters: [
              {
                input: "messageId",
                name: "messageId",
                location: "path",
                required: true,
              },
              {
                input: "format",
                name: "format",
                location: "query",
                required: false,
              },
            ],
            effect: "read",
          },
          {
            name: "list_drafts",
            description: "List Gmail drafts with pagination.",
            method: "GET",
            path: "/users/me/drafts",
            inputSchema: {
              type: "object",
              properties: {
                maxResults: { type: "integer", minimum: 1, maximum: 100 },
                pageToken: { type: "string" },
                query: { type: "string" },
                includeSpamTrash: { type: "boolean" },
              },
              additionalProperties: false,
            },
            parameters: [
              {
                input: "maxResults",
                name: "maxResults",
                location: "query",
                required: false,
              },
              {
                input: "pageToken",
                name: "pageToken",
                location: "query",
                required: false,
              },
              {
                input: "query",
                name: "q",
                location: "query",
                required: false,
              },
              {
                input: "includeSpamTrash",
                name: "includeSpamTrash",
                location: "query",
                required: false,
              },
            ],
            effect: "read",
          },
          {
            name: "list_labels",
            description: "List the labels in the connected Gmail account.",
            method: "GET",
            path: "/users/me/labels",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            effect: "read",
          },
          {
            name: "create_draft",
            description:
              "Create a Gmail draft. Review it in Gmail or send it later.",
            method: "POST",
            path: "/users/me/drafts",
            inputSchema: gmailComposeInputSchema,
            bodyEncoding: "gmail-rfc822-draft",
            effect: "write",
            permissionSet: "drafts",
          },
          {
            name: "send_message",
            description: "Send an email as the connected Gmail account.",
            method: "POST",
            path: "/users/me/messages/send",
            inputSchema: gmailComposeInputSchema,
            bodyEncoding: "gmail-rfc822",
            effect: "write",
            permissionSet: "send",
          },
        ],
      },
      credential: {
        kind: "oauth",
        scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
        accountIdentity: {
          endpoint: "https://gmail.googleapis.com/gmail/v1/users/me/profile",
          field: "emailAddress",
        },
        permissionSets: [
          {
            id: "read",
            label: "Read mail",
            summary: "Search and read messages, threads, drafts, and labels.",
            scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
            required: true,
          },
          {
            id: "drafts",
            label: "Save drafts",
            summary:
              "Save drafts in Gmail. Google also permits sending with this access.",
            scopes: ["https://www.googleapis.com/auth/gmail.compose"],
            requestByDefault: true,
          },
          {
            id: "send",
            label: "Send mail",
            summary: "Send, reply, and forward as this account.",
            scopes: ["https://www.googleapis.com/auth/gmail.send"],
            requestByDefault: true,
          },
        ],
      },
      tools: {
        allow: [
          "create_draft",
          "get_message",
          "get_thread",
          "list_drafts",
          "list_labels",
          "search_threads",
          "send_message",
        ],
        risk: {
          create_draft: {
            effect: "write",
            openWorld: true,
            idempotent: false,
          },
          get_message: { effect: "read", openWorld: true, idempotent: true },
          get_thread: { effect: "read", openWorld: true, idempotent: true },
          list_drafts: { effect: "read", openWorld: true, idempotent: true },
          list_labels: { effect: "read", openWorld: true, idempotent: true },
          search_threads: {
            effect: "read",
            openWorld: true,
            idempotent: true,
          },
          send_message: {
            effect: "write",
            openWorld: true,
            idempotent: false,
          },
        },
      },
      probe: { tool: "list_labels", input: {} },
    },
    { operator: "Google", actionable: false },
  ],
  [
    {
      id: "google-calendar",
      name: "Google Calendar",
      blurb:
        "<b>Calendar</b> — search calendars and manage events through Google's Calendar API.",
      tags: ["calendar", "google"],
      transport: {
        kind: "http-api",
        baseUrl: "https://www.googleapis.com/calendar/v3",
        operations: [
          {
            name: "list_calendars",
            description:
              "List calendars the connected Google account can access.",
            method: "GET",
            path: "/users/me/calendarList",
            inputSchema: {
              type: "object",
              properties: {
                maxResults: { type: "integer", minimum: 1, maximum: 250 },
                pageToken: { type: "string" },
              },
              additionalProperties: false,
            },
            parameters: [
              {
                input: "maxResults",
                name: "maxResults",
                location: "query",
                required: false,
              },
              {
                input: "pageToken",
                name: "pageToken",
                location: "query",
                required: false,
              },
            ],
            effect: "read",
          },
          {
            name: "list_events",
            description:
              "Search events on one calendar by time range and keyword. Use primary for the account's main calendar.",
            method: "GET",
            path: "/calendars/{calendarId}/events",
            inputSchema: {
              type: "object",
              properties: {
                calendarId: { type: "string" },
                timeMin: { type: "string" },
                timeMax: { type: "string" },
                query: { type: "string" },
                maxResults: { type: "integer", minimum: 1, maximum: 100 },
                pageToken: { type: "string" },
              },
              required: ["calendarId"],
              additionalProperties: false,
            },
            parameters: [
              {
                input: "calendarId",
                name: "calendarId",
                location: "path",
                required: true,
              },
              {
                input: "timeMin",
                name: "timeMin",
                location: "query",
                required: false,
              },
              {
                input: "timeMax",
                name: "timeMax",
                location: "query",
                required: false,
              },
              {
                input: "query",
                name: "q",
                location: "query",
                required: false,
              },
              {
                input: "maxResults",
                name: "maxResults",
                location: "query",
                required: false,
              },
              {
                input: "pageToken",
                name: "pageToken",
                location: "query",
                required: false,
              },
            ],
            fixedQuery: { singleEvents: "true" },
            effect: "read",
          },
          {
            name: "get_event",
            description:
              "Read one calendar event including attendees, location, and description.",
            method: "GET",
            path: "/calendars/{calendarId}/events/{eventId}",
            inputSchema: {
              type: "object",
              properties: {
                calendarId: { type: "string" },
                eventId: { type: "string" },
              },
              required: ["calendarId", "eventId"],
              additionalProperties: false,
            },
            parameters: [
              {
                input: "calendarId",
                name: "calendarId",
                location: "path",
                required: true,
              },
              {
                input: "eventId",
                name: "eventId",
                location: "path",
                required: true,
              },
            ],
            effect: "read",
          },
          {
            name: "create_event",
            description: "Create a calendar event.",
            method: "POST",
            path: "/calendars/{calendarId}/events",
            inputSchema: {
              type: "object",
              properties: {
                calendarId: { type: "string" },
                summary: { type: "string" },
                description: { type: "string" },
                location: { type: "string" },
                start: calendarDateTimeSchema,
                end: calendarDateTimeSchema,
                attendees: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { email: { type: "string" } },
                    required: ["email"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["calendarId", "summary", "start", "end"],
              additionalProperties: false,
            },
            parameters: [
              {
                input: "calendarId",
                name: "calendarId",
                location: "path",
                required: true,
              },
            ],
            bodyEncoding: "json",
            effect: "write",
            permissionSet: "write",
          },
          {
            name: "update_event",
            description:
              "Update a calendar event or RSVP by setting an attendee responseStatus.",
            method: "PATCH",
            path: "/calendars/{calendarId}/events/{eventId}",
            inputSchema: {
              type: "object",
              properties: {
                calendarId: { type: "string" },
                eventId: { type: "string" },
                summary: { type: "string" },
                description: { type: "string" },
                location: { type: "string" },
                start: calendarDateTimeSchema,
                end: calendarDateTimeSchema,
                attendees: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      email: { type: "string" },
                      responseStatus: {
                        type: "string",
                        enum: [
                          "needsAction",
                          "declined",
                          "tentative",
                          "accepted",
                        ],
                      },
                    },
                    required: ["email"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["calendarId", "eventId"],
              additionalProperties: false,
            },
            parameters: [
              {
                input: "calendarId",
                name: "calendarId",
                location: "path",
                required: true,
              },
              {
                input: "eventId",
                name: "eventId",
                location: "path",
                required: true,
              },
            ],
            bodyEncoding: "json",
            effect: "write",
            permissionSet: "write",
          },
          {
            name: "delete_event",
            description: "Delete a calendar event.",
            method: "DELETE",
            path: "/calendars/{calendarId}/events/{eventId}",
            inputSchema: {
              type: "object",
              properties: {
                calendarId: { type: "string" },
                eventId: { type: "string" },
              },
              required: ["calendarId", "eventId"],
              additionalProperties: false,
            },
            parameters: [
              {
                input: "calendarId",
                name: "calendarId",
                location: "path",
                required: true,
              },
              {
                input: "eventId",
                name: "eventId",
                location: "path",
                required: true,
              },
            ],
            effect: "destructive",
            permissionSet: "write",
          },
        ],
      },
      credential: {
        kind: "oauth",
        scopes: [
          "https://www.googleapis.com/auth/calendar.readonly",
          googleUserinfoScope,
        ],
        accountIdentity: googleUserinfoIdentity,
        permissionSets: [
          {
            id: "read",
            label: "Read calendar",
            summary: "Search and read calendars and events.",
            scopes: [
              "https://www.googleapis.com/auth/calendar.readonly",
              googleUserinfoScope,
            ],
            required: true,
          },
          {
            id: "write",
            label: "Manage events",
            summary: "Create, update, RSVP, and delete events.",
            scopes: ["https://www.googleapis.com/auth/calendar.events"],
            requestByDefault: true,
          },
        ],
      },
      tools: {
        allow: [
          "create_event",
          "delete_event",
          "get_event",
          "list_calendars",
          "list_events",
          "update_event",
        ],
        risk: {
          create_event: {
            effect: "write",
            openWorld: true,
            idempotent: false,
          },
          delete_event: {
            effect: "destructive",
            openWorld: true,
            idempotent: false,
          },
          get_event: { effect: "read", openWorld: true, idempotent: true },
          list_calendars: { effect: "read", openWorld: true, idempotent: true },
          list_events: { effect: "read", openWorld: true, idempotent: true },
          update_event: {
            effect: "write",
            openWorld: true,
            idempotent: false,
          },
        },
      },
      probe: { tool: "list_calendars", input: {} },
    },
    { operator: "Google", actionable: false },
  ],
  [
    {
      id: "google-drive",
      name: "Google Drive",
      blurb:
        "<b>Files</b> — search and read Drive files through Google's Drive API.",
      tags: ["files", "google"],
      transport: {
        kind: "http-api",
        baseUrl: "https://www.googleapis.com/drive/v3",
        operations: [
          {
            name: "search_files",
            description:
              "Search Drive files by Drive query syntax, title, or folder.",
            method: "GET",
            path: "/files",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string" },
                pageSize: { type: "integer", minimum: 1, maximum: 100 },
                pageToken: { type: "string" },
              },
              additionalProperties: false,
            },
            parameters: [
              {
                input: "query",
                name: "q",
                location: "query",
                required: false,
              },
              {
                input: "pageSize",
                name: "pageSize",
                location: "query",
                required: false,
              },
              {
                input: "pageToken",
                name: "pageToken",
                location: "query",
                required: false,
              },
            ],
            fixedQuery: {
              fields:
                "files(id,name,mimeType,modifiedTime,parents,webViewLink,size,trashed),nextPageToken",
            },
            effect: "read",
          },
          {
            name: "get_file",
            description: "Read Drive file metadata including type and links.",
            method: "GET",
            path: "/files/{fileId}",
            inputSchema: {
              type: "object",
              properties: { fileId: { type: "string" } },
              required: ["fileId"],
              additionalProperties: false,
            },
            parameters: [
              {
                input: "fileId",
                name: "fileId",
                location: "path",
                required: true,
              },
            ],
            effect: "read",
          },
          {
            name: "export_file",
            description:
              "Export a Google Doc, Sheet, or Slide as text, CSV, or another MIME type.",
            method: "GET",
            path: "/files/{fileId}/export",
            inputSchema: {
              type: "object",
              properties: {
                fileId: { type: "string" },
                mimeType: { type: "string" },
              },
              required: ["fileId", "mimeType"],
              additionalProperties: false,
            },
            parameters: [
              {
                input: "fileId",
                name: "fileId",
                location: "path",
                required: true,
              },
              {
                input: "mimeType",
                name: "mimeType",
                location: "query",
                required: true,
              },
            ],
            effect: "read",
          },
          {
            name: "download_file",
            description:
              "Download a binary Drive file as text. Use export_file for Google Docs, Sheets, and Slides.",
            method: "GET",
            path: "/files/{fileId}",
            inputSchema: {
              type: "object",
              properties: { fileId: { type: "string" } },
              required: ["fileId"],
              additionalProperties: false,
            },
            parameters: [
              {
                input: "fileId",
                name: "fileId",
                location: "path",
                required: true,
              },
            ],
            fixedQuery: { alt: "media" },
            effect: "read",
          },
        ],
      },
      credential: {
        kind: "oauth",
        scopes: [
          "https://www.googleapis.com/auth/drive.readonly",
          googleUserinfoScope,
        ],
        accountIdentity: googleUserinfoIdentity,
        permissionSets: [
          {
            id: "read",
            label: "Read files",
            summary: "Search and read Drive files, Docs, Sheets, and Slides.",
            scopes: [
              "https://www.googleapis.com/auth/drive.readonly",
              googleUserinfoScope,
            ],
            required: true,
          },
        ],
      },
      tools: {
        allow: ["download_file", "export_file", "get_file", "search_files"],
        risk: {
          download_file: { effect: "read", openWorld: true, idempotent: true },
          export_file: { effect: "read", openWorld: true, idempotent: true },
          get_file: { effect: "read", openWorld: true, idempotent: true },
          search_files: { effect: "read", openWorld: true, idempotent: true },
        },
      },
      probe: { tool: "search_files", input: { pageSize: 1 } },
    },
    { operator: "Google", actionable: false },
  ],
  [
    {
      id: "notion",
      name: "Notion",
      blurb:
        "<b>Knowledge</b> — search and update workspace content through Notion's official MCP server.",
      tags: ["knowledge", "documents"],
      transport: {
        kind: "mcp-remote",
        endpoint: "https://mcp.notion.com/mcp",
      },
      credential: { kind: "oauth" },
    },
    { operator: "Notion" },
  ],
  [
    {
      id: "stripe",
      name: "Stripe",
      blurb:
        "<b>Payments</b> — inspect and manage Stripe resources through Stripe's official MCP server.",
      tags: ["payments", "finance"],
      transport: {
        kind: "mcp-remote",
        endpoint: "https://mcp.stripe.com",
      },
      credential: { kind: "oauth" },
    },
    { operator: "Stripe" },
  ],
];

export const curatedConnectorManifests: readonly ConnectorManifest[] =
  registryValues.map(([manifest]) => parseConnectorManifest(manifest));

export const connectorRegistryMetadata = new Map(
  registryValues.map(([manifest, metadata]) => [manifest.id, metadata]),
);
