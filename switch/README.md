# Switch integration implementation notes

## Purpose
Real team-chat agent collaboration is non-optional for this hackathon. Use official links:
- https://www.wemakedevs.org/hackathons/switch/resources
- https://docs.switchagents.ai/

## Setup checklist (complete with actual commands once installed)
- [ ] Switch Console version: ______
- [ ] Host OS: ______
- [ ] Docker version: ______
- [ ] Mattermost room/channel `relayops-dispatch` created.
- [ ] Supported agent provider and version: ______
- [ ] Real human→agent reply works.
- [ ] Agent tool HTTP reachability to business app verified.
- [ ] Agent reads seeded case `INC-1042`.
- [ ] Agent creates proposed plan via scoped tools.
- [ ] Dispatcher approves through business app.
- [ ] Agent executes approved reassignment via tool and reports actual assignment ID.
- [ ] Redacted screenshot/log added to docs/evidence/.

## Important integration truth
We do **not** claim any Switch endpoints, tokens, room-post API, or webhook until verified from the installed version. The event-to-room push is optional: human can paste case ID into the real room to kick off collaboration. No staged fake chat screenshots.

## Hand-off docs
See ../docs/09-AGENTS-SWITCH.md (agent behavior), ../docs/05-DATA-API.md (tool contracts) and ../docs/07-DEMO-RUNBOOK.md (live proof).
