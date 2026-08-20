# AutoDL operations guide

## Intent routing

| User need | First source or tool | Important boundary |
|---|---|---|
| Current balance | `autodl_wallet_balance` | Divide monetary integers by 1000. |
| Existing Pro resources | Pro list → status/snapshot | Snapshot secrets are redacted by default. |
| New Pro instance | Images/spec selection → create preview → confirmation | Pay-as-you-go only; API GPU mode only. |
| Stop and release Pro instance | status → power off → verify stopped → release | Release is destructive; back up data first. |
| Elastic deployment | stock/images → create preview → confirmation → events/containers | Enterprise verification required. |
| Scale ReplicaSet | list deployment → current replica count → set replica preview | Increase costs; decrease stops containers. |
| Troubleshoot scheduling | events/containers → GPU stock → optional blacklist | Stock is single-card view; blacklist affects future scheduling. |
| Preserve environment | power off → save image → poll image list | Captures system disk, not data disk. |
| Data transfer or backup | `netdisk`, `nas`, `fs`, `scp`, `down`, `instance_data` docs | Local SSD has no redundancy guarantee. |
| Remote access | `ssh`, `jupyterlab`, `vscode`, `pycharm`, `ssh_proxy`, `port` docs | Use a persistent process manager for long jobs. |
| CUDA or framework issue | `base_config`, `env`, `deps`, `cuda`, `source`, `python` docs | `nvidia-smi` is driver capability, not installed toolkit. |
| Performance issue | `perf`, `gpu`, `gpu_perf`, `metric_monitor`, `precision` docs | Separate GPU utilization, IO/CPU bottlenecks, and numerical precision. |

## Instance and data lifecycle

- Ordinary instances retain data across power cycles, but the documented release rule is 15 consecutive powered-off days. Tidal-compute instances use 7 days and have no NAS.
- A host can have a delisting deadline. AutoDL says it provides advance notice, but the user must monitor and back up before release.
- System and data disks are generally local SSD. Local performance is good, but there is no redundancy guarantee; unrecoverable failure is possible.
- Reset or image replacement clears the system disk. Data disk, network disk, and file storage are unaffected according to the reset documentation.
- Saving an image preserves only the system disk. To move a complete workload, handle the system image and data separately.
- Default data disk is documented as 50 GB on regular instances (`/root/autodl-tmp`, local SSD, not captured in images); current expansion availability is host-specific.
- Hugging Face caches default under `/root/.cache`; for large models, point `HF_HOME` to `/root/autodl-tmp/cache/` when appropriate.
- Cardless boot is console-only (0.5 vCPU / 2 GB / no GPU / ¥0.1/h, one per main account). It is not available through the Pro API; Pro `power_on` is GPU-mode only.

## Billing decisions

- Compute billing starts when instance state is running. Power off unused compute promptly.
- Extra paid data-disk capacity bills every calendar day while the instance exists, even when powered off, until shrink-to-0 or release.
- Pro creation is documented as pay-as-you-go only.
- Website prices, promotions, coupons, member discounts, duration packages, and billing conversion rules can change. Use the console as the current source of truth.
- For elastic deployment, price filter fields are integer thousandths of a yuan per hour. Never pass a yuan decimal without converting.
- Before creation or scaling, state the requested GPU count, replica count, upper price bound, and whether the operation is immediately billable.

## Storage choices

- Local system disk (`/`): ~30 GB, captured in images; check usage with `source /root/.bashrc`.
- Local data disk (`/root/autodl-tmp`): 50 GB free, expandable, local SSD, not captured in images. Fastest instance-local IO, but not durable storage.
- File storage (`/root/autodl-fs`): 20 GB free, durable, regional share; overage is documented as ¥0.01/GB/day. Hard limit of 200k inodes — too many small files can look like a full disk. Switching dedicated NFS and ordinary file storage changes what is mounted.
- NAS / AutoDL 网盘 (`/root/autodl-nas`): 20 GB free, regional, documented overage ¥0.30/GB/month. Absent on tidal-compute instances.
- Public / 公网网盘 (`netdisk`): third-party cloud drives or OSS via AutoPanel; recommended for stable transfer, backup, and cross-instance migration. Distinct from regional NAS.
- Public data (`/root/autodl-pub`): read-only. Copy datasets into the user's data disk before modifying or training against them.
- `/root/autodl-tmp`, `/root/autodl-nas`, `/root/autodl-fs`, and `/root/autodl-pub` do not count as system-disk usage.
- Private images cannot be imported from outside AutoDL according to current documentation.

## Access and networking

- Instances do not have independent public IPs. Ports 6006 and 6008 have mapped service endpoints supporting HTTP or TCP.
- Arbitrary open ports require enterprise verification. Personal users should use SSH tunneling.
- Keep mapped service URLs private. The custom-service agreement limits their use to permitted research and says not to forward them to third parties.
- For Nginx load balancing, AutoDL routing depends on the `Host` header; preserve the target service host.
- AutoDL describes shared regional bandwidth and does not separately bill instance bandwidth/traffic, but availability and performance are shared.

## Environment and long-running jobs

- Base images are Ubuntu and include Miniconda. Prefer a new Conda environment for alternate Python/framework versions.
- Framework wheels often bundle the matching CUDA runtime. Do not install a separate CUDA toolkit unless compilation or another concrete dependency requires it.
- `nvidia-smi` shows the driver's maximum supported CUDA version, not the toolkit actually installed in the environment.
- Use domestic package mirrors when appropriate, but switch mirrors if one is throttled.
- Run long tasks under `screen`, `tmux`, Jupyter's persistent terminal, or a service manager. Redirect logs to a file before disconnecting. Optionally append `/usr/bin/shutdown` after the job.
- Multi-machine / intranet-IP training is no longer supported for ordinary consumer GPUs; prefer single-machine multi-GPU when it fits.
- Docker-in-container is unsupported.
- Academic acceleration: `source /etc/network_turbo` for github.com / huggingface.co; `unset http_proxy https_proxy` when finished.
- SSH user is `root`. Hosts look like `connect.REGION.seetacloud.com` or `region-N.autodl.com`. Copy with `scp -rP` (capital `P`) to `/root/autodl-tmp`. Tunnel: `ssh -CNg -L 6006:127.0.0.1:6006 root@HOST -p PORT`. After an image change, drop the local `known_hosts` entry.
- WeChat notifications use `https://www.autodl.com`, not `https://api.autodl.com`.
- Huawei Ascend and Moore Threads instances require their respective framework adapters and may have CPU-architecture constraints.

## Failure interpretation

- `PermissionDenied`, `BadRequest` with “无当前资源访问权限”, or similar responses can indicate missing real-name verification, enterprise verification, or product entitlement.
- Empty lists are valid and do not mean the tool failed.
- A successful create response can precede full readiness. Poll status or events.
- For Pro image saving, use the returned image UUID and poll the private-image list until status is finished.
- ESD `reuse_container` can start from a leftover stopped container kept in a reuse pool for up to 7 days. The filesystem is not reset to the image; clean leftover files when they would affect the next run. `AutoDLContainerUUID` is still unique on reuse.
- In ESD `cmd`, `conda activate` often fails. Call `/root/miniconda3/envs/ENV/bin/python` instead of activating the env.
- A stopped/released container may still appear when `released=true` is requested.
- Save `request_id` for AutoDL support whenever an API operation fails unexpectedly.

## Pro release checklist

1. Confirm the exact `instance_uuid` from the instance list.
2. Explain that release can remove instance-local data.
3. Confirm backup status for system and data disks.
4. Power off the instance and verify stopped state.
5. Obtain explicit final confirmation.
6. Call `autodl_pro_release_instance` with `confirm=true`.
7. Re-list instances and report the result with `request_id` if provided.

## Elastic deployment deletion checklist

1. Confirm the exact `deployment_uuid` and deployment type.
2. List running containers and explain interruption/data impact.
3. Confirm required outputs are persisted outside ephemeral containers.
4. Obtain explicit final confirmation.
5. Call `autodl_esd_delete_deployment` with `confirm=true`.
6. Re-list deployments and preserve `request_id` for any failure.
