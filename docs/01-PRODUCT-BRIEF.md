# 01 — Product brief and scope

## One-line proposition
**RelayOps** is a human-supervised, Switch-connected exception-recovery workflow that turns a failed delivery into an accountable, coordinated resolution across customer, driver, dispatcher and AI agent.

## The problem
During last-mile delivery disruptions, information is split among drivers, dispatch, customer care and customers. Staff manually investigate, negotiate alternate assignments, approve changes, update delivery systems and relay status. A tracking chatbot cannot repair the operational failure.

## The hackathon thesis
**Real work in team chat:** Switch connects at least one functioning agent and one human in a real Mattermost channel; the agent retrieves business facts, proposes a recovery, requests human approval, performs an authorized action and reports results back to the same shared room. The web app shows the resulting persistent state.

## User roles
- Customer: shipment status, public timeline, report issue, acknowledge updates.
- Driver: assigned stops, breakdown reporting, backup pickup/acceptance, proof of delivery.
- Dispatcher: exception queue, case detail, plan review, approve/reject, monitor execution.
- Operations manager (optional): critical escalation, audit and overview.
- AI triage/recovery agent: investigate, propose, explain, execute only approved tools, track unresolved work.
- Judge/demo operator: trigger/reset seeded scenario, switch personas, inspect evidence.

## Golden scenario (P0)
**INC-1042 / MED-2048 / VAN-014**: driver reports a breakdown that threatens a critical (fictional) clinic shipment. The incident affects six seeded packages. Agent reads status and proposes backup **VAN-009**, checks capacity/conflicts, posts in a genuine Switch/Mattermost room; a dispatcher explicitly approves via authenticated dashboard or supported authenticated command. A server-enforced approved tool updates the assigned driver/vehicle; a backup driver accepts pickup; customer sees ETA revision; driver confirms delivery; case closes with an audit record. Identical incident/shipment IDs appear in all interfaces.

### Do not overclaim
An ETA is a seeded scenario value, not an actual routing prediction. Capacity/feasibility is computed over seeded business data. Notification delivery may be in-app rather than real email. No real medical records, personal data, addresses or live vehicles. Customer messaging must not reveal private discussion.

## What must work (P0)
1. Seed/reset a deterministic incident scenario and preserve real state changes between views.
2. Customer tracking page and report flow; driver breakdown/accept/deliver; dispatcher exceptions, case detail, approval and timeline.
3. Persistent cases, shipments, vehicles, assignments, approvals, notifications, event log.
4. Switch + Mattermost room with actual AI agent talking to human operator.
5. Agent tools that read cases, propose valid recovery, request approval and execute only with verified approval token/record.
6. A real, reproducible video run from trigger to closure, with evidence of agent posts and backend mutations.
7. Installation, env sample, commands, evidence and fail-safe operator walkthrough.

## Desirable (P1, after P0)
Map with seeded markers, multi-shipment priority ordering, customer notification mock inbox, second incident scenario, recovery comparison, cost estimates, polished activity replay.

## Explicitly out of scope
Production routing/optimization, real GPS, delivery payments, real email/SMS requirements, full warehouse management, live identity providers, complex roles, third-party logistics APIs, production-grade fleet analytics, autonomous financial decisions. No GitHub issue creation in the logistics flow: it is not required to recover a package.

## Business value hypothesis (demo claims only)
The system reduces manual coordination handoffs and makes ownership, consent and recovery state visible. Measure demo event counts and time-to-decision inside the seeded test; **do not present hypothetical speed or savings as proven business outcomes**.

## Judge-visible success criteria
- Switch centrality: physically disconnect Switch/agent and demonstrate that team-agent coordination pauses; case management still functions, but automated collaborative recovery is unavailable.
- Technical: clone/start instructions, passing scripted checks and single deterministic seed.
- Impact: authentic exception with cross-role interaction and human final say.
- Presentation: camera-visible 3-surface flow and clear, timestamped audit trail.

## Submission constraints
Official Nov 4–7 2026; close Nov 7 23:59 IST = **19:29 WAT**. Maximum **four registered team members**. Work done with tools or uncredited assistance must follow competition rules; verify them. Submit early; reserve buffer for upload and verification.

## Authoritative reading
https://www.wemakedevs.org/hackathons/switch
https://www.wemakedevs.org/hackathons/switch/resources
https://www.wemakedevs.org/hackathons/switch/rules
