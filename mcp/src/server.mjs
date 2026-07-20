import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AutodlClient } from "./autodl-client.mjs";
import {
  apiHandler,
  destructiveAnnotations,
  failure,
  mutatingAnnotations,
  mutationHandler,
  readOnlyAnnotations,
  redactSecrets,
  result,
  success,
  withoutControlFields,
} from "./tool-helpers.mjs";

const confirm = z
  .boolean()
  .default(false)
  .describe("确认执行真实状态变更。false 只返回请求预览，不调用 AutoDL。若涉及费用、关机、释放或删除，必须先获得用户明确确认。")
  ;
const pageIndex = z.number().int().min(0).default(1).describe("页码。默认 1。")
  ;
const pageSize = z.number().int().min(1).max(1000).default(10).describe("每页条目数。")
  ;
const instanceUuid = z.string().min(1).describe("容器实例 Pro 的实例 ID，例如 pro-xxxxxxxxxxxx。")
  ;
const deploymentUuid = z.string().min(1).describe("弹性部署 UUID。")
  ;
const protocol = z.enum(["http", "tcp"]);

const containerTemplate = z.object({
  dc_list: z.array(z.string().min(1)).min(1).describe("可调度地区代码列表。"),
  service_6006_port_protocol: protocol.optional(),
  service_6008_port_protocol: protocol.optional(),
  cuda_v_from: z.number().int().positive(),
  cuda_v_to: z.number().int().positive(),
  gpu_name_set: z.array(z.string().min(1)).min(1),
  gpu_num: z.number().int().min(1),
  memory_size_from: z.number().int().min(1).describe("内存下限，GB。"),
  memory_size_to: z.number().int().min(1).describe("内存上限，GB。"),
  cpu_num_from: z.number().int().min(1),
  cpu_num_to: z.number().int().min(1),
  price_from: z.number().int().min(0).describe("基准价格下限，单位为人民币元的千分之一。"),
  price_to: z.number().int().min(0).describe("基准价格上限，单位为人民币元的千分之一。"),
  image_uuid: z.string().min(1),
  cmd_before_shutdown: z.string().optional(),
  cmd: z.string().min(1),
});

function register(server, name, config, handler) {
  server.registerTool(name, config, handler);
}

function validateDeploymentCreate(args) {
  if (["ReplicaSet", "Job"].includes(args.deployment_type) && args.replica_num === undefined) {
    return "ReplicaSet 和 Job 类型必须提供 replica_num。";
  }
  if (args.deployment_type === "Job" && args.parallelism_num === undefined) {
    return "Job 类型必须提供 parallelism_num。";
  }
  if (args.container_template.cuda_v_from > args.container_template.cuda_v_to) {
    return "cuda_v_from 不能大于 cuda_v_to。";
  }
  if (args.container_template.cpu_num_from > args.container_template.cpu_num_to) {
    return "cpu_num_from 不能大于 cpu_num_to。";
  }
  if (args.container_template.memory_size_from > args.container_template.memory_size_to) {
    return "memory_size_from 不能大于 memory_size_to。";
  }
  if (args.container_template.price_from > args.container_template.price_to) {
    return "price_from 不能大于 price_to。";
  }
  return null;
}

export function createAutodlMcpServer(options = {}) {
  const client = options.client ?? new AutodlClient(options);
  const server = new McpServer({ name: "autodl-mcp", version: "1.0.0" });

  register(
    server,
    "autodl_wallet_balance",
    {
      title: "获取 AutoDL 账户余额",
      description: "返回余额、累计消费和代金券余额。金额字段均除以 1000 后才是人民币元。",
      inputSchema: {},
      annotations: readOnlyAnnotations,
    },
    apiHandler(() => client.api({ method: "POST", path: "/api/v1/dev/wallet/balance" })),
  );

  register(
    server,
    "autodl_switch_exclusive_nfs",
    {
      title: "切换专用 NFS 或普通文件存储",
      description: "mountable=1 挂载专用 NFS 并关闭普通文件存储；mountable=-1 关闭专用 NFS 并切回普通文件存储。",
      inputSchema: {
        data_center: z.string().min(1),
        mountable: z.union([z.literal(1), z.literal(-1)]),
        confirm,
      },
      annotations: mutatingAnnotations,
    },
    mutationHandler({
      operation: "切换专用 NFS/普通文件存储",
      method: "POST",
      path: "/api/v1/dev/exclusive_nfs/mount",
      bodyFromArgs: withoutControlFields,
      request: (body) => client.api({ method: "POST", path: "/api/v1/dev/exclusive_nfs/mount", body }),
    }),
  );

  register(
    server,
    "autodl_pro_create_instance",
    {
      title: "创建容器实例 Pro",
      description: "以按量计费方式创建容器实例 Pro。此操作会产生费用。",
      inputSchema: {
        data_center_list: z.array(z.string().min(1)).min(1).optional(),
        req_gpu_amount: z.number().int().min(1).max(4),
        expand_system_disk_by_gb: z.number().int().min(0).max(500),
        gpu_spec_uuid: z.string().min(1),
        image_uuid: z.string().min(1),
        cuda_v_from: z.number().int().positive(),
        instance_name: z.string().optional(),
        start_command: z.string().optional(),
        confirm,
      },
      annotations: mutatingAnnotations,
    },
    mutationHandler({
      operation: "创建按量计费容器实例 Pro",
      method: "POST",
      path: "/api/v1/dev/instance/pro/create",
      bodyFromArgs: withoutControlFields,
      request: (body) => client.api({ method: "POST", path: "/api/v1/dev/instance/pro/create", body }),
    }),
  );

  register(
    server,
    "autodl_pro_instance_snapshot",
    {
      title: "获取容器实例 Pro 详情",
      description: "获取实例硬件、使用率、SSH 和服务地址。默认遮盖 SSH 密码和 Jupyter Token。",
      inputSchema: {
        instance_uuid: instanceUuid,
        include_credentials: z.boolean().default(false),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ instance_uuid, include_credentials }) => {
      try {
        const response = await client.api({
          method: "GET",
          path: "/api/v1/dev/instance/pro/snapshot",
          body: { instance_uuid },
        });
        if (!include_credentials && response.body?.data) {
          response.body = { ...response.body, data: redactSecrets(response.body.data) };
        }
        return success(response);
      } catch (error) {
        return failure(error);
      }
    },
  );

  register(
    server,
    "autodl_pro_instance_status",
    {
      title: "获取容器实例 Pro 状态",
      description: "按实例 ID 获取当前状态。官方接口使用 GET 搭配 JSON body。",
      inputSchema: { instance_uuid: instanceUuid },
      annotations: readOnlyAnnotations,
    },
    apiHandler(({ instance_uuid }) =>
      client.api({ method: "GET", path: "/api/v1/dev/instance/pro/status", body: { instance_uuid } }),
    ),
  );

  register(
    server,
    "autodl_pro_list_instances",
    {
      title: "获取容器实例 Pro 列表",
      description: "分页列出容器实例 Pro。",
      inputSchema: { page_index: pageIndex, page_size: pageSize },
      annotations: readOnlyAnnotations,
    },
    apiHandler((args) =>
      client.api({ method: "POST", path: "/api/v1/dev/instance/pro/list", body: args }),
    ),
  );

  register(
    server,
    "autodl_pro_power_on",
    {
      title: "开机容器实例 Pro",
      description: "以有卡模式开机，开机后会开始计费。API 暂不支持无卡模式。",
      inputSchema: {
        instance_uuid: instanceUuid,
        payload: z.literal("gpu").default("gpu"),
        start_command: z.string().optional(),
        confirm,
      },
      annotations: mutatingAnnotations,
    },
    mutationHandler({
      operation: "有卡开机并开始计费",
      method: "POST",
      path: "/api/v1/dev/instance/pro/power_on",
      bodyFromArgs: withoutControlFields,
      request: (body) => client.api({ method: "POST", path: "/api/v1/dev/instance/pro/power_on", body }),
    }),
  );

  register(
    server,
    "autodl_pro_power_off",
    {
      title: "关机容器实例 Pro",
      description: "关闭指定实例。关机可能中断训练或服务。",
      inputSchema: { instance_uuid: instanceUuid, confirm },
      annotations: mutatingAnnotations,
    },
    mutationHandler({
      operation: "关机容器实例 Pro",
      method: "POST",
      path: "/api/v1/dev/instance/pro/power_off",
      bodyFromArgs: withoutControlFields,
      request: (body) => client.api({ method: "POST", path: "/api/v1/dev/instance/pro/power_off", body }),
    }),
  );

  register(
    server,
    "autodl_pro_release_instance",
    {
      title: "释放容器实例 Pro",
      description: "永久释放实例。官方要求先关机；释放会带来数据丢失风险。",
      inputSchema: { instance_uuid: instanceUuid, confirm },
      annotations: destructiveAnnotations,
    },
    mutationHandler({
      operation: "永久释放容器实例 Pro",
      method: "POST",
      path: "/api/v1/dev/instance/pro/release",
      bodyFromArgs: withoutControlFields,
      request: (body) => client.api({ method: "POST", path: "/api/v1/dev/instance/pro/release", body }),
    }),
  );

  register(
    server,
    "autodl_pro_save_image",
    {
      title: "保存容器实例 Pro 镜像",
      description: "将实例系统盘保存为私有镜像。",
      inputSchema: {
        instance_uuid: instanceUuid,
        image_name: z.string().min(1),
        confirm,
      },
      annotations: mutatingAnnotations,
    },
    mutationHandler({
      operation: "保存容器实例 Pro 镜像",
      method: "POST",
      path: "/api/v1/dev/instance/pro/image/save",
      bodyFromArgs: withoutControlFields,
      request: (body) => client.api({ method: "POST", path: "/api/v1/dev/instance/pro/image/save", body }),
    }),
  );

  register(
    server,
    "autodl_pro_list_private_images",
    {
      title: "获取容器实例 Pro 私有镜像列表",
      description: "分页列出 Pro API 可用私有镜像及保存状态。",
      inputSchema: { page_index: pageIndex, page_size: pageSize },
      annotations: readOnlyAnnotations,
    },
    apiHandler((args) =>
      client.api({ method: "POST", path: "/api/v1/dev/instance/pro/image/private/list", body: args }),
    ),
  );

  register(
    server,
    "autodl_esd_list_private_images",
    {
      title: "获取弹性部署私有镜像列表",
      description: "分页列出弹性部署可用私有镜像。",
      inputSchema: {
        page_index: pageIndex,
        page_size: pageSize,
        offset: z.number().int().min(0).optional(),
      },
      annotations: readOnlyAnnotations,
    },
    apiHandler((args) =>
      client.api({ method: "POST", path: "/api/v1/dev/image/private/list", body: args }),
    ),
  );

  register(
    server,
    "autodl_esd_create_deployment",
    {
      title: "创建弹性部署",
      description: "创建 ReplicaSet、Job 或 Container 弹性部署。需要企业认证并会产生费用。",
      inputSchema: {
        name: z.string().min(1),
        deployment_type: z.enum(["ReplicaSet", "Job", "Container"]),
        replica_num: z.number().int().min(1).optional(),
        parallelism_num: z.number().int().min(1).optional(),
        reuse_container: z.boolean().optional(),
        reuse_container_scope: z.enum(["all", "deployment"]).optional(),
        container_template: containerTemplate,
        confirm,
      },
      annotations: mutatingAnnotations,
    },
    async (args) => {
      const validationError = validateDeploymentCreate(args);
      if (validationError) return result({ ok: false, error: { kind: "validation", message: validationError } }, true);
      const body = withoutControlFields(args);
      if (!args.confirm) {
        return result({
          ok: true,
          executed: false,
          confirmation_required: true,
          operation: "创建弹性部署并开始按配置计费",
          request_preview: { method: "POST", path: "/api/v1/dev/deployment", body },
          next_step: "核对副本数、GPU、地区、价格范围和镜像后设置 confirm=true。",
        });
      }
      try {
        return success(await client.api({ method: "POST", path: "/api/v1/dev/deployment", body }));
      } catch (error) {
        return failure(error);
      }
    },
  );

  register(
    server,
    "autodl_esd_list_deployments",
    {
      title: "获取弹性部署列表",
      description: "分页查询部署，可按名称、状态和 UUID 精确筛选。",
      inputSchema: {
        page_index: pageIndex,
        page_size: pageSize,
        name: z.string().optional(),
        status: z.enum(["running", "stopped"]).optional(),
        deployment_uuid: z.string().optional(),
      },
      annotations: readOnlyAnnotations,
    },
    apiHandler((args) =>
      client.api({ method: "POST", path: "/api/v1/dev/deployment/list", body: withoutControlFields(args, []) }),
    ),
  );

  register(
    server,
    "autodl_esd_list_container_events",
    {
      title: "查询弹性部署容器事件",
      description: "分页轮询容器生命周期事件；使用 offset 获取增量事件。",
      inputSchema: {
        deployment_uuid: deploymentUuid,
        deployment_container_uuid: z.string().optional(),
        page_index: pageIndex,
        page_size: pageSize,
        offset: z.number().int().min(0).optional(),
      },
      annotations: readOnlyAnnotations,
    },
    apiHandler((args) =>
      client.api({ method: "POST", path: "/api/v1/dev/deployment/container/event/list", body: args }),
    ),
  );

  register(
    server,
    "autodl_esd_list_containers",
    {
      title: "查询弹性部署容器",
      description: "按部署、状态、GPU、CPU、内存、价格或时间范围分页查询容器。",
      inputSchema: {
        deployment_uuid: deploymentUuid,
        container_uuid: z.string().optional(),
        date_from: z.string().optional(),
        date_to: z.string().optional(),
        gpu_name: z.string().optional(),
        cpu_num_from: z.number().int().min(0).optional(),
        cpu_num_to: z.number().int().min(0).optional(),
        memory_size_from: z.number().int().min(0).optional(),
        memory_size_to: z.number().int().min(0).optional(),
        price_from: z.number().min(0).optional(),
        price_to: z.number().min(0).optional(),
        released: z.boolean().optional(),
        status: z.array(z.string()).optional(),
        page_index: pageIndex,
        page_size: pageSize,
        offset: z.number().int().min(0).optional(),
      },
      annotations: readOnlyAnnotations,
    },
    apiHandler((args) =>
      client.api({ method: "POST", path: "/api/v1/dev/deployment/container/list", body: args }),
    ),
  );

  register(
    server,
    "autodl_esd_stop_container",
    {
      title: "停止弹性部署中的指定容器",
      description: "停止具体容器；可同时减少 ReplicaSet 副本数，并控制是否进入复用缓存。",
      inputSchema: {
        deployment_container_uuid: z.string().min(1),
        decrease_one_replica_num: z.boolean().optional(),
        no_cache: z.boolean().optional(),
        cmd_before_shutdown: z.string().optional(),
        confirm,
      },
      annotations: mutatingAnnotations,
    },
    mutationHandler({
      operation: "停止弹性部署容器",
      method: "PUT",
      path: "/api/v1/dev/deployment/container/stop",
      bodyFromArgs: withoutControlFields,
      request: (body) => client.api({ method: "PUT", path: "/api/v1/dev/deployment/container/stop", body }),
    }),
  );

  register(
    server,
    "autodl_esd_set_replica_num",
    {
      title: "设置 ReplicaSet 副本数量",
      description: "调整 ReplicaSet 副本数。扩容会增加费用，缩容会停止容器。",
      inputSchema: {
        deployment_uuid: deploymentUuid,
        replica_num: z.number().int().min(0),
        confirm,
      },
      annotations: mutatingAnnotations,
    },
    mutationHandler({
      operation: "调整 ReplicaSet 副本数量",
      method: "PUT",
      path: "/api/v1/dev/deployment/replica_num",
      bodyFromArgs: withoutControlFields,
      request: (body) => client.api({ method: "PUT", path: "/api/v1/dev/deployment/replica_num", body }),
    }),
  );

  register(
    server,
    "autodl_esd_stop_deployment",
    {
      title: "停止弹性部署",
      description: "将部署操作设为 stop。",
      inputSchema: { deployment_uuid: deploymentUuid, confirm },
      annotations: mutatingAnnotations,
    },
    mutationHandler({
      operation: "停止整个弹性部署",
      method: "PUT",
      path: "/api/v1/dev/deployment/operate",
      bodyFromArgs: (args) => ({ deployment_uuid: args.deployment_uuid, operate: "stop" }),
      request: (body) => client.api({ method: "PUT", path: "/api/v1/dev/deployment/operate", body }),
    }),
  );

  register(
    server,
    "autodl_esd_delete_deployment",
    {
      title: "删除弹性部署",
      description: "删除部署；若部署尚未停止，平台会先停止再删除。",
      inputSchema: { deployment_uuid: deploymentUuid, confirm },
      annotations: destructiveAnnotations,
    },
    mutationHandler({
      operation: "永久删除弹性部署",
      method: "DELETE",
      path: "/api/v1/dev/deployment",
      bodyFromArgs: withoutControlFields,
      request: (body) => client.api({ method: "DELETE", path: "/api/v1/dev/deployment", body }),
    }),
  );

  register(
    server,
    "autodl_esd_set_blacklist",
    {
      title: "设置弹性部署调度黑名单",
      description: "按容器所在主机设置禁止调度时间，默认 24 小时，最长 30 天。",
      inputSchema: {
        deployment_container_uuid: z.string().min(1),
        expire_in_minutes: z.number().int().min(1).max(43_200).optional(),
        comment: z.string().optional(),
        confirm,
      },
      annotations: mutatingAnnotations,
    },
    mutationHandler({
      operation: "设置调度黑名单",
      method: "POST",
      path: "/api/v1/dev/deployment/blacklist",
      bodyFromArgs: withoutControlFields,
      request: (body) => client.api({ method: "POST", path: "/api/v1/dev/deployment/blacklist", body }),
    }),
  );

  register(
    server,
    "autodl_esd_list_blacklist",
    {
      title: "获取生效中的调度黑名单",
      description: "查询当前账号仍生效的弹性部署调度黑名单。",
      inputSchema: {},
      annotations: readOnlyAnnotations,
    },
    apiHandler(() => client.api({ method: "GET", path: "/api/v1/dev/deployment/blacklist" })),
  );

  register(
    server,
    "autodl_esd_gpu_stock",
    {
      title: "获取弹性部署 GPU 库存",
      description: "查询某地区筛选条件下的 GPU 总量和空闲量。库存按单卡调度口径，不能保证多卡同机可用。",
      inputSchema: {
        region_sign: z.string().min(1),
        cuda_v_from: z.number().int().positive().optional(),
        cuda_v_to: z.number().int().positive().optional(),
        gpu_name_set: z.array(z.string().min(1)).optional(),
        memory_size_from: z.number().int().min(0).optional(),
        memory_size_to: z.number().int().min(0).optional(),
        cpu_num_from: z.number().int().min(0).optional(),
        cpu_num_to: z.number().int().min(0).optional(),
        price_from: z.number().int().min(0).optional(),
        price_to: z.number().int().min(0).optional(),
      },
      annotations: readOnlyAnnotations,
    },
    apiHandler((args) =>
      client.api({ method: "POST", path: "/api/v1/dev/machine/region/gpu_stock", body: args }),
    ),
  );

  register(
    server,
    "autodl_esd_ddp_overview",
    {
      title: "获取弹性部署已购时长包",
      description: "查询部署可用 GPU 时长包的总时长、余额和地区，时长单位为秒。",
      inputSchema: { deployment_uuid: deploymentUuid },
      annotations: readOnlyAnnotations,
    },
    apiHandler(({ deployment_uuid }) =>
      client.api({
        method: "GET",
        path: "/api/v1/dev/deployment/ddp/overview",
        query: { deployment_uuid },
      }),
    ),
  );

  register(
    server,
    "autodl_send_wechat_message",
    {
      title: "发送 AutoDL 微信通知",
      description: "向已绑定 AutoDL 账号的微信发送通知。每日最多 50 条、每分钟最多 5 条；title 必填。",
      inputSchema: {
        title: z.string().min(1),
        name: z.string().optional(),
        content: z.string().optional(),
        confirm,
      },
      annotations: mutatingAnnotations,
    },
    mutationHandler({
      operation: "向绑定微信发送消息",
      method: "POST",
      path: "/api/v1/wechat/message/send",
      bodyFromArgs: withoutControlFields,
      request: (body) => client.webApi({ method: "POST", path: "/api/v1/wechat/message/send", body }),
    }),
  );

  register(
    server,
    "autodl_local_metrics",
    {
      title: "获取当前 AutoDL 容器性能指标",
      description: "从容器内 AutoPanel 本地地址读取 CPU、内存和 GPU 指标。MCP 服务需运行在目标 AutoDL 容器内，或提供可达的 url。仅企业认证账号可用。",
      inputSchema: {
        url: z.string().url().optional().describe("可选监控 URL；默认使用 AUTODL_METRICS_URL。"),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ url }) => {
      try {
        const response = await client.localMetrics(url);
        return result({ ok: true, http_status: response.httpStatus, data: response.body });
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}
