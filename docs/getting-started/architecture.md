---
title: Architecture Overview
description: High-level architecture of OpenClaw Enterprise, including component interactions and data flow
---

# Architecture Overview

OpenClaw Enterprise extends the OpenClaw Gateway with enterprise plugins, a policy sidecar, persistent storage, and a Kubernetes operator for lifecycle management. This page describes how these components fit together.

## System Architecture

The following diagram shows the high-level architecture of an OpenClaw Enterprise deployment:

```mermaid
graph TB
    subgraph "Kubernetes Cluster"
        subgraph "OpenClaw Enterprise Operator"
            OP[K8s Operator<br/>Go]
            CRD_I[OpenClawInstance CR]
            CRD_P[PolicyBundle CR]
        end

        subgraph "Tenant Gateway Pod"
            GW[OpenClaw Gateway<br/>Node.js 22+]

            subgraph "Enterprise Plugins"
                PE[Policy Engine]
                AE[Audit Enterprise]
                AUTH[Auth Enterprise]
                TI[Task Intelligence]
                AR[Auto-Response]
                WT[Work Tracking]
                OCIP[OCIP Protocol]
                OI[Org Intelligence]
                VIZ[Visualization]

                subgraph "Connectors"
                    CG[Gmail]
                    CC[GCal]
                    CJ[Jira]
                    CGH[GitHub]
                    CGD[GDrive]
                end
            end

            OPA[OPA Sidecar<br/>Policy Evaluation]
        end

        PG[(PostgreSQL<br/>State + Audit)]
        RD[(Redis<br/>Cache)]
    end

    subgraph "External Systems"
        GMAIL[Gmail API]
        GCAL[Google Calendar API]
        JIRA[Jira API]
        GITHUB[GitHub API]
        GDRIVE[Google Drive API]
        IDP[SSO/OIDC Provider]
    end

    USER[Knowledge Worker] --> GW
    ADMIN[Enterprise Admin] --> GW

    OP --> CRD_I
    OP --> CRD_P
    OP --> GW
    OP --> OPA

    GW --> PE
    PE --> OPA
    GW --> AE
    GW --> AUTH
    AUTH --> IDP

    CG --> GMAIL
    CC --> GCAL
    CJ --> JIRA
    CGH --> GITHUB
    CGD --> GDRIVE

    GW --> PG
    GW --> RD
    AE --> PG
```

## Plugin Dependency Layers

Enterprise plugins are organized in layers, where each layer depends on the layers below it. The shared library provides common types, constants, and utilities used by all plugins.

```mermaid
graph BT
    SHARED[plugins/shared<br/>Types, Constants, Errors,<br/>Connector Base, Health]

    PE[plugins/policy-engine<br/>OPA Client, Hierarchy Resolver,<br/>Evaluator, Hooks, Rego Policies]

    AE[plugins/audit-enterprise<br/>Append-Only Writer,<br/>Query, Export]

    AUTH[plugins/auth-enterprise<br/>OIDC Validator,<br/>RBAC Mapper, Admin API]

    CG[connector-gmail]
    CC[connector-gcal]
    CJ[connector-jira]
    CGH[connector-github]
    CGD[connector-gdrive]

    TI[plugins/task-intelligence<br/>Scanner, Correlator,<br/>Scorer, Briefing]

    AR[plugins/auto-response<br/>Classifier, Responder,<br/>Approval Queue]

    WT[plugins/work-tracking<br/>PR-Jira Correlation,<br/>Ticket Updater, Standup]

    OCIP[plugins/ocip-protocol<br/>OCIP Envelope,<br/>Classification Filter,<br/>Loop Prevention]

    OI[plugins/org-intelligence<br/>News Aggregation,<br/>Doc Monitor, Consistency]

    VIZ[plugins/visualization<br/>D3.js Dependency Graphs,<br/>Eisenhower Matrix, Mind Maps]

    SHARED --> PE
    SHARED --> AE
    SHARED --> AUTH
    PE --> CG
    PE --> CC
    PE --> CJ
    PE --> CGH
    PE --> CGD
    PE --> AR
    PE --> WT
    PE --> TI
    PE --> OCIP
    PE --> OI
    PE --> VIZ
    AE --> TI
    AE --> AR
    AE --> WT
    AE --> OCIP
    CG --> TI
    CC --> TI
    CJ --> TI
    CGH --> TI
    CGD --> TI
    CJ --> WT
    CGH --> WT
    TI --> VIZ
```

**Layer summary:**

| Layer | Plugins | Role |
|---|---|---|
| Foundation | `shared` | Common types, constants, error classes, connector base class, health checks |
| Core Services | `policy-engine`, `audit-enterprise`, `auth-enterprise` | Policy evaluation, immutable logging, SSO/OIDC authentication and RBAC |
| Connectors | `connector-gmail`, `connector-gcal`, `connector-jira`, `connector-github`, `connector-gdrive` | Abstraction over external systems with policy-governed access |
| Intelligence | `task-intelligence`, `auto-response`, `work-tracking`, `org-intelligence` | Cross-system task management, automated responses, work tracking, org news |
| Protocol | `ocip-protocol` | Agent-to-agent communication with classification enforcement |
| Presentation | `visualization` | D3.js interactive visualizations via OpenClaw Canvas |

## Request Data Flow

Every user request follows a consistent path through the system. Policy evaluation and audit logging are mandatory at every step.

```mermaid
sequenceDiagram
    participant U as User
    participant GW as OpenClaw Gateway
    participant PE as Policy Engine Plugin
    participant OPA as OPA Sidecar
    participant C as Connector Plugin
    participant EXT as External System
    participant AL as Audit Log
    participant DB as PostgreSQL

    U->>GW: Natural language request
    GW->>PE: Resolve applicable policies<br/>(enterprise > org > team > user)
    PE->>OPA: Evaluate policy<br/>(action, user context, data classification)
    OPA-->>PE: Decision (allow / deny / notify / approve)

    alt Action Denied
        PE-->>GW: Deny with reason
        GW->>AL: Log denied action
        GW-->>U: Action denied (policy explanation)
    else Action Requires Approval
        PE-->>GW: Approval required
        GW->>AL: Log approval request
        GW-->>U: Queued for approval
    else Action Allowed
        PE-->>GW: Allow (with constraints)
        GW->>C: Execute tool
        C->>EXT: API call (OAuth)
        EXT-->>C: Response
        C->>PE: Classify response data
        C-->>GW: Result (with classification)
        GW->>AL: Log action + data access + classification
        AL->>DB: Append audit entry (immutable)
        GW-->>U: Result
    end
```

## Multi-Gateway Tenancy Model

OpenClaw Enterprise uses a **multi-gateway tenancy model**: each tenant (organization or team, depending on configuration) gets its own OpenClaw Gateway instance. This provides strong isolation between tenants at the process level.

The Kubernetes operator manages the lifecycle of these gateway instances:

```mermaid
graph TB
    subgraph "Kubernetes Cluster"
        OP[OpenClaw Operator]

        subgraph "Tenant A"
            GW_A[Gateway Pod A]
            OPA_A[OPA Sidecar A]
        end

        subgraph "Tenant B"
            GW_B[Gateway Pod B]
            OPA_B[OPA Sidecar B]
        end

        subgraph "Tenant C"
            GW_C[Gateway Pod C]
            OPA_C[OPA Sidecar C]
        end

        PG[(PostgreSQL<br/>Schema-per-tenant)]
        RD[(Redis<br/>Key-prefix isolation)]
    end

    OP -->|manages| GW_A
    OP -->|manages| GW_B
    OP -->|manages| GW_C

    GW_A --> PG
    GW_B --> PG
    GW_C --> PG

    GW_A --> RD
    GW_B --> RD
    GW_C --> RD
```

Each gateway instance:

- Runs its own set of enterprise plugins
- Has its own OPA sidecar loaded with tenant-specific policies
- Connects to PostgreSQL with schema-level isolation
- Uses Redis with key-prefix isolation for caching
- Is defined by an `OpenClawInstance` custom resource

The operator watches `OpenClawInstance` and `PolicyBundle` custom resources and reconciles the cluster state accordingly. It handles:

- Creating and updating gateway deployments
- Injecting OPA sidecars with the correct policy bundles
- Managing database migrations
- Rolling updates and health monitoring
- RBAC configuration for pod-level access control

## Kubernetes Operator and CRDs

The operator defines two custom resource types:

| CRD | Short Name | Purpose |
|---|---|---|
| `OpenClawInstance` | `oci` | Defines a deployed OpenClaw Enterprise instance (auth, storage, integrations, replicas) |
| `PolicyBundle` | `pb` | Defines a collection of Rego policies to load into the OPA sidecar |

The operator supports two deployment modes:

- **Single mode** (`deploymentMode: single`): one gateway replica, suitable for small teams
- **HA mode** (`deploymentMode: ha`): multiple gateway replicas behind a load balancer, suitable for larger deployments

## Storage Architecture

| Store | Technology | Data | Characteristics |
|---|---|---|---|
| Primary database | PostgreSQL 16+ | Tasks, policies, user preferences, connector state | Schema-per-tenant, encrypted at rest (AES-256) |
| Audit database | PostgreSQL 16+ (separate DB or schema) | Immutable audit entries | Append-only, no updates, no deletes, separate retention |
| Cache | Redis 7+ | Session data, policy cache, connector token cache | Key-prefix isolation per tenant, TTL-based expiry |
| Secrets | K8s Secrets or HashiCorp Vault | OAuth tokens, database credentials, OIDC client secrets | Never stored in configuration files |

!!! warning "No SQLite in production"
    OpenClaw Enterprise requires PostgreSQL for production deployments. SQLite is not supported for shared state or audit logging in any production configuration.

## What's Next

- [Key Concepts](concepts.md) -- learn the vocabulary used across the system
- [Quickstart Guide](quickstart.md) -- deploy OpenClaw Enterprise on Kubernetes
