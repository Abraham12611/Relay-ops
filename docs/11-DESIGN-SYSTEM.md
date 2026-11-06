# 11 — Visual design system and UI implementation brief

## Aesthetic direction
Original polished logistics SaaS, not a copy of a commercial template. Inspired by dense operational clarity: near-black/navy ink, clean off-white surfaces, muted slate labels, blue information, amber risk, red critical, green confirmed. Use shadcn/ui for accessibility and predictable development.

## Tokens (suggestions; exact values chosen once)
```css
:root {
  --background: 220 20% 98%;
  --foreground: 222 30% 11%;
  --card: 0 0% 100%;
  --muted: 215 16% 95%;
  --muted-foreground: 215 15% 42%;
  --primary: 214 88% 52%;
  --destructive: 0 72% 50%;
  --border: 214 18% 88%;
  --radius: 0.75rem;
}
```
Use icons/text plus color, not color only. Scale 4/8/12/16/24/32. Default readable 14–16px UI text, 20–28px page headers.

## Layouts
Ops: fixed left navigation + compact top context bar + mobile collapsing sidebar. Lists with clear row actions and status pills. Customer: mobile single column with compact shipment stepper, ETA, public updates and action. Driver: mobile-first cards with prominent operation button. Demo: plain control deck with obvious reset and health state.

## Core reusable components
`AppShell`, `RoleSwitcher` (demo-only), `StatusBadge`, `ShipmentProgress`, `IncidentSeverity`, `IncidentCard`, `VehicleCard`, `RecoveryPlanPanel`, `ApprovalCard`, `EventTimeline`, `NotificationCard`, `ActionReceipt`, `EmptyState`, `ErrorState`, `ConnectivityIndicator`, `DemoControls`, `CaseLink`.

## Ops exception detail wireframe
```text
[breadcrumb] Exceptions / INC-1042      [Critical] [Awaiting approval]
[Summary | Impacted 6 | Promised ETA | Predicted ETA]
[Incident facts 60%]             [Recovery plan 40%]
  vehicle / reporter               target VAN-009 / DRV-009
  shipment list                    capacity and conflict checks
  map/list context                 plan version + hash
                                  [Approve] [Reject]
[Audit timeline full width: human / agent / system events + links]
[Open real Mattermost room] [Refresh]
```

## Customer tracking wireframe
```text
[RelayOps] Tracking TRK-2048
Critical shipment | expected ETA / revised ETA
[Ordered]—[In transit]—[Exception]—[Recovery]—[Delivered]
Latest update: backup driver confirmed
Public timeline (redacted) | notifications
```

## Demo control deck
Show known seeded case/IDs, scenario reset and start actions, links to 3 role views, health/readiness checklist, last event. Display a bright **DEMO DATA** indicator. Reset must be protected to demo-only environment.

## Map philosophy
Use static route points and labeled vehicle dots with legend; animated movement only if explicitly marked **simulated**. Never position fabricated routes as live GPS data. For low time, omit map and make structured incident/plan workflow beautiful.

## UX semantics
Explicit modal confirmation for approval/reassignment; display who approved and what exact action; success toast links to changed assignment; errors preserve draft input. Loaders no longer than needed; every interactive button must invoke an actual API or be disabled with truthful explanation.

## Differentiating flourish
A **Recovery Replay** activity panel lets judges trace case, plan, approval, assignment and public update across personas. Implement as a projection of append-only audit events—never fake timestamps in a static transcript.
