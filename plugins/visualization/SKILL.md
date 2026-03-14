# Skill: Visualization and Mind Mapping

## When to Use

Use the visualization tools when the user wants to see task relationships, prioritize work visually, or get a high-level overview of a project's cross-system data. These tools generate interactive D3.js visualizations rendered via OpenClaw Canvas (A2UI).

## Available Tools

### generate_dependency_graph
Generates a force-directed graph showing task blocking relationships.

**Parameters:**
- `tasks` (required): Array of Task objects with blocking relationships in urgencySignals

**Returns:** D3.js graph data (nodes with title/status/priority/group, links with blocking direction) plus Canvas asset reference.

**Use when:** The user asks about task dependencies, bottlenecks, critical paths, or which tasks are blocked/blocking.

### generate_priority_matrix
Generates an Eisenhower (urgent/important) quadrant matrix from tasks.

**Parameters:**
- `tasks` (required): Array of Task objects with urgency signals and priority scores

**Returns:** Tasks plotted by urgency (x-axis) and importance (y-axis), organized into four quadrants: do-first, schedule, delegate, eliminate.

**Use when:** The user asks what to work on next, wants to triage tasks, or needs help prioritizing their workload.

### generate_mind_map
Generates a tree/radial mind map from cross-system project data.

**Parameters:**
- `projectName` (required): Name of the project for the root node
- `items` (optional): Array of CrossSystemItem objects from connectors
- `tasks` (optional): Array of Task objects (auto-converted to items)

**Returns:** D3.js tree data organized by theme, not source system. Items from Jira, GitHub, GDrive, etc. are grouped by shared themes like engineering, design, infrastructure, testing.

**Use when:** The user wants a high-level project overview, needs to see how work relates across systems, or asks for a mind map of their project.

## How It Works

- All generators produce data structures compatible with D3.js layouts
- Canvas assets in `assets/` contain the HTML/CSS/JS for interactive rendering
- Visualizations support hover tooltips, click-to-filter, zoom/pan, and responsive sizing
- Urgency/importance scoring uses real signals from the task-intelligence plugin (deadlines, SLAs, follow-ups, seniority, blocking relationships)
- Mind maps organize by theme using label matching and keyword extraction, ensuring cross-system items appear together by topic
- Data classification labels travel with visualization data (policy-aware)

## Limitations

- Visualizations require D3.js v7 loaded via Canvas A2UI
- Mind map theming uses keyword heuristics; items without recognizable labels go to "uncategorized"
- Canvas assets are client-side rendered; large datasets (1000+ nodes) may impact performance
