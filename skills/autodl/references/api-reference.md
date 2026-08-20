# AutoDL MCP and API reference

This reference reflects the official documentation snapshot indexed on 2026-08-20. Use live responses as the source of truth when fields differ. The `common_api` page still lists a “保存镜像” heading, but it is not a working developer endpoint. Real Pro image save is `POST /api/v1/dev/instance/pro/image/save` via `autodl_pro_save_image`.

## Authentication and response handling

- Developer API host: `https://api.autodl.com`
- WeChat notification host: `https://www.autodl.com`
- Header: `Authorization: <raw developer token>`
- Token source for the companion MCP: `AUTODL_TOKEN`
- Successful developer API response: `code == "Success"`
- Preserve `request_id` when reporting or troubleshooting an error.
- Default request timeout: 20 seconds; override with `AUTODL_REQUEST_TIMEOUT_MS`.

## Tool catalog

| MCP tool | Method and path | Access | Confirmation | Purpose |
|---|---|---|---|---|
| `autodl_wallet_balance` | `POST /api/v1/dev/wallet/balance` | developer token | No | Balance, accumulated spend, voucher balance; divide integers by 1000 for yuan. |
| `autodl_switch_exclusive_nfs` | `POST /api/v1/dev/exclusive_nfs/mount` | account entitlement | Yes | `1` selects dedicated NFS; `-1` returns to ordinary file storage. |
| `autodl_pro_create_instance` | `POST /api/v1/dev/instance/pro/create` | personal or enterprise verification | Yes, billable | Create a pay-as-you-go Pro instance. |
| `autodl_pro_instance_snapshot` | `GET /api/v1/dev/instance/pro/snapshot` with JSON body | personal or enterprise verification | No | Instance hardware, usage, SSH, Jupyter and service endpoints; credentials redacted by default. |
| `autodl_pro_instance_status` | `GET /api/v1/dev/instance/pro/status` with JSON body | personal or enterprise verification | No | Get current Pro instance status. |
| `autodl_pro_list_instances` | `POST /api/v1/dev/instance/pro/list` | personal or enterprise verification | No | Paginated Pro instance list. |
| `autodl_pro_power_on` | `POST /api/v1/dev/instance/pro/power_on` | personal or enterprise verification | Yes, billable | GPU-mode power-on; API does not support cardless mode. |
| `autodl_pro_power_off` | `POST /api/v1/dev/instance/pro/power_off` | personal or enterprise verification | Yes | Power off a Pro instance. |
| `autodl_pro_release_instance` | `POST /api/v1/dev/instance/pro/release` | personal or enterprise verification | Yes, destructive | Release a powered-off Pro instance. |
| `autodl_pro_save_image` | `POST /api/v1/dev/instance/pro/image/save` | personal or enterprise verification | Yes | Save the instance system disk as a private image. |
| `autodl_pro_list_private_images` | `POST /api/v1/dev/instance/pro/image/private/list` | personal or enterprise verification | No | List Pro private images and save status. |
| `autodl_esd_list_private_images` | `POST /api/v1/dev/image/private/list` | enterprise verification | No | List private images available to elastic deployment. |
| `autodl_esd_create_deployment` | `POST /api/v1/dev/deployment` | enterprise verification | Yes, billable | Create ReplicaSet, Job, or Container deployment. |
| `autodl_esd_list_deployments` | `POST /api/v1/dev/deployment/list` | enterprise verification | No | List/filter deployments. |
| `autodl_esd_list_container_events` | `POST /api/v1/dev/deployment/container/event/list` | enterprise verification | No | Poll lifecycle events; use `offset` for incremental reads. |
| `autodl_esd_list_containers` | `POST /api/v1/dev/deployment/container/list` | enterprise verification | No | Query containers and connection information. |
| `autodl_esd_stop_container` | `PUT /api/v1/dev/deployment/container/stop` | enterprise verification | Yes | Stop a container; optionally decrease ReplicaSet replicas and disable reuse. |
| `autodl_esd_set_replica_num` | `PUT /api/v1/dev/deployment/replica_num` | enterprise verification | Yes | Scale a ReplicaSet. |
| `autodl_esd_stop_deployment` | `PUT /api/v1/dev/deployment/operate` | enterprise verification | Yes | Stop a deployment with `operate=stop`. |
| `autodl_esd_delete_deployment` | `DELETE /api/v1/dev/deployment` | enterprise verification | Yes, destructive | Stop if necessary and delete a deployment. |
| `autodl_esd_set_blacklist` | `POST /api/v1/dev/deployment/blacklist` | enterprise verification | Yes | Avoid the host of a problematic container for up to 30 days. |
| `autodl_esd_list_blacklist` | `GET /api/v1/dev/deployment/blacklist` | enterprise verification | No | List effective scheduling blacklist records. |
| `autodl_esd_gpu_stock` | `POST /api/v1/dev/machine/region/gpu_stock` | enterprise verification | No | Query GPU total/idle stock under scheduling filters. |
| `autodl_esd_ddp_overview` | `GET /api/v1/dev/deployment/ddp/overview` with query | enterprise verification | No | Remaining purchased duration packages in seconds. |
| `autodl_send_wechat_message` | `POST /api/v1/wechat/message/send` | bound WeChat plus token | Yes, external message | Send title/name/content notification; title required. |
| `autodl_local_metrics` | `GET http://127.0.0.1:2022/autopanel/v1/api/monitor/current` | enterprise verification; run in container | No | CPU, memory and GPU metrics from the local AutoPanel agent. |

## Container Instance Pro creation

Required fields:

- `req_gpu_amount`: integer 1–4.
- `expand_system_disk_by_gb`: integer 0–500 GB.
- `gpu_spec_uuid`: Pro specification ID, not a machine ID or GPU display name.
- `image_uuid`: private or public image UUID.
- `cuda_v_from`: minimum driver-supported CUDA encoding.

Optional fields: `data_center_list`, `instance_name`, `start_command`.

`start_command` (create and power-on) runs after boot. Official docs say its success or failure does not fail boot and does not power the instance off. On power-on it overrides the command set at create time.

Documented specification IDs at snapshot time:

| Displayed GPU | Displayed specification | API specification ID |
|---|---|---|
| H800-80G | General | `h800` |
| 4090-48G | General | `v-48g` |
| PRO6000-96G | Performance | `pro6000-p` |
| 4080(S)-32G | Performance | `v-32g-p` |
| 3090-48G | General | `v-48g-350w` |
| 5090-32G | Performance | `5090-p` |
| 4090D | General | `4090D` |

This list can change; recheck the official Pro API appendix before creation.

## Elastic deployment creation

Deployment types:

- `ReplicaSet`: requires `replica_num`; system maintains that many replicas.
- `Job`: requires `replica_num` and `parallelism_num`.
- `Container`: creates a single container and does not require replica fields.

Current container-template fields include:

- Scheduling: `dc_list`, `gpu_name_set`, `gpu_num`, `cuda_v_from`, `cuda_v_to`.
- Resource ranges: `cpu_num_from/to`, `memory_size_from/to` in GB.
- Price range: `price_from/to`, integer thousandths of a yuan.
- Runtime: `image_uuid`, `cmd`, optional `cmd_before_shutdown` with a five-second execution limit.
- Public services: optional 6006/6008 protocol, each `http` or `tcp`.
- Reuse: `reuse_container`; optional scope `all` or `deployment`.

Deprecated documentation fields such as `region_sign`, `cuda_v`, and `service_port_protocol` should not be used for new deployment requests.

Container environment variables documented for elastic deployments:

| Variable | Meaning |
|---|---|
| `AutoDLContainerUUID` | Current container UUID; unique even when a leftover container is reused. |
| `AutoDLDeploymentUUID` | Deployment UUID. |
| `AutoDLDataCenter` | Region / `data_center` code of the running container. |

## Documented elastic-deployment region codes

| Region | Code |
|---|---|
| Northwest enterprise region | `westDC2` |
| Northwest B | `westDC3` |
| Beijing A | `beijingDC1` |
| Beijing B | `beijingDC2` |
| L20 zone, formerly Beijing C | `beijingDC4` |
| V100 zone, formerly South China A | `beijingDC3` |
| Inner Mongolia A | `neimengDC1` |
| Foshan | `foshanDC1` |
| Chongqing A | `chongqingDC1` |
| 3090 zone | `yangzhouDC1` |
| Inner Mongolia B | `neimengDC3` |

Region availability can change. Verify before creating resources.

## Base-image examples from the API appendices

| UUID | Image |
|---|---|
| `base-image-12be412037` | PyTorch, CUDA 11.1, Ubuntu 18.04, Python 3.8, Torch 1.9.0 |
| `base-image-u9r24vthlk` | PyTorch, CUDA 11.3, Ubuntu 20.04, Python 3.8, Torch 1.10.0 |
| `base-image-l374uiucui` | PyTorch, CUDA 11.3, Ubuntu 20.04, Python 3.8, Torch 1.11.0 |
| `base-image-l2t43iu6uk` | PyTorch, CUDA 11.8, Ubuntu 20.04, Python 3.8, Torch 2.0.0 |
| `base-image-0gxqmciyth` | TensorFlow, CUDA 11.2, Ubuntu 18.04, Python 3.8, TF 2.5.0 |
| `base-image-uxeklgirir` | TensorFlow, CUDA 11.2, Ubuntu 20.04, Python 3.8, TF 2.9.0 |
| `base-image-mbr2n4urrc` | Miniconda, CUDA 11.6, Ubuntu 20.04, Python 3.8 |

This public-image UUID table is incomplete. The official appendix ends with an ellipsis and says newer images exist. Prefer the list-image tools for private images, and the live console or current official appendix for public images; do not treat this snapshot table as complete.

## WeChat and local metrics

- WeChat: `title` is required; `name` and `content` are optional. The documented limit is 50 successful messages per day and 5 per minute. Messages must not contain illegal or harmful content.
- Local metrics: no developer Token is sent. The default address is loopback inside the AutoDL container. Override `AUTODL_METRICS_URL` only when the endpoint is safely reachable.
