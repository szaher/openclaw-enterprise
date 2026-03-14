---
title: Key Concepts
description: Foundational concepts in OpenClaw Enterprise -- plugins, skills, policies, classification, connectors, OCIP, and more
---

# Key Concepts

This page defines the foundational concepts you will encounter throughout the OpenClaw Enterprise documentation. Understanding these concepts is essential for configuring, operating, and extending the system.

---

## Plugins

Everything in OpenClaw Enterprise is a plugin. There are no enterprise features baked into the OpenClaw core -- every capability is loaded at runtime through OpenClaw's plugin system.

A plugin registers its capabilities using OpenClaw's public APIs:

| API | Purpose |
|---|---|
| `registerTool()` | Registers a tool that the AI agent can invoke (e.g., `gmail_search`, `jira_update_ticket`) |
| `registerHook()` | Registers lifecycle hooks (e.g., `before_model_resolve`, `before_prompt_build`) for intercepting request processing |
| `registerService()` | Registers background services (e.g., scheduled task scanner, policy cache refresher) |
| `registerHttpRoute()` | Registers REST API endpoints (e.g., admin API routes at `/api/v1/...`) |
| `registerGatewayMethod()` | Registers methods callable by other plugins within the same gateway |
| `registerContextEngine()` | Registers a context engine for injecting enterprise context into agent prompts |

Each enterprise plugin declares its dependencies on other enterprise plugins in its manifest. For example, the `task-intelligence` plugin depends on `policy-engine`, `audit-enterprise`, and all five connector plugins.

!!! info "Plugin isolation"
    Plugins communicate through the gateway event system and registered gateway methods -- not through direct function calls. This ensures loose coupling and allows plugins to be enabled or disabled independently.

---

## Skills

Every plugin has a paired **SKILL.md** file that teaches the AI agent how to use the plugin's tools. The skill document describes:

- What tools are available and what they do
- When the agent should use each tool
- What parameters each tool expects
- How to interpret tool results
- Constraints and best practices

The plugin provides the *capability*; the skill provides the *intelligence*. A plugin without a skill gives the agent tools it does not know how to use. A skill without a plugin references tools that do not exist. Both are required.

**Example**: The `connector-jira` plugin registers tools like `jira_search_issues`, `jira_get_issue`, and `jira_update_issue`. Its SKILL.md teaches the agent when to search for issues (during briefing generation, when a user asks about a project), how to correlate Jira ticket keys found in branch names or PR descriptions, and when to update a ticket versus when to ask for approval.

---

## Policy Hierarchy

Policies in OpenClaw Enterprise are organized in a strict four-level hierarchy:

```
Enterprise Policy    (ceiling -- cannot be overridden)
  |
  +-- Organization Policy    (within enterprise bounds)
       |
       +-- Team Policy    (within org bounds)
            |
            +-- User Preferences    (within team bounds)
```

The fundamental rule: **lower levels can restrict further but can never expand beyond the parent level.**

If the enterprise policy says "no external model calls for confidential data," no organization, team, or user can override that. An org admin can add further restrictions (e.g., "no external model calls for internal data either") but cannot loosen the enterprise ceiling.

### Policy Domains

Policies govern seven distinct domains:

| Domain | What It Controls |
|---|---|
| **Models** | Which AI models can be used, data classification routing per model, cost limits |
| **Actions** | Which tool invocations are autonomous / notify / approve / blocked |
| **Integrations** | Which connectors are enabled, what permissions each has (read / write / admin) |
| **Agent-to-Agent** | Whether agents can communicate, exchange types allowed, round limits, classification gates |
| **Features** | Which enterprise features are enabled per scope |
| **Data** | Classification levels, retention periods, what can be shared externally |
| **Audit** | What is logged, retention period, who can query, alert rules |

Policies are declarative documents written in Rego (OPA's policy language). They are human-readable, version-controllable, and diffable. Policy logic never lives in TypeScript application code.

!!! note "Policy changes are audited"
    Every policy change is logged with who changed it, what changed, when, and why. Policy changes take effect via hot-reload within 60 seconds but are never retroactive.

---

## Graduated Autonomy

Every action the assistant can take has one of four autonomy levels, defined by policy:

| Level | Behavior |
|---|---|
| **Autonomous** | The assistant performs the action without human involvement. The action is logged and visible in the activity log. |
| **Notify** | The assistant performs the action and notifies the user that it did so. The user can review and undo if needed. |
| **Approve** | The assistant drafts the action and queues it for the user's explicit approval before executing it. |
| **Block** | The assistant is not permitted to perform this action under any circumstances. |

The default for all actions is **block** (deny-by-default). Autonomy is earned through policy configuration, not assumed. An enterprise admin might set "auto-respond to internal Slack messages" to `notify`, while setting "send external emails" to `approve` and "delete files" to `block`.

Graduated autonomy applies to all assistant actions, including:

- Sending messages and emails
- Updating tickets and issues
- Transitioning ticket status
- Scheduling meetings
- Sharing data with other agents
- Responding to agent-to-agent queries

---

## Data Classification

Every piece of data the assistant accesses is labeled with a classification level:

| Level | Description | Example |
|---|---|---|
| **Public** | Information intended for public consumption | Public GitHub repositories, published blog posts |
| **Internal** | Information for internal use within the organization | Internal Slack messages, internal wiki pages |
| **Confidential** | Sensitive business information with restricted access | Financial data, customer PII, unreleased product plans |
| **Restricted** | Highly sensitive information requiring maximum protection | Security credentials, legal documents, compliance data |

### Three-Layer Classification Assignment

Data classification is assigned through three layers:

1. **Per-connector defaults**: Each connector has a default classification level. Gmail defaults to `internal`. Public GitHub repositories default to `public`. Private repositories default to `internal`.
2. **AI reclassification**: The assistant analyzes content to detect sensitive material that exceeds the connector default. An email containing customer PII would be reclassified from `internal` to `confidential`.
3. **Admin override**: Administrators can manually set classification levels for specific data sources or patterns.

### Classification Propagation

Classification travels with data through every operation:

- A summary of a `confidential` document produces a `confidential` summary
- An agent-to-agent exchange inherits the highest classification of the data included
- Model routing respects classification -- data classified above `internal` is not sent to external model providers unless explicitly allowed by enterprise policy
- Vector embeddings for RAG inherit the classification of their source data

!!! warning "Unknown classification defaults to highest"
    If the classification of a piece of data cannot be determined, the system defaults to `restricted` (the highest level). Fail-closed, not fail-open.

---

## Connectors

Connectors are plugins that provide abstraction over external systems. Each connector:

- Registers tools for interacting with the external system (search, read, write)
- Manages OAuth tokens securely (stored in K8s Secrets or Vault, never in config files)
- Enforces policy-governed access (read-only by default; write requires policy authorization)
- Emits audit events for every access
- Applies data classification to all retrieved data

### MVP Connectors

| Connector | External System | Default Classification |
|---|---|---|
| `connector-gmail` | Gmail API | `internal` |
| `connector-gcal` | Google Calendar API | `internal` |
| `connector-jira` | Jira API | `internal` |
| `connector-github` | GitHub API | `public` (public repos), `internal` (private repos) |
| `connector-gdrive` | Google Drive API | `internal` |

All connectors extend a shared `ConnectorBase` class from `plugins/shared` that provides common patterns for authentication, rate limiting, error handling, and health checks.

!!! info "Post-MVP connectors"
    Additional connectors for Outlook, Linear, Notion, Confluence, and GitLab are planned for post-MVP releases.

---

## OCIP (Open Claw Interchange Protocol)

OCIP is the protocol that enables secure agent-to-agent communication. When one user's assistant needs information from another user's assistant, they exchange messages using OCIP.

Every OCIP message carries machine-readable metadata:

| Field | Purpose |
|---|---|
| Message type | Query, response, escalation |
| Source agent identity | Who is sending (user, org, capabilities) |
| Data classification | Maximum classification level of the data in this message |
| Exchange round | Current round number in this exchange |
| Max rounds | Maximum rounds allowed by policy before human escalation |

### OCIP Rules

These rules are structural and non-configurable:

- **Agents always identify themselves**: An agent never pretends to be human. OCIP metadata is always present.
- **Classification is enforced at the sender**: Data above the receiver's clearance is filtered before transmission, not after receipt.
- **Loops have hard limits**: Every exchange has a maximum round count defined by policy. When the limit is reached, the exchange escalates to humans.
- **Commitments require humans**: An agent can share information autonomously but can never commit its user to meetings, deadlines, or agreements without human approval.
- **All exchanges are auditable**: Both sides of every exchange are logged. Either user can review the full transcript.

!!! note "Intra-enterprise only"
    OCIP exchanges are allowed across organization boundaries within the same enterprise, governed by org-level policies. Cross-enterprise agent-to-agent exchanges are blocked.

---

## Audit Trail

The audit trail is an immutable, append-only log of every action the assistant takes. Audit entries are never updated and never deleted. They are stored in a separate PostgreSQL database or schema from operational data.

Every audit entry includes:

- **Timestamp**: When the action occurred
- **User**: Which user's assistant performed the action
- **Action type**: What was done (tool invocation, model call, data access, policy decision, agent exchange)
- **Data accessed**: What data was read or written, with classification level
- **Model used**: Which AI model processed the data, with token count
- **Policy applied**: Which policy was evaluated, what the decision was, and why
- **Outcome**: Success, denied, approval-queued, or error

The audit log is designed to answer any "what happened?" question about any assistant action, for any user, within the retention period, in under 10 seconds of query time.

Users can review all actions taken on their behalf. Admins can review actions within their scope (enterprise admins see everything; org admins see their org; team leads see their team). Users can export and delete all their data.

---

## Fail-Closed Behavior

OpenClaw Enterprise follows a strict fail-closed model. When a component is unavailable or returns an error, the system denies the action rather than proceeding without safeguards.

| Scenario | Behavior |
|---|---|
| Policy engine unreachable | All actions denied. User notified of policy evaluation failure. |
| Policy evaluation returns an error | Action denied. Error logged. |
| Data classification unknown | Defaults to `restricted` (highest level). |
| Policy is ambiguous | Action denied. |
| Connector API unavailable during briefing | Partial briefing generated with clear notice of which data sources were unreachable. |
| OPA sidecar restarts during request | In-flight action denied. Retried after OPA is available. |

This principle ensures that a degraded system is a safe system. The assistant may be less useful when components are unavailable, but it will never take unauthorized action.

---

## What's Next

- [Quickstart Guide](quickstart.md) -- deploy OpenClaw Enterprise on Kubernetes
- [Architecture Overview](architecture.md) -- see how these concepts map to system components
