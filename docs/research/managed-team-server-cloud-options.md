# Managed Team Server demo: cloud infrastructure options

Research date: 2026-09-01

## Decision to make

Choose infrastructure for an internal, allowlisted demo with one isolated Linux
TeamRun Runtime per Team, approximately 1 shared vCPU, 2 GB RAM, and 10 GB of
persistent data. Operators pre-provision and bind each Runtime, keep it until
manual deletion, expose it through secure WSS, and use the existing Team Server
and Team Agent protocols unchanged.

## Recommendation

Use a **DigitalOcean Basic Droplet plus a 10 GiB Volume** for the demo:

- `s-1vcpu-2gb`, Ubuntu 24.04 x64, 1 vCPU, 2 GiB RAM, and 50 GiB boot disk;
- one separately managed 10 GiB Volume for `/home/orca`;
- one free Cloud Firewall, allowing public `443`, limiting `22` to operator
  addresses, and leaving the Runtime's `6768` port private to the host;
- a per-Team DNS name and Caddy or nginx on the Droplet to terminate TLS and
  proxy WebSocket upgrades to `orca serve`;
- the free DigitalOcean metrics agent plus `systemd`/journal logs.

This is the only shortlisted option that matches the requested CPU and memory
without an OS-level quota or a larger VM. It also preserves TeamRun's documented
AppImage + `systemd` operating model, so the demo tests Team Agent behavior
rather than a new container packaging model. The estimated steady-state price
is **$13/Team-month**: $12 for the Droplet and $1 for a 10 GiB Volume, before tax,
backup snapshots, excess egress, DNS, or a domain. DigitalOcean publishes the
1-vCPU/2-GiB plan at $12/month and Volumes at $0.10/GiB-month
([Droplet pricing](https://www.digitalocean.com/pricing/droplets),
[Volume pricing](https://docs.digitalocean.com/products/volumes/details/pricing/)).

Hetzner is the cost fallback when the testers can use an EU location. Fly.io is
the follow-up candidate if automated start/stop and provider-managed TLS become
more important than keeping the packaged-runtime deployment unchanged. Amazon
Lightsail is viable but has no demo-specific advantage over DigitalOcean.

## Runtime constraints from this repository

The provider must accommodate the packaged Runtime rather than only a Node web
service:

- The supported host floor is Ubuntu 20.04 or newer, current Debian stable, and
  glibc 2.31 or newer. Linux packages must include Xvfb and Electron's runtime
  libraries. Docker-like environments have no FUSE device by default, so the
  AppImage must be extracted once and launched through `squashfs-root/AppRun`
  there. See [Headless Linux Server](../reference/headless-linux-server.md) and
  [Linux glibc compatibility](../reference/linux-glibc-compatibility.md).
- The service should run as an unprivileged `orca` user under `systemd`, with
  `LIBGL_ALWAYS_SOFTWARE=1`, controlled restart behavior, and a root-owned
  executable. A Team Server also needs OpenCode on that user's `PATH` and a
  stable `TEAMRUN_MODEL_CONNECTION_KEY`; losing the key makes stored Model
  Connections unreadable. See
  [Headless Linux Server](../reference/headless-linux-server.md#systemd-service).
- Durable state is under the service user's home, especially
  `/home/orca/.config/orca` and `/home/orca/.config/TeamRun`; projects,
  worktrees, paired-device keys, terminal history, and orchestration state must
  survive a restart and binary replacement. The cleanest demo layout is to put
  the entire `/home/orca` on the 10 GiB data volume.
- `orca serve` listens on WebSocket and accepts a complete reverse-proxy URL in
  `--pairing-address`; `https://` is advertised as `wss://`. The proxy must pass
  WebSocket upgrades and the advertised path. Pairing URLs contain device and
  E2EE capability material and must not be written to proxy access logs. See
  [Pairing troubleshooting](../reference/headless-linux-server.md#pairing-troubleshooting).
- Headless Runtime updates are operator-driven. There is no headless
  auto-updater, so deployment must pin and record an AppImage version and replace
  it deliberately. Application builds and packages remain GitHub Actions
  artifacts; the cloud host only consumes the selected artifact.

At 2 GB RAM, the resource target is a hypothesis, not an established capacity
result. Electron, Xvfb, OpenCode, one coding agent, Git, and the repository's own
dependency commands share that limit. The demo should permit one concurrent
Development Run and measure peak RSS, swap use, disk use, and agent completion
before treating this size as sufficient.

## Comparison

Prices are the nearest published configuration as of the research date, in USD
where available. Totals include a separately managed 10 GB/GiB data volume even
when the VM already includes a larger boot disk, because the volume gives the
operator an explicit durable-data lifecycle. Taxes, backups, domains, and excess
egress are excluded.

| Option                         | Nearest shape and approximate monthly cost                                                                                                                 | Deployment effort                                                                                                                                                      | Persistence and restart                                                                                                                                                                                              | WSS and network boundary                                                                                                                                                                            | Observability                                                                                                             | Main constraint                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **DigitalOcean Basic Droplet** | Exact: 1 vCPU, 2 GiB, 50 GiB boot at $12; 10 GiB Volume $1; **$13 total**                                                                                  | **Low.** Ubuntu VM, cloud-init, API/CLI, native AppImage + `systemd`                                                                                                   | Volume is a network block device independent of CPU/RAM; start/stop/reboot are API actions. Powered-off Droplets and detached Volumes still bill.                                                                    | Operator-managed DNS/TLS proxy. Free stateful Cloud Firewall; expose only 443 and restricted SSH.                                                                                                   | Free opt-in agent provides CPU, memory, disk, load, alerts, and custom metrics; journal is available in the guest.        | TLS/DNS, application health checks, log export, and Volume snapshots are ours to operate.                                       |
| **Hetzner Cloud CX23 (EU)**    | Nearest x64 plan: 2 vCPU, 4 GB, 40 GB boot; $6.49 after the 2026-06-15 adjustment, $0.60 Primary IPv4, about $0.48 for 10 GB Volume; **about $7.57 total** | **Low.** Conventional Ubuntu VM, REST API/CLI, AppImage + `systemd`                                                                                                    | Server and volume bill while powered off. Volumes auto-mount and replicate blocks across three physical servers, but server backups do not include attached Volumes.                                                 | Operator-managed DNS/TLS proxy. Free stateful Cloud Firewalls; public IPv4 optional.                                                                                                                | Host graphs cover CPU and network, not RAM; add an in-guest metrics agent and alerts.                                     | Cheapest only in EU; overprovisioned for the target, less built-in guest monitoring, and Volume backup is entirely ours.        |
| **Amazon Lightsail Small**     | 2 vCPU, 2 GB, 60 GB boot and public IPv4 at $12; 10 GB attached SSD disk $1; **$13 total**                                                                 | **Low-medium.** Ubuntu blueprint, API/CLI launch script, AppImage + `systemd`; AWS IAM/setup adds ceremony.                                                            | Attached disks persist independently and can move between instances. A static IPv4 should be attached before restart; it is free while attached.                                                                     | Operator-managed DNS/TLS proxy and per-instance Lightsail firewall.                                                                                                                                 | Built-in CPU, burst, network, and status-check metrics with alarms; memory and filesystem metrics need an in-guest agent. | No price or operational advantage over DigitalOcean for this exact demo.                                                        |
| **Fly.io Machine + Volume**    | `shared-cpu-1x`, 2 GB at $11.11; 10 GB Volume $1.50; shared IPv4 and first ten hostname certificates free; **about $12.61 total while running**            | **Medium-high.** Build an OCI image containing extracted TeamRun, Electron libraries, Xvfb, and OpenCode; replace `systemd` with the Machine entrypoint/init contract. | Rootfs is ephemeral on restart/deploy. A mounted Volume persists, but is tied to one physical host, has no automatic replication, and can attach to only one Machine. Daily snapshots default to five-day retention. | **Lowest TLS effort.** Fly Proxy supplies HTTPS/TLS termination, managed certificates, Anycast addresses, and routing to the internal port. End-to-end long-lived WSS behavior still needs a spike. | Managed Prometheus-compatible metrics, Grafana dashboards, live/searchable logs, and API export.                          | A single Volume can lose data on host failure; container adaptation makes this a platform experiment as well as a product demo. |

### DigitalOcean evidence

DigitalOcean describes each Droplet as an independent Linux VM and publishes the
exact Basic size at 1 vCPU, 2 GiB RAM, 50 GiB SSD, and $12/month
([Droplet pricing](https://www.digitalocean.com/pricing/droplets)). Creation can
accept cloud-init user data through the control panel, API, or `doctl`, which is
enough to install packages, users, SSH keys, proxy configuration, and the
`systemd` unit
([Droplet user data](https://docs.digitalocean.com/products/droplets/how-to/provide-user-data/)).

Volumes are network-attached, work like local block devices, support Ubuntu
auto-format/mount, and are independently created, attached, detached, and
snapshotted through the API. A 10 GiB Volume costs $1/month and continues billing
while detached
([Volume features](https://docs.digitalocean.com/products/volumes/details/features/),
[Volume API](https://docs.digitalocean.com/products/volumes/reference/api/block-storage/),
[Volume pricing](https://docs.digitalocean.com/products/volumes/details/pricing/)).
Volumes are not part of Droplet backups, so they need their own snapshots. They
are not destroyed with a Droplet unless the operator explicitly selects the
associated resource
([Volume limits](https://docs.digitalocean.com/products/volumes/details/limits/),
[Droplet destruction](https://docs.digitalocean.com/products/droplets/how-to/destroy/)).
The operator can reboot, power-cycle, shut down, power off, and power on a
Droplet through the API. The VM continues billing until destroyed
([Droplet actions](https://docs.digitalocean.com/products/droplets/reference/api/droplet-actions/),
[Droplet billing](https://docs.digitalocean.com/products/droplets/details/pricing/)).

Cloud Firewalls are stateful, block traffic not expressly allowed, and cost
nothing. DigitalOcean Monitoring is also free and opt-in; its agent supplies
CPU, memory, disk, load, alerting, and custom metrics
([Cloud Firewalls](https://docs.digitalocean.com/products/networking/firewalls/details/),
[Monitoring](https://docs.digitalocean.com/products/monitoring/getting-started/quickstart/)).
Neither feature replaces an external WSS connection check or durable collection
of `orca-serve.service` logs.

### Hetzner evidence

The CX23's published shape is 2 vCPU, 4 GB RAM, and 40 GB SSD. Hetzner's price
adjustment effective 2026-06-15 puts new EU CX23 orders at $6.49/month excluding
IPv4; a Primary IPv4 is $0.60/month. Ten gigabytes of block storage is about
$0.48/month at the published $0.0484/GB rate
([cloud plans](https://www.hetzner.com/cloud/),
[2026 price adjustment](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/),
[IP pricing](https://docs.hetzner.com/general/infrastructure-and-availability/ipv4-pricing/)).
CX plans use shared CPU resources, which Hetzner positions for variable,
low-to-medium workloads rather than continuous CPU saturation
([server FAQ](https://docs.hetzner.com/cloud/servers/faq/)).

The Cloud API manages servers and network resources over REST. Hetzner also
provides free stateful firewalls and private networks
([Cloud API](https://docs.hetzner.cloud/reference/cloud),
[cloud features](https://www.hetzner.com/cloud/)). Volumes start at 10 GB, can
auto-format and auto-mount, and triple-replicate each block, but cannot be cloned
and are excluded from server snapshots and backups
([Volume overview](https://docs.hetzner.com/cloud/volumes/overview/),
[Volume FAQ](https://docs.hetzner.com/cloud/volumes/faq/)). Host-level graphs
include CPU and network traffic but cannot show RAM without software inside the
guest
([server FAQ](https://docs.hetzner.com/cloud/servers/faq/)). Servers remain
billable regardless of power state, so stopping is operational, not a demo cost
control
([billing FAQ](https://docs.hetzner.com/cloud/billing/faq/)).

### Amazon Lightsail evidence

The Linux Small bundle with public IPv4 has 2 vCPUs, 2 GB RAM, 60 GB storage,
3 TB transfer, and a $12 monthly price
([Lightsail bundles](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html)).
The CLI/API can create an Ubuntu instance and execute a launch script as user
data
([`create-instances`](https://docs.aws.amazon.com/cli/latest/reference/lightsail/create-instances.html)).
Attached SSD block storage costs $0.10/GB-month, starts at 8 GB, persists
independently of the instance, and can be detached, moved, and snapshotted
([block storage pricing](https://aws.amazon.com/lightsail/features/highly-available-storage/),
[block storage FAQ](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-block-storage.html)).

The default public IPv4 changes after a stop/restart. An attached static IPv4 is
free and remains stable, so the demo must attach one before publishing DNS
([static IPs](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-static-ip-addresses-in-amazon-lightsail.html)).
Lightsail firewalls control public inbound ports. Built-in instance metrics cover
CPU, burst capacity, network, and status checks, and Lightsail can alarm on those
metrics; memory and filesystem use are not on the instance metric list
([firewalls](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-firewall-and-port-mappings-in-amazon-lightsail.html),
[instance metrics](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-instance-health-metrics-in-amazon-lightsail.html)).

### Fly.io evidence

A running shared-CPU Machine with one CPU and 2 GB RAM is $11.11/month; Volumes
are $0.15/GB-month. Apps receive shared IPv4 and IPv6 addresses, and the first ten
single-host certificates in an organization are free
([Fly pricing](https://fly.io/docs/about/pricing/),
[public networking](https://fly.io/docs/networking/services/)). The Machines API
can create, start, stop, update, and delete apps, Machines, and Volumes, and it
accepts a container image plus exact CPU/memory, volume mounts, secrets, restart
policy, and health checks
([Machines API](https://fly.io/docs/machines/api/),
[Machine resource](https://fly.io/docs/machines/api/machines-resource/)).

Fly Proxy terminates TLS with managed Let's Encrypt or uploaded certificates and
forwards plaintext over Fly's WireGuard mesh. Its HTTP service maps ports 80/443
to an internal port and exposes an idle-timeout control
([TLS termination](https://fly.io/docs/security/tls-termination/),
[`fly.toml` HTTP service](https://fly.io/docs/reference/configuration/#the-http_service-section)).
This strongly suggests a direct mapping from `wss://<team>.fly.dev` to port 6768,
but that is an inference: the demo must prove upgrade handling, long-lived idle
connections, reconnects, and TeamRun's advertised path before selecting Fly.

Fly explicitly documents that Machine root filesystems are ephemeral on restart
and deploy, while Volumes persist. A Volume is local NVMe tied to one physical
host, has a one-to-one Machine relationship, and is not automatically replicated.
Automatic daily snapshots default to five days, but Fly warns they are not a
primary backup and recent writes can be lost after host failure
([Volumes](https://fly.io/docs/volumes/overview/),
[volume snapshots](https://fly.io/docs/volumes/snapshots/)). This is acceptable
for disposable internal demo data only; it is weaker than the eventual product
promise implied by "save files in our cloud."

## Demo deployment outline

1. Provision one tagged DigitalOcean project resource set per allowlisted Team:
   Droplet, Volume, firewall assignment, and DNS name. Keep the Team-to-resource
   binding in the existing Team Server enrollment model rather than inventing a
   new Runtime type.
2. Consume a pinned Linux x64 AppImage produced by GitHub Actions. Cloud-init
   installs the documented Electron/Xvfb prerequisites, OpenCode, a TLS proxy,
   and the `orca` service user; it mounts the Volume as `/home/orca` before
   enabling `orca-serve.service`.
3. Deliver `TEAMRUN_MODEL_CONNECTION_KEY` from an operator-controlled secret
   store into the root-readable environment file. Do not bake it, Model
   Connection keys, pairing URLs, or API tokens into the VM image or logs.
4. Launch `orca serve` on port 6768 with
   `--pairing-address https://<team-runtime-host>`, listening behind the local
   TLS proxy. The cloud firewall must not expose 6768 directly.
5. Set `Restart=on-failure`, retain the existing restart-rate protections, and
   keep auto-suspend and auto-delete disabled. Destruction is a separate manual
   operator action and must not implicitly delete the Volume.
6. Collect provider metrics and journal logs, alert on CPU, memory, disk, and
   process failure, and add a synthetic WSS pairing/reconnect check. Scrub pairing
   URLs and authorization material.

## Validation gates before calling the infrastructure proven

- Complete the documented Web + local Runtime flow first, then repeat it through
  the cloud WSS endpoint, then use the CI-packaged desktop client against the
  same cloud Runtime.
- Reboot the Droplet and verify the Team Server reconnects without re-pairing,
  files and worktrees remain, Model Connections still decrypt, and an interrupted
  Development Run reaches a documented terminal state.
- Run the target path end to end: create Team Task, start Developer Agent, create
  isolated worktree, stream activity, inspect diff, and publish the result.
- Measure peak memory and disk consumption during repository clone, dependency
  installation, and one Agent Run. Reject 2 GB if the kernel invokes the OOM
  killer or completion time is unsuitable; do not hide a capacity failure by
  adding concurrency.
- Verify WSS upgrade, idle connection, reconnect, certificate renewal, DNS
  replacement, and old-client/new-Runtime wire compatibility.
- Destroy a test Droplet while preserving its Volume, recreate the host, restore
  the stable encryption key, remount `/home/orca`, and prove recovery. This is the
  minimum evidence that "persistent" means more than surviving `reboot`.

## Scope boundary

This recommendation is for an internal demo with disposable test repositories
and manual operations. It does not decide production multi-region durability,
backup retention, data export/deletion guarantees, abuse controls, billing,
automatic provisioning, SLA, or public multi-tenant security. Those decisions
should not be inferred from the selected demo provider.
