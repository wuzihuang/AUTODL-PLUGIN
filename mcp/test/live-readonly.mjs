import { AutodlClient } from "../src/autodl-client.mjs";

if (!process.env.AUTODL_TOKEN) {
  process.stderr.write("缺少 AUTODL_TOKEN，未执行实时只读测试。\n");
  process.exit(2);
}

const client = new AutodlClient();
const checks = [
  {
    name: "账户余额",
    run: () => client.api({ method: "POST", path: "/api/v1/dev/wallet/balance" }),
  },
  {
    name: "Pro 实例列表",
    run: () => client.api({ method: "POST", path: "/api/v1/dev/instance/pro/list", body: { page_index: 1, page_size: 1 } }),
  },
  {
    name: "Pro 私有镜像列表",
    run: () =>
      client.api({
        method: "POST",
        path: "/api/v1/dev/instance/pro/image/private/list",
        body: { page_index: 1, page_size: 1 },
      }),
  },
  {
    name: "弹性部署列表",
    enterpriseOnly: true,
    run: () => client.api({ method: "POST", path: "/api/v1/dev/deployment/list", body: { page_index: 1, page_size: 1 } }),
  },
  {
    name: "弹性部署黑名单",
    enterpriseOnly: true,
    run: () => client.api({ method: "GET", path: "/api/v1/dev/deployment/blacklist" }),
  },
];

let failed = 0;
let firstInstanceUuid;
for (const check of checks) {
  try {
    const response = await check.run();
    if (check.name === "Pro 实例列表") {
      firstInstanceUuid = response.body?.data?.list?.[0]?.uuid;
    }
    const requestId = response.body?.request_id ? ` request_id=${response.body.request_id}` : "";
    process.stdout.write(`PASS ${check.name} HTTP ${response.httpStatus}${requestId}\n`);
  } catch (error) {
    const kind = error?.details?.kind ?? "unknown";
    const code = error?.details?.code ? ` code=${error.details.code}` : "";
    const label = check.enterpriseOnly ? "SKIP/PERMISSION" : "FAIL";
    process.stdout.write(`${label} ${check.name} kind=${kind}${code} message=${error.message}\n`);
    if (!check.enterpriseOnly) failed += 1;
  }
}

if (firstInstanceUuid) {
  for (const detailCheck of [
    {
      name: "Pro 实例状态（GET JSON body）",
      path: "/api/v1/dev/instance/pro/status",
    },
    {
      name: "Pro 实例详情（GET JSON body）",
      path: "/api/v1/dev/instance/pro/snapshot",
    },
  ]) {
    try {
      const response = await client.api({
        method: "GET",
        path: detailCheck.path,
        body: { instance_uuid: firstInstanceUuid },
      });
      const requestId = response.body?.request_id ? ` request_id=${response.body.request_id}` : "";
      process.stdout.write(`PASS ${detailCheck.name} HTTP ${response.httpStatus}${requestId}\n`);
    } catch (error) {
      failed += 1;
      process.stdout.write(
        `FAIL ${detailCheck.name} kind=${error?.details?.kind ?? "unknown"} code=${error?.details?.code ?? ""} message=${error.message}\n`,
      );
    }
  }
} else {
  process.stdout.write("SKIP Pro 实例状态/详情：账号当前没有可测试实例。\n");
}

process.exitCode = failed === 0 ? 0 : 1;
