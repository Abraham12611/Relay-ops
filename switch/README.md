# Switch + RelayOps integration

## Verified status — 2026-11-06

- **Switch Console / Mattermost:** not installed or connected in this Session. No live Switch server, Mattermost room, `relay-recovery` provider session, or human-to-agent reply has been observed. No chat screenshot or logs are claimed.
- **Provider / agent:** none configured. The verified Switch docs list Claude Code, OpenCode, Codex, Cursor, and Antigravity as providers; the provider must be installed and signed in where the agent runs. No provider installation or sign-in was observed here.
- **Business API:** no API server or endpoint is implemented/running in this checkout. `docs/05-DATA-API.md` is the contract only. E04 confirmed incident detail and the affected-shipment route shape for its in-progress implementation; approval-read and execution endpoints are still missing.
- **Tool gateway:** the typed adapter is implemented and unit-tested against the documented routes. `getApproval` and execution fail closed without an authenticated approval reader. A real API request has not been made.
- **Environment observed:** Reason cloud Linux; Node.js `v22.23.4`, npm `10.9.9`. `docker --version` and `docker compose version` both returned `command not found`; no Switch Console/server was running or connected, and its version is unknown. `RELAYOPS_API_BASE_URL`, `RELAYOPS_REQUEST_ID_HEADER`, `AGENT_READ_API_KEY`, `AGENT_PROPOSE_API_KEY`, and `AGENT_EXECUTE_API_KEY` were unset, and no matching Workspace secrets were present. The checkout has no running RelayOps service.

The Switch and API checks are separate milestones: no room connectivity is claimed, and the API adapter does not imply that an API exists.

## Official setup references

Use the current official instructions for the installed release; do not copy undocumented Switch endpoints or authentication details into configuration:

- [Install Switch Console](https://docs.switchagents.ai/switch-rooms/getting-started/install-switch-console)
- [Add a server](https://docs.switchagents.ai/switch-rooms/getting-started/add-a-server)
- [Set up agent providers](https://docs.switchagents.ai/switch-rooms/getting-started/set-up-agent-providers)
- [Create a room](https://docs.switchagents.ai/switch-rooms/getting-started/create-a-room)
- [Connect Mattermost](https://docs.switchagents.ai/switch-rooms/deploy/messaging-apps/mattermost)
- [Troubleshooting](https://docs.switchagents.ai/switch-rooms/resources/troubleshooting)

The official install page lists Linux x86_64 as early access. For Debian/Ubuntu, its documented package command is `sudo apt install ./switch-console-amd64.deb`; it also documents the AppImage flow as `chmod +x switch-console-x86_64.AppImage` followed by `./switch-console-x86_64.AppImage`. Neither command was run here. Switch Console's local server requires Docker; Console starts its own stack, including Mattermost and Gateway, chooses available ports, creates the admin account, and signs in. No custom Compose file or guessed server route is required.

The official provider guide says to install the provider CLI using that provider's instructions, sign it in, then confirm Switch reports **Signed in** under Settings → Agent providers. Switch starts the agent on its configured host; use the host where the provider is installed and signed in.

When Switch Console creates the Mattermost server, its connection is already set up. Each agent appears in Mattermost as its own bot account and joins the channel as a normal member. The official Mattermost guide says Switch initiates the connection, so the Mattermost server does not need a public inbound endpoint. For a Mattermost server managed separately, follow its documented bot-account, admin, team-slug, and connection setup; do not copy local bundled-server credentials into chat.

## Reproduce the real room milestone

These are the official UI steps to run once Docker, Switch Console, and a signed-in provider are available; they were **not** completed in the current environment:

1. Install Docker for the host OS using [Docker's official install guide](https://docs.docker.com/get-started/get-docker/), then install and open Switch Console.
2. In the Console setup checklist, choose **Add a server → Run a server on this computer**. Wait for its local Switch server and bundled Mattermost to report running.
3. Install and authenticate one supported agent provider on the configured agent host. Register one agent named `relay-recovery`, give it the RelayOps working directory, and load [the agent instructions](agent-system-instructions.md).
4. Use Switch's documented [Create a room](https://docs.switchagents.ai/switch-rooms/getting-started/create-a-room) flow for `relayops-dispatch`. Select Mattermost, add `relay-recovery`, and include a real human dispatcher; link the human's Mattermost account when prompted.
5. In the real channel, send a human message such as `@relay-recovery investigate INC-1042 and report the affected shipments. Do not execute anything.` Capture the actual reply and verify that it names the returned case ID. Do not use a mock chat or a fabricated screenshot.

Record exact Console, Docker, provider, and server versions only after installation. Keep the observed setup date and redacted evidence with the project; none is available yet.

## API access, scopes, and networking

The Switch runtime must reach `RELAYOPS_API_BASE_URL` from the agent's own host. Use an address routable from that runtime; `localhost` inside a separate container/remote agent may refer to the agent itself, not the RelayOps host. Use HTTPS away from loopback. The adapter accepts only an origin URL and sends credentials only in an Authorization header; never put keys in room messages, prompts, client bundles, source control, or logs.

Configure three distinct server-side credentials:

- `AGENT_READ_API_KEY` — `agent-read` for incident, affected-shipment, vehicle, simulation, and status reads.
- `AGENT_PROPOSE_API_KEY` — `agent-propose` for versioned plan proposals.
- `AGENT_EXECUTE_API_KEY` — `agent-execute` for a business-authorized execution only.

Mutations require a request ID and `Idempotency-Key`; E04 has not confirmed the request-ID header name. The adapter requires `RELAYOPS_REQUEST_ID_HEADER` to be explicitly configured before it will send plan or execution writes; the tests use `X-Request-ID` only as an injected fixture, not as a claimed server contract. The API remains the authority and must validate the current plan version/hash, dispatcher role, expiry, single-use approval, capacity, and idempotency transactionally. A room message saying “approved” never authorizes execution. Do not bind an execution tool until `getApproval` is backed by the business application's authenticated authorization lookup.

Current adapter route mapping (the API service is not yet running):

| Tool | Business API mapping / state |
|---|---|
| `getIncident(caseId)` | `GET /api/v1/incidents/:id` |
| `getAffectedShipments(caseId)` | E04-confirmed planned `GET /api/v1/incidents/:id/shipments`; implementation pending |
| `getAvailableVehicles(caseId)` | `GET /api/v1/vehicles/available` |
| `simulateReassignment(input)` | `POST /api/v1/recovery/simulate` (read-only feasibility) |
| `proposeRecovery(input)` | `POST /api/v1/recovery/plans` (`agent-propose`) |
| `getApproval(planId)` | no read route/DTO documented; adapter reports unavailable |
| `executeApprovedReassignment(input)` | business execute route is planned, but no endpoint or approval read is available; adapter fails closed |
| `getRecoveryStatus(caseId)` | `GET /api/v1/incidents/:id` (current status/version) |

No Switch webhook, Mattermost posting API, custom agent protocol endpoint, or room automation is assumed here. For the MVP, a human may post the case ID manually to the real room after the app exists.

## Checks and troubleshooting

Commands actually run in the cloud environment:

```text
node --version                 v22.23.4
npm --version                  10.9.9
docker --version               command not found
docker compose version         command not found
npm ci --ignore-scripts          passed (1 locked package; 0 vulnerabilities)
npm test                         passed (21 tests)
npm run typecheck                passed
```

The adapter tests use an injected fetch stub; they do not prove live API reachability. If Docker is missing, install it from the official guide before trying **Run a server on this computer**. If the Console cannot reach a Mattermost button callback, use the official troubleshooting guide to check the Callback Base URL and Mattermost's internal-host allowlist. If a provider row says **CLI not installed**, install the provider CLI and refresh; if it says **Not signed in**, complete that provider's own sign-in. For a remote agent/API connection, verify the API origin from the agent host itself and avoid assuming host `localhost` crosses container or machine boundaries.

This Session could not test the Console, Mattermost, provider sign-in, room membership, human reply, API network reachability, or any live tool request: Docker/Console/provider/API were unavailable. The adapter unit tests are not a substitute for that live proof.
