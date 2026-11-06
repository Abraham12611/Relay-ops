# RelayOps — AI-powered logistics exception recovery

**Flip the Switch 2026 · Best Business Workflow**

RelayOps is a hackathon-focused operational workflow demonstrating how dispatchers, drivers, customers and AI agents collaboratively recover a time-critical shipment after a vehicle breakdown. **Switch is the required collaboration layer**, connecting a real AI agent to a real Mattermost team room. The business application maintains shipments, cases, approvals, and event history.

> Status: **foundation implementation started; this is not yet a runnable product**. Shared domain/API types, an immutable synthetic scenario, and read-only recovery feasibility checks are implemented. Persistence, HTTP routes, UI, and Switch connectivity remain unimplemented. Do not claim real Switch integration until tested.

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
npm install
npm test
npm run typecheck
```

`npm test` exercises the deterministic in-memory fixture and pure recovery checks; its live API contract tests are skipped unless explicitly run through `npm run test:integration`. The new `npm run reset:demo` and `npm run smoke` scripts require a running API and role-scoped demo credentials; they do not start a web server or prove a Switch/Mattermost connection. See [the demo rehearsal gate](docs/DEMO-REHEARSAL.md) for exact setup, commands, cases, and evidence requirements. API routes, database migrations/seeding, UI, and `dev`, `lint`, and `seed` commands remain unimplemented.

## Progress

See [STATUS](docs/STATUS.md) for the current gate and package status. All fixture people, shipments, vehicles, times, and outcomes are synthetic.
