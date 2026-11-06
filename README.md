# RelayOps — AI-powered logistics exception recovery

**Flip the Switch 2026 · Best Business Workflow**

RelayOps is a hackathon-focused operational workflow demonstrating how dispatchers, drivers, customers and AI agents collaboratively recover a time-critical shipment after a vehicle breakdown. **Switch is the required collaboration layer**, connecting a real AI agent to a real Mattermost team room. The business application maintains shipments, cases, approvals, and event history.

> Status: **runnable application with persisted recovery services**. The Next.js App Router, SQLite persistence, signed demo personas, scoped agent read/proposal/execution APIs, transactional dispatcher approvals and recovery execution, driver assignment lifecycle, customer-safe tracking/notifications, incident audit, and role-specific screens are implemented. A real Switch/Mattermost agent exchange still requires live verification; do not claim it until tested.

## Start here

1. [Project brief](docs/01-PRODUCT-BRIEF.md) — scope, demo goal and success criteria.
2. [Sitemap and UX](docs/02-SITEMAP-UX.md) — routes, permissions and relationships.
3. [End-to-end workflows](docs/03-WORKFLOWS.md) — human and agent flows, state transitions and failure paths.
4. [Architecture](docs/04-ARCHITECTURE.md) — system boundaries and Switch integration.
5. [Data and API contracts](docs/05-DATA-API.md) — canonical types, routes and invariants.
6. [Execution plan](docs/06-EXECUTION-PLAN.md) — phases, dependencies, work packages and parallel assignments.
7. [Live-demo runbook](docs/07-DEMO-RUNBOOK.md) — rehearsable presentation, seed/reset and fallback.
8. [QA and acceptance](docs/08-QUALITY-GATES.md) — scenario tests and release checklist.
9. [Agent specifications](docs/09-AGENTS-SWITCH.md) — prompts, tools, approval protections and proof of real integration.
10. [Collaboration guide](docs/10-CONTRIBUTING.md) — branch ownership, PR conventions and handoff contracts.
11. [Design system](docs/11-DESIGN-SYSTEM.md) — component language and page-level implementation details.
12. [Decisions and risks](docs/12-DECISIONS-RISKS.md) — assumptions, risks, and cut rules.
13. [Engineer handoffs](docs/13-ENGINEER-TASKS.md) — atomic tickets for teams of 5–20.
14. [Project status board](docs/STATUS.md) — progress checklist updated during build.

## Competition constraints

Official event: https://www.wemakedevs.org/hackathons/switch · deadline **Nov 7, 2026 23:59 IST = 19:29 WAT (Lagos)**. The registered hackathon team can contain **at most four participants**; 5–20 parallel workstreams describes implementation capacity, **not** permission to enter with 20 credited teammates. Verify contributor/eligibility rules before involving more people.

Switch resources: https://www.wemakedevs.org/hackathons/switch/resources and https://docs.switchagents.ai/ . Follow current official docs for actual setup and agent protocol; no invented Switch endpoints.

## Golden path

Driver reports breakdown → incident created → AI investigates and speaks **in the Switch-connected Mattermost room** → dispatcher reviews plan → authorized approval → agent uses real business API to reassign → backup driver accepts → customer sees ETA update → proof of delivery → case closed → judge sees the same case ID and auditable history across every interface.

## Non-negotiable demonstration proof

A genuine Switch-mediated agent exchange, verified business API/tool calls, persistent changes visible in the UI, explicit human authorization, and an unbroken case timeline. UI-only simulations do **not** fulfill the Switch requirement.

## Development foundation

Requires Node.js 22.6 or newer. From the repository root:

```bash
cp .env.example .env
# Replace the demo and agent secret placeholders in .env with distinct random secrets.
npm install
npm run db:generate
npm run db:migrate
npm run reset:demo
npm run dev
```

The SQLite URL in `.env` is relative to `prisma/schema.prisma`; `file:../relayops.db` stores the database at the repository root. `npm run reset:demo` is destructive and restores the deterministic **PRE-INCIDENT** state: `VAN-014` is operational, its six shipments are `IN_TRANSIT`, and `INC-1042` does not exist. Seven customer-visible shipment-registration events are seeded at the same fixed timestamp; they do not create an incident. A driver breakdown report creates `INC-1042`, marks the vehicle broken, and moves those shipments to `AT_RISK`.

Useful checks and data commands:

```bash
npm ci
npm test                 # isolated SQLite DB plus domain/API tests; live contracts skip without integration setup
npm run typecheck
npm run build
npm run seed              # migrate and seed/reset the local demo baseline
npm run reset:demo        # destructive local reset to PRE-INCIDENT
npm run smoke:foundation # verify the local persisted baseline
npm run test:integration # optional live API contract suite; requires service URL and role credentials
npm run smoke            # live golden path; requires a configured service and all role credentials; does not prove Switch connectivity
```

Demo sessions are issued by `POST /api/v1/demo/session` with `x-demo-operator-key`; the same-origin browser bridge at `POST /api/demo/session` keeps that key server-side. Driver sessions may select only `DRV-014` or `DRV-009`; the server signs the mapped user identity into an HTTP-only cookie. Agent endpoints use `x-agent-api-key` with separate read, proposal, and execution keys. Never expose these keys to browser code. All responses use `{ data, correlationId }` or the shared `ApiErrorResponse` envelope; valid `X-Request-ID` values are correlated on reads and writes.

Implemented routes include demo session/state/reset, incident create/list/detail/affected shipments/events, shipment detail, available vehicles, recovery simulation/proposals, dispatcher approval decisions and reads, transactional recovery execution, driver jobs and assignment accept/pickup/deliver, and public customer tracking. Driver actions and recovery transitions persist customer-safe updates and auditable events; incidents close only when every linked shipment is terminal. `npm test` exercises these handlers against an isolated SQLite database; live API integration cases remain skipped without a configured service and credentials. The live golden-path tooling in `docs/DEMO-REHEARSAL.md` still requires a configured service and must not be taken as evidence of a real Switch/Mattermost connection.

## Progress

See [STATUS](docs/STATUS.md) for the current gate and package status. All fixture people, shipments, vehicles, times, and outcomes are synthetic.
