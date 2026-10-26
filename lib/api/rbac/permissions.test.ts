import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getPermissionsByRole,
  hasAllPermissions,
  isDataroomScopedRole,
} from "./permissions";

describe("getPermissionsByRole", () => {
  it("gives ADMIN members.write and sso.write", () => {
    const p = getPermissionsByRole("ADMIN");
    assert.ok(p.has("members.write"));
    assert.ok(p.has("sso.write"));
  });

  it("denies MANAGER members.write and sso.write only", () => {
    const p = getPermissionsByRole("MANAGER");
    assert.ok(!p.has("members.write"));
    assert.ok(!p.has("sso.write"));
    assert.ok(p.has("tokens.write"));
  });

  it("denies MEMBER the admin-style actions", () => {
    const p = getPermissionsByRole("MEMBER");
    for (const denied of [
      "members.write",
      "tokens.write",
      "webhooks.write",
      "domains.write",
      "sso.write",
    ] as const) {
      assert.ok(!p.has(denied), `MEMBER should not have ${denied}`);
    }
    assert.ok(p.has("documents.read"));
  });

  it("limits DATAROOM_MEMBER to the dataroom actions", () => {
    const p = getPermissionsByRole("DATAROOM_MEMBER");
    assert.ok(p.has("datarooms.read"));
    assert.ok(!p.has("documents.read"));
    assert.ok(!p.has("analytics.team"));
    assert.ok(!p.has("team.write"));
    assert.ok(!p.has("members.write"));
  });

  it("denies everything to an unknown role", () => {
    assert.equal(getPermissionsByRole("SOMETHING_NEW").size, 0);
  });
});

describe("helpers", () => {
  it("hasAllPermissions needs every action", () => {
    assert.ok(hasAllPermissions("ADMIN", ["members.write", "sso.write"]));
    assert.ok(!hasAllPermissions("MANAGER", ["links.write", "members.write"]));
    assert.ok(hasAllPermissions("MEMBER", []));
  });

  it("only DATAROOM_MEMBER is dataroom-scoped", () => {
    assert.ok(isDataroomScopedRole("DATAROOM_MEMBER"));
    assert.ok(!isDataroomScopedRole("ADMIN"));
    assert.ok(!isDataroomScopedRole("MEMBER"));
  });
});
