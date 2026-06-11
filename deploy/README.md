# Running Minerva in a container — Docker, Kubernetes, ECS Fargate

Minerva ships with a multi-stage [`Dockerfile`](../Dockerfile) that produces a self-contained
image: the compiled agent + API server, the static web app, and the recorded fixtures, all served
from one origin on port **8787**. This is the containerized equivalent of `npm run dev` — and the
alternative to the [Vercel deployment](../DEPLOY.md) when you want to run Minerva on your own
infrastructure (Kubernetes, ECS Fargate, or any container host).

Unlike Vercel, a container **can** run the live agent: it has a real Node process that can spawn
the Dynatrace MCP server subprocess (the image pre-installs it, so live mode needs no npm registry
access at runtime). Notebook export via `dtctl` is the one thing the image does *not* include —
the export endpoint returns a clean `502` and the frontend falls back to a simulated artifact
("Demo mode"), exactly as on Vercel.

## Two modes, one image

| | Fixture demo (default) | Live agent |
|---|---|---|
| What it does | Replays recorded agent runs | Runs the real agent against your Dynatrace tenant |
| Credentials | **None needed** | `DT_*` + Gemini env vars (see [`.env.example`](../.env.example)) |
| Enable with | nothing — it's the default | `MINERVA_LIVE=1` + the env vars |
| Outbound network | none | Dynatrace tenant + Gemini API |

Environment variables the container understands:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Listen port |
| `MINERVA_LIVE` | unset (`0`) | `1` switches from fixture replay to the live agent |
| `MINERVA_REPLAY_SPEED` | `1` | Fixture replay speed multiplier (e.g. `3` = 3× faster) |
| `DT_ENVIRONMENT`, `DT_PLATFORM_TOKEN`, `DT_GRAIL_QUERY_BUDGET_GB` | — | Live mode: Dynatrace tenant + token + query budget |
| `GOOGLE_CLOUD_PROJECT`, `GEMINI_API_KEY` | — | Live mode: Gemini |

## 1. Docker (local)

```bash
# Build
docker build -t minerva .

# Fixture demo — no credentials, open http://localhost:8787
docker run --rm -p 8787:8787 minerva

# Live agent — needs a populated .env (cp .env.example .env, fill it in)
docker run --rm -p 8787:8787 --env-file .env -e MINERVA_LIVE=1 minerva
```

Or with Compose (`docker compose up --build`; set `MINERVA_LIVE=1` in your shell or `.env` to go
live). Verify a running container with:

```bash
curl http://localhost:8787/api/health        # → {"ok":true}
```

then open http://localhost:8787, pick an objective, and watch the investigation stream.

### Image notes

- Runs as the unprivileged `node` user; a `HEALTHCHECK` polls `/api/health`.
- The image pre-installs `@dynatrace-oss/dynatrace-mcp-server` so live mode works air-gapped from
  the npm registry. If you only ever deploy the fixture demo and want a slimmer image, delete that
  `npm install` line from the Dockerfile.
- **SSE caveat for any proxy you put in front of this app:** the investigation streams over
  Server-Sent Events on a single long-lived response. Idle/read timeouts on load balancers and
  reverse proxies must exceed the longest run, and response buffering should be off. The K8s and
  ECS sections below handle this for their respective load balancers.

## 2. Kubernetes

Manifests: [`deploy/k8s/minerva.yaml`](k8s/minerva.yaml) — a 2-replica Deployment, a Service, and
an optional Ingress. The app is **stateless** (each run's state is encoded in its `runId`), so the
POST and the SSE GET can land on different replicas; no sticky sessions or shared storage needed.

### Deploy

```bash
# 1. Push the image to a registry your cluster can pull from
docker build -t <registry>/minerva:0.1.0 .
docker push <registry>/minerva:0.1.0

# 2. Point the manifest at it
sed -i 's|REGISTRY/minerva:TAG|<registry>/minerva:0.1.0|' deploy/k8s/minerva.yaml

# 3. (Live mode only) create the credentials Secret — the Deployment references it as optional,
#    so skip this entirely for the fixture demo
kubectl create secret generic minerva-live \
  --from-literal=DT_ENVIRONMENT=https://your-env.apps.dynatrace.com \
  --from-literal=DT_PLATFORM_TOKEN=your-platform-token \
  --from-literal=GOOGLE_CLOUD_PROJECT=your-project-id \
  --from-literal=GEMINI_API_KEY=your-gemini-key
#    …and flip MINERVA_LIVE to "1" in the Deployment's env.

# 4. Apply
kubectl apply -f deploy/k8s/minerva.yaml

# 5. Smoke-test without an Ingress
kubectl port-forward svc/minerva 8787:80
curl http://localhost:8787/api/health   # → {"ok":true}
```

### Ingress / SSE

The bundled Ingress (ingress-nginx) sets `proxy-read-timeout: 3600` and disables proxy buffering —
both required for the SSE stream to survive a multi-minute investigation. If you use a different
ingress controller or a service mesh, apply the equivalent settings (long read/idle timeout,
buffering off). Delete the Ingress block if you expose the Service another way.

## 3. ECS Fargate

Task definition: [`deploy/ecs/task-definition.json`](ecs/task-definition.json) (0.25 vCPU / 1 GB —
fixture mode idles far below this; live mode appreciates the headroom). Replace `ACCOUNT_ID` and
`REGION` throughout. The walkthrough below uses an Application Load Balancer; adjust names, VPC,
subnets, and security groups to your environment.

```bash
AWS_ACCOUNT=<account-id> AWS_REGION=<region>
ECR=$AWS_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com

# 1. Push the image to ECR
aws ecr create-repository --repository-name minerva --region $AWS_REGION
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR
docker build -t $ECR/minerva:latest .       # on Apple Silicon: docker build --platform linux/amd64 …
docker push $ECR/minerva:latest

# 2. Create the CloudWatch log group the task definition logs to. The task def deliberately does
#    NOT set awslogs-create-group — that would require logs:CreateLogGroup on the execution role,
#    which the standard ecsTaskExecutionRole doesn't have, and the task would die during
#    log-driver initialization before the app starts.
aws logs create-log-group --log-group-name /ecs/minerva --region $AWS_REGION

# 3. Register the task definition (after substituting ACCOUNT_ID / REGION in the file)
aws ecs register-task-definition --cli-input-json file://deploy/ecs/task-definition.json

# 4. Cluster
aws ecs create-cluster --cluster-name minerva

# 5. ALB + target group (target type MUST be `ip` for Fargate awsvpc networking)
aws elbv2 create-target-group --name minerva --protocol HTTP --port 8787 \
  --vpc-id <vpc-id> --target-type ip \
  --health-check-path /api/health --health-check-interval-seconds 30
aws elbv2 create-load-balancer --name minerva --subnets <subnet-a> <subnet-b> \
  --security-groups <alb-sg>
aws elbv2 create-listener --load-balancer-arn <alb-arn> --protocol HTTP --port 80 \
  --default-actions Type=forward,TargetGroupArn=<tg-arn>

# 6. SSE: raise the ALB idle timeout above the longest investigation (default is 60s — too short)
aws elbv2 modify-load-balancer-attributes --load-balancer-arn <alb-arn> \
  --attributes Key=idle_timeout.timeout_seconds,Value=3600

# 7. Service (2 tasks; the app is stateless, no sticky sessions needed)
aws ecs create-service --cluster minerva --service-name minerva \
  --task-definition minerva --desired-count 2 --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<subnet-a>,<subnet-b>],securityGroups=[<task-sg>],assignPublicIp=ENABLED}" \
  --load-balancer "targetGroupArn=<tg-arn>,containerName=minerva,containerPort=8787"
```

The task security group must allow inbound 8787 from the ALB security group. `assignPublicIp` can
be `DISABLED` if your subnets route outbound through a NAT gateway (the fixture demo needs no
outbound at all; live mode needs to reach your Dynatrace tenant and the Gemini API).

Verify: `curl http://<alb-dns-name>/api/health` → `{"ok":true}`, then open the ALB URL and run an
objective end to end.

### Live mode on Fargate

Store credentials in Secrets Manager and inject them — never bake them into the image or put them
in plaintext `environment`:

```bash
aws secretsmanager create-secret --name minerva/live --secret-string '{
  "DT_ENVIRONMENT": "https://your-env.apps.dynatrace.com",
  "DT_PLATFORM_TOKEN": "your-platform-token",
  "GOOGLE_CLOUD_PROJECT": "your-project-id",
  "GEMINI_API_KEY": "your-gemini-key"
}'
```

Then in the task definition, set `MINERVA_LIVE` to `"1"` and add a `secrets` array to the
container definition (the execution role needs `secretsmanager:GetSecretValue` on this secret):

```json
"secrets": [
  { "name": "DT_ENVIRONMENT",       "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:minerva/live:DT_ENVIRONMENT::" },
  { "name": "DT_PLATFORM_TOKEN",    "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:minerva/live:DT_PLATFORM_TOKEN::" },
  { "name": "GOOGLE_CLOUD_PROJECT", "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:minerva/live:GOOGLE_CLOUD_PROJECT::" },
  { "name": "GEMINI_API_KEY",       "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:minerva/live:GEMINI_API_KEY::" }
]
```

Re-register the task definition and update the service
(`aws ecs update-service --cluster minerva --service minerva --task-definition minerva`).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `/api/health` OK but the investigation stalls mid-run | LB/proxy idle timeout or buffering — see the SSE notes above |
| Live run fails immediately | Missing/wrong `DT_*` or Gemini env vars — check container logs |
| Export returns "Demo mode" artifact | Expected: the image has no `dtctl` binary (see top of this doc) |
| Image pull fails on the cluster | Registry auth — `imagePullSecrets` (K8s) / ECR permissions on the execution role (ECS) |
| ECS task stops with `ResourceInitializationError: … awslogs … log group does not exist` | The `/ecs/minerva` log group wasn't created (walkthrough step 2) — create it, or grant `logs:CreateLogGroup` to the execution role and set `awslogs-create-group: "true"` |
