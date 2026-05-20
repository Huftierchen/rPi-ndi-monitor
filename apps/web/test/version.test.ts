import { test } from "node:test";
import assert from "node:assert/strict";

import { buildTestApp } from "./helpers/build-test-app.js";

test("GET /api/version returns ok envelope with a non-empty version string", async () => {
  const { app, cleanup } = await buildTestApp();
  try {
    const res = await app.inject({ method: "GET", url: "/api/version" });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.ok, true);
    assert.equal(typeof body.data.version, "string");
    assert.ok(body.data.version.length > 0);
  } finally {
    await cleanup();
  }
});
