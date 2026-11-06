# Switch + RelayOps agent integration

## Verified status — 2026-11-06

- **Switch / Mattermost:** no Switch Console, Gateway, Mattermost server, `relayops-dispatch` room, connected provider, or human-to-agent exchange was available in the Reason cloud environment. No live chat evidence is claimed.
- **Provider:** none is installed or signed in here. Switch's official docs list Claude Code, Codex, Cursor, OpenCode, and Antigravity as supported providers.
- **RelayOps API:** no API process or usable API credentials were configured in this checkout. The fetched `develop` tree does not contain the backend recovery endpoints; Engineer 1's PR #12 is separate and unmerged. I installed its backend dependencies and applied its SQLite migration in an isolated scratch worktree, but could not start the HTTP server because the shared cloud had reached its preview-server limit. No authenticated HTTP request was made. Engineer 6 confirmed the approval-read and execution contracts; those service behaviors remain unverified here.
- **Adapter:** the HTTP client now authenticates with `x-agent-api-key`, sends `X-Request-ID` on every outgoing request (including reads), and keeps `Idempotency-Key` on business mutations. The API returns a valid request ID as `correlationId`. Approval reads use the agreed `GET /api/v1/recovery/approvals/:planId` route; execution remains subject to the API's atomic revalidation.
- **Switch registration:** `switch/relayops-mcp.mjs` implements a local MCP stdio server over the typed RelayOps tool gateway. It is intended to be added as an MCP server in the chosen provider's own configuration, not registered through an undocumented Switch endpoint. No live provider loaded this MCP server in this environment.
- **Environment:** Reason cloud Linux, Node.js `v22.23.4`, npm `10.9.9`. `docker --version` and `docker compose version` both returned `command not found`. `RELAYOPS_API_BASE_URL`, `RELAYOPS_REQUEST_ID_HEADER`, and the read/propose/execute API credentials were unset; no Workspace secrets were available. The isolated test keys and worktree were removed after the server could not be started.

The code and the live proof are separate milestones. The mocked tests verify adapter behavior; they do not prove an authenticated API call, Switch setup, or Mattermost communication.

## Why the adapter is an MCP server

The official Switch [onboarding guide](https://docs.switchagents.ai/switch-rooms/getting-started/onboard-your-agents) says the agent can use the provider's existing setup, including MCP servers. [Sessions and the runtime](https://docs.switchagents.ai/switch-rooms/internals/connectors-and-runtime) says Switch starts the selected provider and gives it Switch's own MCP tools; the provider's other MCP servers are not Switch operations. The [agent settings guide](https://docs.switchagents.ai/switch-rooms/getting-started/agent-settings) describes tool restrictions but does not document an API for adding custom Switch operations. Therefore RelayOps uses a provider-configured MCP server; this repository does not invent a Switch Gateway endpoint or use the agent-client registration API as a custom-tool API.

Configure the server in the provider's documented MCP configuration with this launch command from the repository root:

```text
node --experimental-strip-types --disable-warning=ExperimentalWarning switch/relayops-mcp.mjs
```

The provider launches it over stdio. Its MCP configuration must supply `RELAYOPS_API_BASE_URL` and the scoped RelayOps keys in the MCP server's own environment block. Switch passes only a fixed set of environment variables to the agent, so do not rely on arbitrary shell variables being inherited. Keep those values in the provider's user-level configuration or secret store, never in this repository, project-level MCP configuration, agent instructions, or room messages. If `RELAYOPS_REQUEST_ID_HEADER` is set, it must be `x-request-id`; the adapter defaults to `X-Request-ID` when it is absent or blank.

Use an API origin reachable from the agent process. Plain HTTP is accepted only for loopback; use HTTPS for a remote host. In provider/agent tool restrictions, keep the RelayOps MCP tools available. Verify the provider reports signed in and the agent can call `getIncident` before claiming integration.

## RelayOps credentials and contracts

Use distinct server-side keys:

- `AGENT_READ_API_KEY` — incident, shipment, vehicle, simulation, and persisted approval reads.
- `AGENT_PROPOSE_API_KEY` — versioned plan proposals.
- `AGENT_EXECUTE_API_KEY` — approved execution only.

The adapter sends the selected key as `x-agent-api-key`; it does not send a bearer `Authorization` header. Every API request gets a generated UUID in `X-Request-ID`. The server is the authority for authorization, plan version/hash, expiry, consumption, capacity, and idempotency. Chat text such as “approved” is never an approval source.

Engineer 6 confirmed this contract:

- `GET /api/v1/recovery/approvals/:planId` is a read-scope route and returns the persisted approval's `planId`, `planHash`, `planVersion`, decision/status, dispatcher identity/timestamp, expiry, consumed time, and reason in the `{data, correlationId}` envelope. A missing approval is a `404`.
- `POST /api/v1/recovery/execute` accepts `{approvalId, planId, idempotencyKey}` with `X-Request-ID` and `Idempotency-Key`, and is agent-execute-only. The service must atomically recheck dispatcher provenance, exact current plan hash/version, expiry, consumption, shipment state, and capacity; the returned receipt includes the assignment/case/event IDs and resulting status.

The execution service was not yet available in the checked-out `develop` branch, so its runtime behavior remains unverified. The adapter validates the read approval record before requesting execution, and the business service must independently enforce the transaction invariants.

## Reproduce a real Switch room

Use the current official [Switch Console installation](https://docs.switchagents.ai/switch-rooms/getting-started/install-switch-console), [provider setup](https://docs.switchagents.ai/switch-rooms/getting-started/set-up-agent-providers), [room creation](https://docs.switchagents.ai/switch-rooms/getting-started/create-a-room), and [Mattermost connection](https://docs.switchagents.ai/switch-rooms/deploy/messaging-apps/mattermost) guides for the installed release. Linux x86_64 availability is release-dependent; follow the official host/platform requirements rather than assuming this cloud image supports the Console.

1. On a supported host with Docker installed, install and open Switch Console, then use its documented **Add a server** flow to start a Switch server and bundled Mattermost.
2. Install one supported provider and sign it in. Add the RelayOps MCP stdio server to that provider's own MCP configuration, supplying the API origin and scoped keys through a user-level environment block.
3. In Switch Console, onboard `relay-recovery` with this repository as its working directory and the instructions in [agent-system-instructions.md](agent-system-instructions.md). Verify the provider is signed in and retain access to the provider's MCP tools.
4. Create `relayops-dispatch` through Switch's room UI with the agent and a real, linked human dispatcher.
5. In Mattermost, send a human request such as `@relay-recovery investigate INC-1042 and report affected shipments; do not execute anything`. Capture the actual human message and agent reply, then verify a tool result against the API response and its request ID. Do not stage a mock chat or screenshot.

Switch's standard agent registration, connection, and operations endpoints are for a client implementing the Switch agent protocol; this RelayOps MCP server is not such a client. Use the official protocol only if building a custom agent client becomes necessary.

## Checks and blockers

```text
node --version                 v22.23.4
npm --version                  10.9.9
docker --version               command not found
docker compose version         command not found
npm test                       passed (28 passed, 4 skipped)
npm run typecheck              passed
git diff --check               passed
MCP stdio startup smoke        passed (8 tools listed; protocol 2025-06-18)
live agent API GET             skipped: no reachable server; shared preview-server capacity was full
Switch/Mattermost human reply  not run: Console/provider/server unavailable
```

The unit tests use an injected fetch stub, and the MCP tests exercise local protocol messages. Neither is live service evidence. `tests/relayops-agent-tools.integration.test.mjs` runs only when `RELAYOPS_API_BASE_URL` and `AGENT_READ_API_KEY` are set; run it against a real server with `npm test` and inspect its result. The current cloud needs a supported host with Docker + Switch Console, one signed-in provider, a real Mattermost room/human account, a running RelayOps API with the three scoped keys, and an API address reachable from the provider process before the live workflow can be demonstrated.
