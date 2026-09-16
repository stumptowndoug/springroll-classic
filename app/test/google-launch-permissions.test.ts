import { describe, expect, test } from "bun:test";
import {
  grantedOAuthPermissionSetIds,
  nextOAuthPermissionSetIds,
  oauthScopeForPermissionSets,
  parseConnectorManifest,
} from "@springroll/kernel";
import { curatedConnectorManifests } from "../src/server/connector-registry.ts";

function manifest(id: string) {
  const source = curatedConnectorManifests.find((item) => item.id === id);
  if (!source) throw new Error(`Missing ${id}`);
  return parseConnectorManifest(source);
}

describe("Google OAuth permissions", () => {
  test("normal setup exposes the submitted Gmail and Calendar permissions", () => {
    expect(
      oauthScopeForPermissionSets(manifest("gmail"), [
        "read",
        "drafts",
        "send",
      ]),
    ).toBe(
      "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.send",
    );
    expect(
      oauthScopeForPermissionSets(manifest("google-calendar"), [
        "read",
        "write",
      ]),
    ).toContain("auth/calendar.events");
    expect(() =>
      nextOAuthPermissionSetIds(manifest("gmail"), {}, "organize"),
    ).toThrow();
    expect(() =>
      nextOAuthPermissionSetIds(manifest("google-drive"), {}, "write"),
    ).toThrow();
    expect(manifest("google-drive").tools?.allow).toEqual([
      "download_file",
      "export_file",
      "get_file",
      "search_files",
    ]);
  });

  test("requests all supported Google permissions initially without changing existing grants", () => {
    const gmail = manifest("gmail");
    expect(nextOAuthPermissionSetIds(gmail, undefined)).toEqual([
      "read",
      "drafts",
      "send",
    ]);
    expect(
      nextOAuthPermissionSetIds(manifest("google-calendar"), undefined),
    ).toEqual(["read", "write"]);
    expect(
      nextOAuthPermissionSetIds(manifest("google-drive"), undefined),
    ).toEqual(["read"]);
    expect(
      grantedOAuthPermissionSetIds({ grantedPermissionSets: ["read"] }, gmail),
    ).toEqual(["read"]);
    expect(grantedOAuthPermissionSetIds({}, gmail)).toEqual(["read"]);
    expect(
      nextOAuthPermissionSetIds(gmail, { grantedPermissionSets: ["read"] }),
    ).toEqual(["read", "drafts", "send"]);
  });

  test("does not restrict Microsoft write permissions", () => {
    expect(
      oauthScopeForPermissionSets(manifest("outlook"), ["read", "write"]),
    ).toContain("Mail.Send");
  });
});
