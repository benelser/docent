# Subject survey — Kubernetes (`~/ventures/arch-repos/kubernetes`)

## What it is

The container orchestrator. Go. You declare desired state; the system
converges reality toward it, continuously.

## The control plane (`cmd/`)

- **kube-apiserver** (`cmd/kube-apiserver`) — the only front door; the only
  component that touches storage. All reads/writes/watches go through it.
- **etcd** — external dependency; the consistent key-value store holding all
  cluster state.
- **kube-scheduler** (`cmd/kube-scheduler`) — assigns unscheduled pods to nodes.
- **kube-controller-manager** (`cmd/kube-controller-manager`) — runs the
  controllers (`pkg/controller/` — one per object kind).

## The node (`cmd/`)

- **kubelet** (`cmd/kubelet`) — the node agent; watches the API server, drives
  the container runtime via the CRI, reports status back.
- **kube-proxy** (`cmd/kube-proxy`) — programs Service networking.

## The core idea — reconciliation

Every controller (`pkg/controller/*`) runs the same loop: know desired state
(watch the API server), observe actual state, diff, act, repeat. This is what
makes the cluster self-healing. `staging/src/k8s.io/apimachinery/pkg/watch` is
the watch machinery underneath.

## Film — `films/kubernetes.json`

title · controlplane (diagram) · nodes (diagram) · declarative (**code** — a
Deployment YAML) · reconcile (diagram — the control loop) · flow
(**sequence** — `kubectl apply` → running pod) · recap.
