---
name: autodl
description: Use AutoDL safely through its official developer APIs and documentation. Trigger for AutoDL balance, Container Instance Pro, elastic deployment, images, GPU stock, NFS, duration packages, WeChat notifications, container metrics, billing, storage, data retention, SSH/JupyterLab/VSCode, CUDA environments, troubleshooting, and AutoDL operating guidance.
---

# AutoDL

## Purpose

Use this skill to answer AutoDL questions and operate AutoDL resources through the companion MCP server. Prefer official API output over assumptions. Never claim a resource exists, a price is current, a GPU is available, or an action succeeded unless the corresponding API returned it.

## Resource loading

- Read `references/api-reference.md` before choosing or calling an AutoDL MCP tool.
- Read `references/operations-guide.md` for lifecycle, billing, storage, networking, environment, and safety decisions.
- Read the relevant row in `references/docs-index.md` when the request concerns a help topic outside the API reference or requires a current official rule.
- Use `references/docs-manifest.json` only for documentation coverage audits or drift checks.
- Run `node scripts/refresh-docs.mjs` when the user asks for current documentation, the saved index is older than 30 days, or a documented field conflicts with a live API response. This refreshes metadata and links, not a verbatim copy of the site.

## Operating workflow

1. Classify the request as read-only, state-changing, destructive, or documentation-only.
2. For API work, identify the exact typed MCP tool from `references/api-reference.md`. Do not substitute Pro instance IDs, deployment UUIDs, container UUIDs, image UUIDs, machine IDs, or GPU specification IDs for one another.
3. Run read-only discovery first when an identifier or current state is missing.
4. Before any state-changing call, summarize the target, requested change, billing effect, and data impact. Obtain explicit user confirmation, then call the tool with `confirm=true`.
5. After a state-changing call, inspect `code`, `msg`, `request_id`, and returned data. Query status again when the operation is asynchronous.
6. Report partial permissions honestly. Container Instance Pro requires personal or enterprise real-name verification; elastic deployment and performance monitoring require enterprise verification.

## Safety rules

- Never use AutoDL resources for virtual-currency mining. The official anti-mining policy prohibits it and violations can cause account action and financial liability.
- Treat `release instance` and `delete deployment` as destructive. Require the exact target ID and explicit confirmation in the current conversation. For Pro instances, power off before release.
- Treat create, power-on, replica increase, and elastic deployment creation as billable. Do not infer a budget or acceptable price ceiling.
- Treat power-off, stop container, stop deployment, replica decrease, NFS switching, image saving, blacklist changes, and WeChat messages as state-changing.
- Never place the developer Token in prompts, logs, source files, output, examples, or Git. Load it from `AUTODL_TOKEN`.
- Instance detail can contain `root_password` and `jupyter_token`. Keep them redacted unless the user explicitly needs credentials and understands the exposure.
- Do not expose custom-service URLs to third parties or use them outside the permitted research context described by AutoDL's service agreement.
- Do not promise data durability. Local system/data disks have no redundancy guarantee. Back up important data to durable storage.

## API invariants

- API host: `https://api.autodl.com`.
- Authentication header is the raw token: `Authorization: <token>`; do not prepend `Bearer`.
- Success is `code == "Success"`; preserve `msg` and `request_id` on failure.
- Monetary integer fields such as balance and elastic-deployment prices are in thousandths of a yuan. Divide by 1000 for yuan.
- CUDA versions are integer encodings such as `118` for CUDA 11.8 and `128` for CUDA 12.8.
- Pro snapshot/status are documented as `GET` requests with a JSON body. Use the typed tools; do not silently convert them to query parameters.
- GPU-stock results use a single-card scheduling view. Two idle cards may be on different machines and do not prove a two-GPU container can be scheduled.
- `mountable=1` selects dedicated NFS and turns off ordinary file storage; `mountable=-1` switches back.

## Core operational facts

- Paths: system disk is `/` (~30 GB, captured in images). Data disk is `/root/autodl-tmp` (50 GB free, expandable, local SSD, not captured in images). File storage is `/root/autodl-fs` (20 GB free, durable, ¥0.01/GB/day overage, 200k inode limit). NAS is `/root/autodl-nas` (20 GB free, regional, absent on tidal, ¥0.30/GB/month). Public data is `/root/autodl-pub` (read-only). Jupyter cwd is `/root`. Check usage with `source /root/.bashrc`. Those four special directories do not count as system-disk usage.
- Hugging Face caches: `export HF_HOME=/root/autodl-tmp/cache/`.
- SSH: `ssh -p PORT root@HOST` (hosts such as `connect.REGION.seetacloud.com` or `region-N.autodl.com`). User is `root`. Copy with `scp -rP` (capital `P`) to `/root/autodl-tmp`. Tunnel: `ssh -CNg -L 6006:127.0.0.1:6006 root@HOST -p PORT`. After an image change, remove the local `known_hosts` entry.
- Cardless boot is console-only: 0.5 vCPU / 2 GB / no GPU / ¥0.1/h, one instance per main account. It is not in the Pro API. Pro `power_on` is GPU-mode only.
- Extra paid data-disk capacity bills every calendar day while the instance exists, even when powered off, until shrink-to-0 or release.
- Docker-in-container is unsupported. Multi-node / intranet IP is no longer supported for ordinary consumer GPUs.
- Academic acceleration: `source /etc/network_turbo` for github.com / huggingface.co; `unset http_proxy https_proxy` when done.
- Long jobs started from SSH, VSCode, or PyCharm should run under `screen`, `tmux`, or Jupyter's terminal. Optionally append `/usr/bin/shutdown` after the job.
- A regular instance is normally released after 15 consecutive powered-off days; tidal-compute instances use a shorter 7-day retention rule and have no NAS. Host delisting can also release an instance. Recheck the current official page before relying on a deadline.
- Running status starts compute billing.
- Resetting the system or changing an image clears the system disk but not the data disk. Saving an image captures the system disk, not the data disk.
- AutoDL does not currently support importing arbitrary external images; use platform base images or AutoDL-saved private images.
- Arbitrary public ports require enterprise verification. Every instance maps ports 6006 and 6008; otherwise prefer SSH tunnels.
- `nvidia-smi` reports the maximum CUDA version supported by the driver, not necessarily the CUDA toolkit installed in the image.
- Current GPU prices, promotions, inventory, region availability, quotas, and policy dates are live facts. Verify them instead of relying on the saved documentation snapshot. Do not invent stock or GPU prices.

## Response style

Lead with the result or required decision. For read operations, show the important fields and units. For mutations, show the exact target and final state. If AutoDL denies access because of verification or product entitlement, explain the prerequisite rather than describing the MCP tool as broken.
