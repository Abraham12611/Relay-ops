# 07 — Live demo runbook and video production

## Demo promise
Show one uninterrupted incident from actual human input to genuine Switch-mediated agent collaboration and persisted customer outcome. **All shipments, drivers and metrics are fictitious.** Presentation should not imply production dispatch.

## Preflight (15 minutes before recording)
- [ ] `main` HEAD checked out, install successful, DB seeded/reset using documented command.
- [ ] App opens /demo, customer tracking, /driver and /ops in separate browser profiles/tabs.
- [ ] Mattermost and Switch Console running; connected agent responds in a real room.
- [ ] Agent service can reach `APP_BASE_URL` and secret is not exposed in browser.
- [ ] Endpoints health checks green; reset is PRE-INCIDENT: INC-1042 is absent, VAN-014 is AVAILABLE, and the six assigned shipments are IN_TRANSIT.
- [ ] Screen recording audio and text zoom tested, no account tokens visible.
- [ ] Local time and seed fixtures deterministic; stable link to the real room.
- [ ] Backup: screenshots from successful authentic rehearsal + separate narrated video segment if live connection falls over; **never stage fake chat as a real integration**.

## 3–5 minute video script
| Time | Screen | Voiceover / action | Evidence |
|---|---|---|---|
| 0:00–0:20 | overview | “Logistics breaks when coordination breaks; this is a shipment recovery workflow with a human and AI agent inside Switch.” | architecture thumbnail |
| 0:20–0:50 | customer track | show promised ETA, current in-transit status, fictional critical shipment | TRK-2048 |
| 0:50–1:15 | driver | driver reports vehicle breakdown, server creates INC-1042 | persisted incident |
| 1:15–1:50 | Switch/Mattermost | human tells real connected agent to investigate INC-1042; agent queries case, lists affected packages, proposes VAN-009 | real room message + tool evidence |
| 1:50–2:15 | ops case | dispatcher compares plan/evidence, approves specifically versioned proposal | event APPROVAL_GRANTED |
| 2:15–2:40 | Switch + ops | human asks agent to execute approved plan; tool returns assignment ID; ops view changes | EXECUTION receipt + DB event |
| 2:40–3:10 | driver backup | backup driver accepts and marks picked up / delivered with fictional proof | assignment transition |
| 3:10–3:35 | customer | customer refreshes and sees revised ETA, progress, delivery confirmation | customer-safe timeline |
| 3:35–4:10 | ops audit | replay the same case ID and actor trace, show approval + business mutation | complete event log |
| 4:10–4:30 | architecture/CTA | Switch centrality, repo reproducibility, named limitation | submission repo/docs |

If demo is over 5 minutes, trim navigation, **not** the actual human-agent exchange or approval evidence.

## Live judge operator sequence
1. Open /demo. Click RESET SCENARIO. Confirm health green, PRE-INCIDENT state, and no INC-1042. Open /track/TRK-2048.
2. In driver portal as DRV-014 report BREAKDOWN (summary: engine failure). Confirm the response creates INC-1042 before opening its case page.
3. Open real Mattermost operations room: `@relay-recovery investigate INC-1042, tell me affected shipments and recommend a feasible backup; do not execute`. Capture agent calling `getIncident` and `simulateReassignment`.
4. Review plan in /ops/exceptions/INC-1042. Challenge an assumption in room; agent answers using actual data. Approve exact plan via dashboard, NOT only chat text.
5. In room: `@relay-recovery execute the approved recovery plan for INC-1042 and report assignment ID`. Verify actual tool receipt.
6. Open backup driver job; accept, pickup, deliver. Refresh customer tracking and operations timeline.
7. Open /ops/exceptions/INC-1042 events; show same case ID, actors, approval and closure. Re-run only after resetting.

## Backup modes (transparent)
- Map missing: use list and case detail.
- Notification provider missing: show DB-backed in-app notification, labeled demo.
- Event-to-room adapter missing: manually post case ID in real room; agent must still call real tools.
- One-agent-only: keep one actual functioning agent, don't claim multiple.
- Agent offline: show a successful separately recorded authentic proof only if actually captured; describe outage honestly. Do NOT fake terminal logs or Mattermost.
- App is local-only: record all surfaces on same machine; submission README must say local setup needed.

## Recording checklist
Use 1080p screen, 125% text zoom, no sensitive windows, timestamp of the run, readable chat and receipts. Highlight case IDs rather than cursor chaos; produce one edited MP4 and optional 30-second teaser. Ensure narration distinguishes demo fixtures from real-world integrations.

## Submission package
README + architecture diagram + setup guide + demo video link + screenshots + how to reproduce + Switch configuration steps + AI agent/tool instructions + limitations + clear track selection. Test the submitted link in a private/incognito browser. Deadline: Nov 7 23:59 IST / 19:29 WAT.
