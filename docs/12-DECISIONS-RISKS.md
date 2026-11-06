# 12 — Decisions, assumptions and risks

## Decision register (initial)
| ID | Decision | Why | Revisit if |
|---|---|---|---|
| D01 | Logistics exception management | cross-functional pain + natural agent/human coordination | Switch integration impossible |
| D02 | One complete vehicle breakdown scenario P0 | proof > breadth | hero passes early |
| D03 | Mattermost via Switch | local support, no Slack admin requirement | preconfigured Slack already working |
| D04 | One real recovery agent P0 | reduces handoff failure | one-agent gold path stable |
| D05 | SQLite local demo | deterministic fast setup | multi-instance hosted application essential |
| D06 | In-app notifications P0 | no email provider dependency | time remains |
| D07 | Authenticated dashboard approval | verifiable, safer than arbitrary chat text | validated room identity mapping |
| D08 | Public demo uses synthetic logistics data | privacy + reproducibility | never use real customer data |
| D09 | Manual posting of incident ID is acceptable fallback | keeps real human-agent teamwork without undocumented Switch bridge | documented event adapter ready |
| D10 | Original UI, no copying commercial template source | licensing clarity | properly licensed source available |

## Risk register
| Risk | Severity | Signal | Mitigation |
|---|---|---|---|
| Switch Console install blocked on operating system | critical | no room after h2 | supported machine/OS, official quickstart, Mattermost bundled |
| Agent cannot reach API from runtime | critical | tool timeout | network probe, host-accessible URL, scoped tool gateway |
| Endpoint protocol guessed | critical | auth/404 issues | verify docs installed version, log actual response |
| No valid approval protection | critical | agent can execute pre-approval | transaction tests and server enforcement |
| Too many feature squads cause merge conflicts | high | repeated contract churn | ownership, frozen DTO, vertical integration lead |
| Video left until deadline | high | no recording h20 | reserve 2h minimum + rehearse by h19 |
| Concurrent seed reset during demo | high | disappearing case | lock reset and protect demo mode |
| Model makes unsupported ETA claim | medium | impossible route | deterministic feasibility, label assumptions |
| Missing driver closure | high | case never resolves | build acceptance/delivery before map polish |
| Chat screenshots expose secrets | medium | API key visible | redaction and separate debug logs |
| Website template license | medium | copied protected source | use original components/reference only |
| External deployed link unreliable | medium | 503 at judge time | local recorded reproducible evidence and setup guide |
| Rules misinterpreted re 5–20 engineers | critical | invalid entry | official maximum 4 registered; check all contributor rules |

## Cut list (ordered)
Cut P1 map animation → second agent → email/SMS → extra incident scenarios → marketing page → fancy analytics. Do **not** cut Switch, real agent, approval, persistent tool action, customer closure or demo recording.

## Open questions to resolve in engineering (not blockers for planning)
- Which OS/machine hosts Switch Console?
- Which real agent/provider is available with working credentials?
- Which exact official version/protocol and networking setup?
- SQLite/Prisma vs Drizzle: tech lead chooses ONE immediately.
- Local-only vs publicly hosted app: deliver local first, then optional public deployment.
- Who are up to four eligible registered participants?

## Truth-in-demo statement
“All vehicles, clients, location and time data in this demonstration are seeded and fictional. The Switch chat session, agent queries, approval and state-changing business tool calls are real inside the running demonstration system.”
