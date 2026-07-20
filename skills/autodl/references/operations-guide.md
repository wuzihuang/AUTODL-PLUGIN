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

- Ordinary instances retain data across power cycles, but the documented release rule is 15 consecutive powered-off days. Tidal-compute instances use 7 days.
- A host can have a delisting deadline. AutoDL says it provides advance notice, but the user must monitor and back up before release.
- System and data disks are generally local SSD. Local performance is good, but there is no redundancy guarantee; unrecoverable failure is possible.
- Reset or image replacement clears the system disk. Data disk, network disk, and file storage are unaffected according to the reset documentation.
- Saving an image preserves only the system disk. To move a complete workload, handle the system image and data separately.
- Default data disk is documented as 50 GB on regular instances; current expansion availability is host-specific.
- Hugging Face caches default under `/root/.cache`; for large models, point `HF_HOME` to `/root/autodl-tmp/cache/` when appropriate.

## Billing decisions

- Compute billing starts when instance state is running. Power off unused compute promptly.
- Paid data-disk capacity may bill daily even while the instance is powered off, until capacity is reduced to zero or the instance is released.
- Pro creation is documented as pay-as-you-go only.
- Website prices, promotions, coupons, member discounts, duration packages, and billing conversion rules can change. Use the console as the current source of truth.
- For elastic deployment, price filter fields are integer thousandths of a yuan per hour. Never pass a yuan decimal without converting.
- Before creation or scaling, state the requested GPU count, replica count, upper price bound, and whether the operation is immediately billable.

## Storage choices

- Local system/data disk: fastest and instance-local, but not durable storage.
- AutoDL network disk: shared within a region; regions are independent.
- File storage/NFS: for shared or durable workflows; switching dedicated NFS and ordinary storage changes what is mounted.
- Public cloud drives or OSS: recommended by AutoDL for stable transfer, backup, and cross-instance migration.
- Public data: copy datasets into the user's data disk before modifying or training against them.
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
- Run long tasks under `screen`, `tmux`, Jupyter's persistent terminal, or a service manager. Redirect logs to a file before disconnecting.
- Multi-machine training is not generally supported for ordinary consumer GPUs; prefer single-machine multi-GPU when it fits.
- Huawei Ascend and Moore Threads instances require their respective framework adapters and may have CPU-architecture constraints.

## Failure interpretation

- `PermissionDenied`, `BadRequest` with “无当前资源访问权限”, or similar responses can indicate missing real-name verification, enterprise verification, or product entitlement.
- Empty lists are valid and do not mean the tool failed.
- A successful create response can precede full readiness. Poll status or events.
- For Pro image saving, use the returned image UUID and poll the private-image list until status is finished.
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
