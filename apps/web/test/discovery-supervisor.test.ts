import { test } from "node:test";
import assert from "node:assert/strict";

import { DiscoverySupervisor } from "../src/receiver/discovery-supervisor.js";

test("starts and stops interval based on client count", async () => {
  let calls = 0;
  const fakeDiscover = async () => {
    calls += 1;
    return { startedAt: "", finishedAt: "", durationMs: 0, sources: [], error: null };
  };
  const supervisor = new DiscoverySupervisor({ intervalMs: 25, discover: fakeDiscover });

  supervisor.notifyClientConnected();
  await new Promise((r) => setTimeout(r, 90));
  assert.ok(calls >= 2, `expected at least 2 calls, got ${calls}`);

  supervisor.notifyClientDisconnected();
  const snapshot = calls;
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(calls, snapshot, "should not run more discoveries after last client disconnects");

  supervisor.dispose();
});

test("guards against overlapping discoveries", async () => {
  let inFlight = 0;
  let maxConcurrent = 0;
  const slowDiscover = async () => {
    inFlight += 1;
    maxConcurrent = Math.max(maxConcurrent, inFlight);
    await new Promise((r) => setTimeout(r, 40));
    inFlight -= 1;
    return { startedAt: "", finishedAt: "", durationMs: 0, sources: [], error: null };
  };
  const supervisor = new DiscoverySupervisor({ intervalMs: 10, discover: slowDiscover });
  supervisor.notifyClientConnected();
  await new Promise((r) => setTimeout(r, 120));
  supervisor.notifyClientDisconnected();
  await new Promise((r) => setTimeout(r, 60)); // let outstanding finish
  assert.equal(maxConcurrent, 1, "discoveries must not overlap");

  supervisor.dispose();
});

test("multiple clients only stop loop on last disconnect", async () => {
  let calls = 0;
  const fakeDiscover = async () => {
    calls += 1;
    return { startedAt: "", finishedAt: "", durationMs: 0, sources: [], error: null };
  };
  const supervisor = new DiscoverySupervisor({ intervalMs: 30, discover: fakeDiscover });

  supervisor.notifyClientConnected();
  supervisor.notifyClientConnected();
  await new Promise((r) => setTimeout(r, 80));
  const afterTwoClients = calls;
  supervisor.notifyClientDisconnected();
  // loop should still run because one client remains
  await new Promise((r) => setTimeout(r, 90));
  assert.ok(calls > afterTwoClients, "loop should continue with remaining client");

  supervisor.notifyClientDisconnected();
  const afterAll = calls;
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(calls, afterAll, "loop should stop after all clients disconnect");

  supervisor.dispose();
});

test("dispose is idempotent and stops the timer", () => {
  let calls = 0;
  const supervisor = new DiscoverySupervisor({
    intervalMs: 10,
    discover: async () => { calls += 1; return { startedAt: "", finishedAt: "", durationMs: 0, sources: [], error: null }; }
  });
  supervisor.notifyClientConnected();
  supervisor.dispose();
  supervisor.dispose(); // no throw
  const snapshot = calls;
  // wait — should not call again
  return new Promise<void>((resolve) => setTimeout(() => {
    assert.equal(calls, snapshot);
    resolve();
  }, 40));
});
