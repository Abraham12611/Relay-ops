# 02 — Sitemap, page relationships and UX contracts

## Route tree (Next.js App Router; route groups are optional)

```text
/                                  Landing + role launch + scenario explainer
/demo                              Judge control: reset, trigger, role links, health and activity
/track/[trackingCode]              Customer tracking, ETA, incident/public status
  -> /track/[trackingCode]/report  Customer exception report form (P1 if time)
/driver                            Driver assignment list
  -> /driver/incidents/new         Breakdown/report form (P0)
  -> /driver/jobs/[shipmentId]     Delivery/backup pickup details + accept/complete actions
/ops                               Dispatcher overview KPIs + exception queue snapshot
  -> /ops/exceptions               Search/filter incidents and severity
    -> /ops/exceptions/[caseId]    Case command center: evidence, plan, approvals, timeline
  -> /ops/dispatch                 Vehicles and pending reassignments (can be tab in case P0)
  -> /ops/shipments/[shipmentId]   Internal shipment details/history
  -> /ops/activity                 Global audit feed, linked back to case
  -> /ops/settings                 Integration status (P1; avoid real credentials in UI)
```

**No separate in-app fake Slack/Mattermost.** Open the real Switch-connected Mattermost chat in a second browser window. A link from case detail to the relevant chat channel is allowed; don't invent a deep link until verified.

## Navigation graph
- /demo is demo operator's entry and links to all four viewpoints plus health. Not a business-role menu.
- Customer tracking links to incident public timeline and optional report; never sees internal notes.
- Driver list → job → incident form (original driver) OR assignment acceptance → delivery confirmation (backup).
- /ops overview → /ops/exceptions → detail → plan panel → approval → /ops/dispatch and /ops/activity.
- Each row in shipment list links to /ops/shipments/[shipmentId], which links back to parent case.
- Every notification links only to authorized role-specific detail, not raw agent transcript.

## Page inventory / acceptance
| Page | Data | Primary interaction | Must be real? | Priority |
|---|---|---|---|---|
| / | static | Enter demo | no | P1 |
| /demo | scenario state/health | seed reset, trigger, role launcher | yes | P0 |
| /track/[code] | customer-safe shipment, events | acknowledge status | yes | P0 |
| /track/[code]/report | customer report | submit | yes if included | P1 |
| /driver | assigned jobs | open job | yes | P0 |
| /driver/incidents/new | vehicle context | report breakdown | yes | P0 |
| /driver/jobs/[id] | job/status | accept pickup, deliver | yes | P0 |
| /ops | queue KPIs | open exception | yes | P0 |
| /ops/exceptions | incident rows | filter/inspect | yes | P0 |
| /ops/exceptions/[id] | plan/approval/events | approve/reject + open chat | yes | P0 |
| /ops/dispatch | fleet/assignment | view updated assignment | P0 tab substitute | P1 |
| /ops/shipments/[id] | shipment history | inspect | yes | P0 |
| /ops/activity | audit events | click case | yes | P1 |
| /ops/settings | integration health | diagnostics | yes if shipped | P1 |

## Case page regions
Header: case ID, severity, status, promised ETA, latest ETA, affected count. Left: summary, operational facts, possible backup vehicle. Right: latest agent recommendation, feasibility evidence, explicit approve/reject card, link to real chat. Lower section: immutable chronological event timeline with actor/source and exact IDs.

## Customer page regions
Tracking code, stage stepper, ETA with 'revised' badge, current assigned driver (if safe), latest public message, public history, support report. **No internal agent chain-of-thought, discussion or staff contact information.**

## Driver page regions
Assignment list with source/target; breakdown action with reason/vehicle and affected shipment preview; backup driver acceptance; proof-of-delivery action. Require explicit click, not automatic simulation in production surface.

## Design states on EVERY interactive page
Loading, empty, success, validation error, stale data, permission denied, duplicate/no-op, and network failure. Buttons disabled during mutation, notifications correlate to case ID. Refresh and navigation must preserve data.

## Permission matrix
| Capability | Customer | Driver | Dispatcher | Demo operator |
|---|---|---|---|---|
| See public shipment | only tracking token | assigned | all | seeded |
| Create breakdown | no | active vehicle only | optionally | demo trigger |
| Read case private facts | no | limited assignment | yes | seeded |
| Request/approve recovery | no | no | yes | demo as dispatcher only |
| Accept pickup / deliver | no | assigned driver | no | demo as driver only |
| Reset seed | no | no | no | local demo mode only |

## Accessibility and polish
Keyboard navigation, contrast, readable labels, status conveyed in words + icons, desktop admin and mobile-first driver/customer. Avoid stock map imagery as proof of tracking. A simple coordinate dot map with legend beats an untruthful real-time map.
