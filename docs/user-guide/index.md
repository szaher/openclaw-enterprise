# OpenClaw Enterprise User Guide

OpenClaw Enterprise is an enterprise extension layer for the OpenClaw open-source AI assistant. It is built entirely as plugins, extending OpenClaw without forking, and is designed for self-hosted deployment under your full control.

This guide covers the user-facing features available once OpenClaw Enterprise is deployed and configured by your platform team.

---

## Features at a Glance

| Feature | Description |
|---|---|
| [Daily Briefing](daily-briefing.md) | Cross-system task discovery, deduplication, priority scoring, and time-block suggestions delivered as a ranked daily summary. |
| [Auto-Response](auto-response.md) | Graduated autonomous message handling with classification, approval queues, and full audit logging. |
| [Work Tracking](work-tracking.md) | Automatic Jira updates from GitHub PR activity, ticket status transitions, and end-of-day standup generation. |
| [Agent-to-Agent (OCIP)](agent-to-agent.md) | Assistant-to-assistant communication protocol with data classification enforcement, loop prevention, and commitment escalation. |
| [Org Intelligence](org-intelligence.md) | Personalized news digests, document change monitoring, and cross-document consistency checking. |
| [Visualizations](visualizations.md) | Interactive D3.js dependency graphs, Eisenhower matrices, and mind maps rendered through OpenClaw Canvas. |

---

## Connected Systems

OpenClaw Enterprise connects to your existing tools through five MVP connectors plus OpenClaw's built-in Slack channel:

- **Gmail** -- email scanning, auto-response
- **Google Calendar** -- meeting detection, free-slot analysis
- **Jira** -- ticket discovery, status updates, comment posting
- **GitHub** -- PR events, code review requests, issue tracking
- **Google Drive** -- document monitoring, shared file discovery
- **Slack** (via OpenClaw built-in) -- channel monitoring, OCIP messaging

All connector activity is governed by your organization's policy engine. Connectors operate read-only unless write access is explicitly authorized by policy.

---

## How Policies Apply to You

Every action OpenClaw Enterprise takes on your behalf is governed by hierarchical policies set by your administrators. You do not need to configure policies yourself, but you should be aware that:

- **Read vs. write access** is controlled per connector and per action.
- **Auto-response autonomy levels** are set per channel, per contact, and per message classification.
- **Data classification** travels with data everywhere -- if a document is marked "confidential," that classification is enforced across all features.
- **All actions are auditable** -- your administrator can review what the assistant did, why, and under what policy authorization.

---

## Getting Started

1. **Verify connector status.** Ask your assistant: *"Show me connector status."* It will report which systems are reachable and authenticated.
2. **Request a briefing.** Ask: *"Give me my daily briefing."* The assistant will scan all connected systems and deliver a prioritized task list.
3. **Review auto-response settings.** Ask: *"What are my auto-response policies?"* to understand which messages the assistant handles autonomously vs. queues for your approval.
4. **Explore visualizations.** Ask: *"Show me my task dependencies"* or *"Show me an Eisenhower matrix"* to see interactive views of your work.

For detailed information on each feature, follow the links in the table above.
