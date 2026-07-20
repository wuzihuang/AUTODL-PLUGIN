import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("error", reject);
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      resolve(raw ? JSON.parse(raw) : undefined);
    });
  });
}

test("MCP exposes and routes every documented AutoDL operation", async (t) => {
  const hits = [];
  const mock = http.createServer(async (request, response) => {
    const body = await parseJsonBody(request);
    const url = new URL(request.url, "http://127.0.0.1");
    hits.push({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body,
      authorization: request.headers.authorization,
    });

    response.setHeader("Content-Type", "application/json");
    if (url.pathname === "/autopanel/v1/api/monitor/current") {
      response.end(JSON.stringify({ success: true, data: { cpu_usage: 1, gpu_list: [] } }));
      return;
    }
    if (url.pathname === "/api/v1/dev/instance/pro/snapshot") {
      response.end(
        JSON.stringify({
          code: "Success",
          data: { root_password: "server-password", jupyter_token: "server-token", status: "running" },
          msg: "",
          request_id: "mock-snapshot",
        }),
      );
      return;
    }
    response.end(
      JSON.stringify({
        code: "Success",
        data: { method: request.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body },
        msg: "",
        request_id: "mock-request",
      }),
    );
  });
  const address = await listen(mock);
  t.after(() => close(mock));
  const origin = `http://127.0.0.1:${address.port}`;

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["src/index.mjs"],
    cwd: packageRoot,
    stderr: "pipe",
    env: {
      ...process.env,
      AUTODL_TOKEN: "contract-test-token",
      AUTODL_BASE_URL: origin,
      AUTODL_WEB_BASE_URL: origin,
      AUTODL_METRICS_URL: `${origin}/autopanel/v1/api/monitor/current`,
    },
  });
  const client = new Client({ name: "autodl-contract-test", version: "1.0.0" });
  await client.connect(transport);
  t.after(() => client.close());

  const listed = await client.listTools();
  assert.equal(listed.tools.length, 26);
  const toolNames = new Set(listed.tools.map((tool) => tool.name));
  for (const required of [
    "autodl_wallet_balance",
    "autodl_pro_create_instance",
    "autodl_pro_instance_snapshot",
    "autodl_esd_create_deployment",
    "autodl_esd_gpu_stock",
    "autodl_send_wechat_message",
    "autodl_local_metrics",
  ]) {
    assert(toolNames.has(required), `missing tool ${required}`);
  }

  const preview = await client.callTool({
    name: "autodl_pro_release_instance",
    arguments: { instance_uuid: "pro-preview", confirm: false },
  });
  assert.equal(preview.structuredContent.executed, false);
  assert.equal(hits.length, 0, "unconfirmed mutation must not reach the network");

  const calls = [
    ["autodl_wallet_balance", {}],
    ["autodl_switch_exclusive_nfs", { data_center: "westDC2", mountable: 1, confirm: true }],
    [
      "autodl_pro_create_instance",
      {
        req_gpu_amount: 1,
        expand_system_disk_by_gb: 0,
        gpu_spec_uuid: "pro6000-p",
        image_uuid: "base-image-l2t43iu6uk",
        cuda_v_from: 118,
        confirm: true,
      },
    ],
    ["autodl_pro_instance_snapshot", { instance_uuid: "pro-test" }],
    ["autodl_pro_instance_status", { instance_uuid: "pro-test" }],
    ["autodl_pro_list_instances", { page_index: 1, page_size: 10 }],
    ["autodl_pro_power_on", { instance_uuid: "pro-test", payload: "gpu", confirm: true }],
    ["autodl_pro_power_off", { instance_uuid: "pro-test", confirm: true }],
    ["autodl_pro_release_instance", { instance_uuid: "pro-test", confirm: true }],
    ["autodl_pro_save_image", { instance_uuid: "pro-test", image_name: "test", confirm: true }],
    ["autodl_pro_list_private_images", { page_index: 1, page_size: 10 }],
    ["autodl_esd_list_private_images", { page_index: 1, page_size: 10 }],
    [
      "autodl_esd_create_deployment",
      {
        name: "contract-test",
        deployment_type: "ReplicaSet",
        replica_num: 1,
        container_template: {
          dc_list: ["westDC2"],
          cuda_v_from: 118,
          cuda_v_to: 128,
          gpu_name_set: ["RTX 4090"],
          gpu_num: 1,
          memory_size_from: 1,
          memory_size_to: 256,
          cpu_num_from: 1,
          cpu_num_to: 100,
          price_from: 100,
          price_to: 9000,
          image_uuid: "base-image-l2t43iu6uk",
          cmd: "sleep 10",
        },
        confirm: true,
      },
    ],
    ["autodl_esd_list_deployments", { page_index: 1, page_size: 10 }],
    [
      "autodl_esd_list_container_events",
      { deployment_uuid: "dep-test", page_index: 1, page_size: 10, offset: 0 },
    ],
    ["autodl_esd_list_containers", { deployment_uuid: "dep-test", page_index: 1, page_size: 10 }],
    [
      "autodl_esd_stop_container",
      { deployment_container_uuid: "dep-test-machine-test-container", confirm: true },
    ],
    ["autodl_esd_set_replica_num", { deployment_uuid: "dep-test", replica_num: 2, confirm: true }],
    ["autodl_esd_stop_deployment", { deployment_uuid: "dep-test", confirm: true }],
    ["autodl_esd_delete_deployment", { deployment_uuid: "dep-test", confirm: true }],
    [
      "autodl_esd_set_blacklist",
      { deployment_container_uuid: "dep-test-machine-test-container", expire_in_minutes: 60, confirm: true },
    ],
    ["autodl_esd_list_blacklist", {}],
    ["autodl_esd_gpu_stock", { region_sign: "westDC2", cuda_v_from: 118, cuda_v_to: 128 }],
    ["autodl_esd_ddp_overview", { deployment_uuid: "dep-test" }],
    ["autodl_send_wechat_message", { title: "contract-test", content: "ok", confirm: true }],
    ["autodl_local_metrics", {}],
  ];

  const results = [];
  for (const [name, args] of calls) {
    const response = await client.callTool({ name, arguments: args });
    assert.equal(response.isError, false, `${name} returned an MCP error`);
    assert.equal(response.structuredContent.ok, true, `${name} returned a failed payload`);
    results.push(response.structuredContent);
  }

  assert.equal(hits.length, calls.length);
  assert(!JSON.stringify(results).includes("contract-test-token"), "developer token leaked in tool output");

  const snapshot = results[calls.findIndex(([name]) => name === "autodl_pro_instance_snapshot")];
  assert.equal(snapshot.data.root_password, "[REDACTED]");
  assert.equal(snapshot.data.jupyter_token, "[REDACTED]");

  const localMetricHit = hits.find((hit) => hit.path === "/autopanel/v1/api/monitor/current");
  assert.equal(localMetricHit.authorization, undefined, "local metrics request must not send the developer token");
  for (const hit of hits.filter((item) => item !== localMetricHit)) {
    assert.equal(hit.authorization, "contract-test-token");
  }

  const routes = new Set(hits.map((hit) => `${hit.method} ${hit.path}`));
  for (const route of [
    "GET /api/v1/dev/instance/pro/snapshot",
    "GET /api/v1/dev/instance/pro/status",
    "DELETE /api/v1/dev/deployment",
    "GET /api/v1/dev/deployment/blacklist",
    "POST /api/v1/dev/deployment/blacklist",
    "GET /api/v1/dev/deployment/ddp/overview",
    "POST /api/v1/wechat/message/send",
  ]) {
    assert(routes.has(route), `missing route ${route}`);
  }

  const ddp = hits.find((hit) => hit.path === "/api/v1/dev/deployment/ddp/overview");
  assert.equal(ddp.query.deployment_uuid, "dep-test");
  const status = hits.find((hit) => hit.path === "/api/v1/dev/instance/pro/status");
  assert.deepEqual(status.body, { instance_uuid: "pro-test" });
});

test("client surfaces AutoDL business errors without leaking credentials", async () => {
  const mock = http.createServer(async (request, response) => {
    await parseJsonBody(request);
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        code: "PermissionDenied",
        msg: "enterprise verification required",
        request_id: "request-error",
      }),
    );
  });
  const address = await listen(mock);
  const origin = `http://127.0.0.1:${address.port}`;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["src/index.mjs"],
    cwd: packageRoot,
    stderr: "pipe",
    env: {
      ...process.env,
      AUTODL_TOKEN: "must-not-leak",
      AUTODL_BASE_URL: origin,
    },
  });
  const client = new Client({ name: "autodl-error-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const response = await client.callTool({ name: "autodl_wallet_balance", arguments: {} });
    assert.equal(response.isError, true);
    assert.equal(response.structuredContent.error.code, "PermissionDenied");
    assert.equal(response.structuredContent.error.request_id, "request-error");
    assert(!JSON.stringify(response).includes("must-not-leak"));
  } finally {
    await client.close();
    await close(mock);
  }
});
