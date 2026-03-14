# Visualizations

OpenClaw Enterprise provides interactive visualizations rendered with D3.js through OpenClaw's Canvas (A2UI). These visualizations present your cross-system work data as dependency graphs, priority matrices, and thematic mind maps -- all interactive HTML/CSS/JS delivered directly in your assistant interface.

---

## How Visualizations Work

Visualizations are rendered using D3.js and delivered through OpenClaw's Canvas system (also called A2UI -- Assistant-to-User Interface). Canvas allows the assistant to present rich, interactive HTML content alongside conversational text.

When you request a visualization:

1. The assistant gathers data from connected systems (Jira, GitHub, Gmail, GCal, GDrive, Slack).
2. It structures the data for the requested visualization type.
3. D3.js renders an interactive SVG/HTML view inside Canvas.
4. You interact with the visualization directly -- clicking, hovering, zooming, filtering.

No external tools or browser tabs are needed. Everything renders in-line within your OpenClaw interface.

---

## Task Dependency Graph

The dependency graph shows how your tasks relate to and block each other.

### Requesting a Dependency Graph

- *"Show me my task dependencies"*
- *"Show dependency graph for Project Atlas"*
- *"What tasks are blocking other work?"*

### What It Shows

```
                    +----------------+
                    | PROJ-789       |
                    | Rate Limiting  |
                    | [In Review]    |
                    +-------+--------+
                            |
                   blocks   |
                            v
              +-------------+-------------+
              |                           |
    +---------v--------+       +----------v---------+
    | PROJ-791          |       | INFRA-102          |
    | Rate Limit Config |       | Infra for RL       |
    | [In Progress]     |       | [Done]             |
    +-------------------+       +----------+---------+
                                           |
                                  blocks   |
                                           v
                                +----------+---------+
                                | PROJ-795           |
                                | Perf Testing       |
                                | [Blocked]          |
                                +--------------------+
```

### Interactive Features

| Interaction | Effect |
|---|---|
| **Click a node** | Expands to show full task details: title, status, assignee, priority score, source systems, deadline |
| **Hover over an edge** | Shows the blocking relationship type and duration (how long the downstream task has been waiting) |
| **Drag nodes** | Rearrange the layout manually |
| **Zoom and pan** | Navigate large dependency trees |
| **Filter by status** | Show only blocked tasks, or only in-progress tasks |
| **Filter by project** | Focus on a single Jira project or across all projects |

### Node Visual Encoding

Nodes are visually encoded to convey status at a glance:

| Visual Property | Meaning |
|---|---|
| **Color** | Status: green (done), blue (in progress), yellow (in review), red (blocked) |
| **Border thickness** | Priority score: thicker borders indicate higher priority |
| **Size** | Number of downstream dependencies: larger nodes block more work |
| **Pulsing animation** | Task requires your action |

### Data Sources

The dependency graph pulls blocking relationships from:

- Jira ticket links (blocks/is-blocked-by)
- GitHub PR dependencies (PR requires another PR to merge first)
- Cross-system correlations (a Jira ticket blocked by a PR that is blocked by a review)

---

## Eisenhower Matrix

The Eisenhower matrix plots your tasks on a two-dimensional grid of urgency versus importance, using real signals rather than subjective guesses.

### Requesting an Eisenhower Matrix

- *"Show me an Eisenhower matrix"*
- *"Plot my tasks by urgency and importance"*
- *"Eisenhower matrix for this week"*

### The Four Quadrants

```
             HIGH IMPORTANCE
                  |
    +-------------+-------------+
    |             |             |
    |   DO FIRST  |   SCHEDULE  |
    |             |             |
    | Urgent and  | Important   |
    | important   | but not     |
    |             | urgent      |
    |             |             |
----+-------------+-------------+---- URGENCY
    |             |             |
    |  DELEGATE   |  ELIMINATE  |
    |             |             |
    | Urgent but  | Neither     |
    | not         | urgent nor  |
    | important   | important   |
    |             |             |
    +-------------+-------------+
                  |
             LOW IMPORTANCE
```

### How Urgency and Importance Are Determined

Unlike a manual Eisenhower matrix, OpenClaw Enterprise computes placement from real data:

**Urgency signals:**

| Signal | Effect on Urgency |
|---|---|
| Deadline proximity | Closer deadlines increase urgency |
| SLA timer remaining | Approaching SLA limits increase urgency |
| Follow-up count | Multiple unanswered follow-ups increase urgency |
| Waiting duration | Longer time someone has been waiting increases urgency |

**Importance signals:**

| Signal | Effect on Importance |
|---|---|
| Sender seniority | Requests from leadership increase importance |
| Blocking relationships | Tasks blocking others are more important |
| Project priority | Tasks in high-priority projects are more important |
| Stakeholder count | Tasks with more interested parties are more important |

### Interactive Features

| Interaction | Effect |
|---|---|
| **Click a task dot** | Shows task details, source systems, and why it was placed in this quadrant |
| **Drag a task** | Manually override its quadrant placement (your override is remembered) |
| **Hover** | Shows task title and priority score |
| **Filter by source** | Show only Jira tasks, or only GitHub tasks, etc. |
| **Time range toggle** | Switch between today, this week, and this month views |

### Example Detail View (on click)

```
PROJ-789: Implement rate limiting
==================================
Quadrant: DO FIRST (urgent + important)

Urgency factors:
  - Deadline: today 17:00 (+28 urgency)
  - 2 follow-ups from reviewer (+12 urgency)
  - SLA: 4 hours remaining (+16 urgency)

Importance factors:
  - Blocks 3 downstream tasks (+14 importance)
  - Requested by engineering manager (+10 importance)
  - High-priority project (+8 importance)

Sources: Jira, GitHub PR #412, Slack #team-backend
```

---

## Mind Maps

Mind maps organize your cross-system data by theme rather than by source system. Instead of seeing "here are your Jira tickets, here are your PRs, here are your emails," you see "here is everything related to API Gateway, here is everything related to Security Review."

### Requesting a Mind Map

- *"Show me a mind map of my current work"*
- *"Mind map for Project Atlas"*
- *"Organize my tasks thematically"*

### Thematic Organization

The mind map groups items by detected themes, not by the system they came from:

```
                        +-------------------+
                        |   My Current Work |
                        +---------+---------+
                                  |
                +--------+--------+--------+--------+
                |        |        |        |        |
                v        v        v        v        v
          +---------+ +------+ +--------+ +-----+ +-------+
          |API      | |Auth  | |Docs    | |Q2   | |Team   |
          |Gateway  | |      | |        | |Plan | |Mgmt   |
          +---------+ +------+ +--------+ +-----+ +-------+
               |         |        |          |        |
          +----+----+    |    +---+---+      |    +---+---+
          |    |    |    |    |       |      |    |       |
          v    v    v    v    v       v      v    v       v
        PR  Jira Email Jira  GDrive Jira  Email Sprint  1:1
        412  789  thr  201   doc    88    VP   retro   prep
             791
```

### How Themes Are Detected

The system identifies themes by analyzing:

- **Shared terminology** across tasks, emails, and documents.
- **Project relationships** from Jira and GitHub.
- **Conversation threads** that reference the same topic across channels.
- **Document content** that ties to specific work areas.

A single item can appear under multiple themes if it spans topics (e.g., a security review for the API gateway appears under both "API Gateway" and "Security").

### Interactive Features

| Interaction | Effect |
|---|---|
| **Click a theme node** | Expands to show all items under that theme with details |
| **Click a leaf node** | Shows the specific item: task details, source system, status |
| **Collapse/expand branches** | Focus on specific themes |
| **Search within map** | Highlight nodes matching a keyword |
| **Zoom and pan** | Navigate large mind maps |
| **Drag to reorganize** | Move items between themes if the automatic grouping is wrong |

### Example Expanded Theme

Clicking "API Gateway" expands to:

```
API Gateway
  |
  +-- PR #412: Implement rate limiting [GitHub, In Review]
  +-- PROJ-789: Rate limiting task [Jira, In Review]
  +-- PROJ-791: Rate limit configuration [Jira, In Progress]
  +-- Email thread: "Rate limiting approach" [Gmail, 3 messages]
  +-- Architecture doc v3.3 [GDrive, updated today]
  +-- Slack: 4 messages in #api-gateway [today]
```

---

## Common Visualization Commands

| Command | Visualization |
|---|---|
| *"Show my task dependencies"* | Dependency graph |
| *"What is blocking deployment?"* | Filtered dependency graph showing blockers |
| *"Eisenhower matrix"* | Priority matrix |
| *"What should I focus on?"* | Eisenhower matrix filtered to DO FIRST quadrant |
| *"Mind map of my work"* | Thematic mind map |
| *"Organize Project Atlas visually"* | Project-specific mind map |
| *"Show blocked tasks as a graph"* | Dependency graph filtered to blocked status |

---

## Rendering and Performance

- **All visualizations render client-side** as interactive SVG/HTML via D3.js inside Canvas.
- **No external dependencies** are needed. No browser extensions, no separate applications.
- **Large datasets** (100+ tasks) are handled with progressive rendering and level-of-detail controls. Distant nodes are simplified; nearby nodes show full detail.
- **Export** is available: you can request a static PNG/SVG snapshot of any visualization for sharing in documents or presentations.

### Exporting Visualizations

- *"Export the dependency graph as PNG"*
- *"Save this Eisenhower matrix as SVG"*
- *"Share this mind map"* (generates a shareable Canvas link for colleagues with OpenClaw access)

---

## Best Practices

1. **Start with the dependency graph** to understand blocking relationships. This is the most actionable visualization for unblocking your team.
2. **Use the Eisenhower matrix daily** to check your priorities against real signals. Override placements when your judgment differs -- the system learns from corrections.
3. **Use mind maps for planning** and context-switching. When you move between projects, a mind map shows everything relevant in one view.
4. **Filter aggressively.** Visualizations with too many nodes become noise. Filter by project, status, or time range to focus on what matters now.
5. **Export for standups and planning meetings.** A dependency graph or Eisenhower matrix screenshot is more effective than a bullet list when communicating priorities to your team.
