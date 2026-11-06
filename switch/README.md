# Switch + RelayOps agent integration

## Verified status — 2026-11-06

- **Switch / Mattermost:** no Switch Console/release, Gateway, Mattermost server, `relayops-dispatch` room, connected provider, or human-to-agent exchange was available in the Reason cloud environment. The setup below follows the current official docs, not a validation against an installed Switch version; no live chat evidence is claimed.
- **Provider:** none is installed or signed in here. Switch's official docs list Claude Code, Codex, Cursor, OpenCode, and Antigravity as supported providers.
- **RelayOps API:** `develop` now contains the incident-detail, persisted approval-read, and approved execution routes (merged PR #19). A separate isolated checkout ran the real local Next.js app against temporary SQLite with synthetic keys: it created `INC-1042`, then the RelayOps client and MCP `getIncident` call read that record. The live integration tests passed 2/2 and confirmed `x-agent-api-key` (no `Authorization`), `X-Request-ID`, and matching `correlationId`. This is local application evidence only—not an external or production API call. Approval-read and execution have passed engineer-reported isolated persisted SQLite route-handler tests and two local HTTP golden-path smoke runs (PR #17); real Switch/Mattermost execution and an external deployment remain unverified.
- **Adapter:** the HTTP client now authenticates with `x-agent-api-key`, sends `X-Request-ID` on every outgoing request (including reads), and keeps `Idempotency-Key` on business mutations. The API returns a valid request ID as `correlationId`. Approval reads use the agreed `GET /api/v1/recovery/approvals/:planId` route; execution remains subject to the API's atomic revalidation.
- **Switch registration:** `switch/relayops-mcp.mjs` implements a local MCP stdio server over the typed RelayOps tool gateway. It is intended to be added as an MCP server in the chosen provider's own configuration, not registered through an undocumented Switch endpoint. No live provider loaded this MCP server in this environment.
- **Environment:** This Reason cloud has no Switch Console, provider sign-in, Mattermost room, external `RELAYOPS_API_BASE_URL`, or saved RelayOps keys; `docker` is unavailable. The separate local smoke used a temporary SQLite database and generated test-only keys outside the repository, then stopped the preview and removed its temporary files.

The local HTTP smoke proves the adapter/MCP path against the real app in an isolated test environment. It does not prove a deployed service, live Switch registration, or human-to-agent Mattermost communication.

## Why the adapter is an MCP server

The official Switch [onboarding guide](https://docs.switchagents.ai/switch-rooms/getting-started/onboard-your-agents) says the agent can use the provider's existing setup, including MCP servers. [Sessions and the runtime](https://docs.switchagents.ai/switch-rooms/internals/connectors-and-runtime) says Switch starts the selected provider and gives it Switch's own MCP tools; the provider's other MCP servers are not Switch operations. The [agent settings guide](https://docs.switchagents.ai/switch-rooms/getting-started/agent-settings) describes tool restrictions but does not document an API for adding custom Switch operations. Therefore RelayOps uses a provider-configured MCP server; this repository does not invent a Switch Gateway endpoint or use the agent-client registration API as a custom-tool API.

Configure the server in the provider's documented MCP settings. Switch's [onboarding guide](https://docs.switchagents.ai/switch-rooms/getting-started/onboard-your-agents) says provider setup carries over, including MCP servers, while its [troubleshooting guide](https://docs.switchagents.ai/switch-rooms/resources/troubleshooting#a-tool-that-works-in-your-terminal-fails-in-switch) warns that Switch passes only a fixed set of environment variables. Put required values in the MCP server's own environment block, in user-level configuration or a secret store—not a project file that might be committed, a room message, or agent instructions.

For Codex, the current [Codex MCP guide](https://developers.openai.com/codex/extend/mcp) documents `~/.codex/config.toml`, a stdio `command`/`args` entry, `cwd`, and `env`. Replace the example paths, API origin, and key placeholder locally; never commit real credentials. This read-only setup needs only the read-scoped key. Add proposal or execution keys only after those backend routes are deployed and reviewed:

```toml
[mcp_servers.relayops]
command = "/absolute/path/to/node"
args = ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", "switch/relayops-mcp.mjs"]
cwd = "/absolute/path/to/Relay-ops"

[mcp_servers.relayops.env]
RELAYOPS_API_BASE_URL = "https://relayops.example.invalid"
AGENT_READ_API_KEY = "replace-with-read-key"
```

Use Node.js 22.6 or newer on the provider's Run location. For other Switch-supported providers, follow that provider's current official MCP setup and keep credentials in its user-level configuration or secret store. The standalone launch command from the repository root is:

```text
node --experimental-strip-types --disable-warning=ExperimentalWarning switch/relayops-mcp.mjs
```

The provider launches the server over stdio. Use an API origin reachable from the agent process. Plain HTTP is accepted only for loopback; use HTTPS for a remote host. `X-Request-ID` is sent on every request; if `RELAYOPS_REQUEST_ID_HEADER` is set, it must be `X-Request-ID` (header names are case-insensitive). Keep the RelayOps MCP tools enabled in provider/agent tool restrictions. Verify the provider reports signed in and the agent can call `getIncident` before claiming integration.

## RelayOps credentials and contracts

Use distinct server-side keys:

- `AGENT_READ_API_KEY` — incident, shipment, vehicle, simulation, and persisted approval reads.
- `AGENT_PROPOSE_API_KEY` — versioned plan proposals.
- `AGENT_EXECUTE_API_KEY` — approved execution only.

The adapter sends the selected key as `x-agent-api-key`; it does not send a bearer `Authorization` header. Every API request gets a generated UUID in `X-Request-ID`. The server is the authority for authorization, plan version/hash, expiry, consumption, capacity, and idempotency. Chat text such as “approved” is never an approval source.

Engineer 6 confirmed this contract:

- `GET /api/v1/recovery/approvals/:planId` is a read-scope route and returns the persisted approval's `planId`, `planHash`, `planVersion`, decision/status, dispatcher identity/timestamp, expiry, consumed time, and reason in the `{data, correlationId}` envelope. A missing approval is a `404`.
- `POST /api/v1/recovery/execute` accepts `{approvalId, planId, idempotencyKey}` with `X-Request-ID` and `Idempotency-Key`, and is agent-execute-only. The service must atomically recheck dispatcher provenance, exact current plan hash/version, expiry, consumption, shipment state, and capacity; the returned receipt includes the assignment/case/event IDs and resulting status.

The execution service is present on `develop` and has passed engineer-reported local persisted API integration tests; no Switch/Mattermost-mediated execution or remote deployed service has been verified. The adapter validates the read approval record before requesting execution, and the business service must independently enforce the transaction invariants.

## Reproduce a real Switch room

Use the current official [Switch Console installation](https://docs.switchagents.ai/switch-rooms/getting-started/install-switch-console), [Add a server](https://docs.switchagents.ai/switch-rooms/getting-started/add-a-server), [provider setup](https://docs.switchagents.ai/switch-rooms/getting-started/set-up-agent-providers), [agent onboarding](https://docs.switchagents.ai/switch-rooms/getting-started/onboard-your-agents), [room creation](https://docs.switchagents.ai/switch-rooms/getting-started/create-a-room), and [Mattermost connection](https://docs.switchagents.ai/switch-rooms/deploy/messaging-apps/mattermost) guides for the installed release. Linux x86_64 availability is release-dependent; follow the official host/platform requirements rather than assuming this cloud image supports the Console.

1. On a supported host, install and open Switch Console. For a self-contained local Switch stack, use **Add a server → Run a server on this computer** with Docker running; Console provisions the Switch stack and bundled Mattermost. Alternatively, connect to a team server or an onboarded remote host. Switch troubleshooting documents that the bundled chat app is the Docker-dependent part; an existing/external messaging app is another option. For this task, follow the official [Mattermost connection guide](https://docs.switchagents.ai/switch-rooms/deploy/messaging-apps/mattermost): an external Mattermost must be reachable from the Switch server, have bot-account creation enabled, and provide an admin account plus the team's URL slug.
2. Install one supported provider and sign it in. Add the RelayOps MCP stdio server to that provider's own MCP configuration, supplying the API origin and scoped keys through a user-level environment block.
3. In Switch Console, onboard `relay-recovery` with this repository as its working directory and the instructions in [agent-system-instructions.md](agent-system-instructions.md). Verify the provider is signed in and retain access to the provider's MCP tools. Leave **Bypass permissions** off.
4. Create `relayops-dispatch` through Switch's room UI with the agent and a real dispatcher whose Mattermost account is linked to their Switch user. Configure **Who can talk to your agent** deliberately to include that dispatcher; the default is the owner and the owner's agents, so keep the audience no broader than needed.
5. In Mattermost, send a human request such as `@relay-recovery investigate INC-1042 and report affected shipments; do not execute anything`. Capture the actual human message and agent reply, then verify a tool result against the API response and its request ID. Do not stage a mock chat or screenshot.

Switch officially supports Claude Code, OpenCode, Codex, Cursor, and Antigravity; it starts the chosen provider on a machine you control. Set up and sign in to the provider on the same machine (or onboarded host) that Switch runs the agent on. Follow Switch's documented **Your Agents** onboarding flow to choose the provider, directory, name and settings, then invite that agent to a room. This is not an MCP registration endpoint: MCP is configured on the provider itself.

Switch's standard agent registration, connection, and operations endpoints are for a client implementing the Switch agent protocol; this RelayOps MCP server is not such a client. Use the official protocol only if building a custom agent client becomes necessary.

## Checks and blockers

```text
npm test                       passed (29 passed, 5 skipped)
npm run typecheck              passed
npm run build                  passed
git diff --check                passed
Codex MCP TOML example         parsed successfully
node --experimental-strip-types --disable-warning=ExperimentalWarning --test --test-reporter=tap tests/relayops-agent-tools.integration.test.mjs
                               passed (2/2; isolated Next.js + SQLite)
MCP tools/call getIncident     passed; returned INC-1042
Live remote API / Switch chat  not run; no external API or configured Switch/Mattermost
```

The full test suite still skips five live/golden-path checks when run without environment credentials. A separate isolated run of `node --experimental-strip-types --disable-warning=ExperimentalWarning --test --test-reporter=tap tests/relayops-agent-tools.integration.test.mjs` passed both live integration tests against the local app and synthetic SQLite data; the MCP `tools/call getIncident` returned `INC-1042`. It verified `x-agent-api-key`, no bearer `Authorization`, and that `X-Request-ID` equals the API's `correlationId`. It does not prove an external or production API, or that Switch loaded the MCP server. No human Switch/Mattermost exchange or provider registration was observed. To demonstrate that, a human-controlled supported Switch runtime needs a signed-in provider, the user-level MCP configuration above, a reachable API with approved scoped keys, a real Mattermost connection and linked dispatcher account, and an actual room/tool-call exchange.
