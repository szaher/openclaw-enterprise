import type { Task, ConnectorReadResult } from '@openclaw-enterprise/shared/types.js';

/**
 * A node in the D3.js tree layout.
 */
export interface MindMapNode {
  id: string;
  name: string;
  /** Node type determines visual treatment */
  type: 'root' | 'theme' | 'item';
  /** Item count (for theme nodes) or priority score (for item nodes) */
  value: number;
  /** Source systems that contributed to this node */
  sources: string[];
  /** Additional metadata for tooltips */
  metadata: Record<string, unknown>;
  /** Child nodes in the tree */
  children: MindMapNode[];
}

/**
 * Complete mind map data structure for D3.js tree/radial layout.
 */
export interface MindMapData {
  root: MindMapNode;
  metadata: {
    projectName: string;
    totalItems: number;
    themeCount: number;
    sourceCount: number;
    generatedAt: string;
  };
}

/**
 * Cross-system data item to be organized into the mind map.
 */
export interface CrossSystemItem {
  id: string;
  title: string;
  source: string;
  sourceId: string;
  url: string;
  labels: string[];
  classification: string;
  metadata: Record<string, unknown>;
}

/**
 * Default themes used when items cannot be categorized by labels.
 */
const DEFAULT_THEMES = [
  'engineering',
  'design',
  'infrastructure',
  'testing',
  'documentation',
  'operations',
  'security',
  'planning',
] as const;

/**
 * Generates a D3.js tree layout data structure for mind map visualization.
 *
 * Cross-system data is organized by theme (not by source system),
 * so items from Jira, GitHub, GDrive, etc. appear together under
 * shared thematic groupings.
 *
 * Themes are derived from:
 * - Task labels/tags
 * - Project keys
 * - Keyword extraction from titles
 */
export class MindMapGenerator {
  /**
   * Generate mind map data from cross-system items.
   * @param projectName The name of the project to use as root
   * @param items Cross-system items from connectors
   * @returns D3.js tree layout data
   */
  generate(projectName: string, items: CrossSystemItem[]): MindMapData {
    const themeMap = this.organizeByTheme(items);
    const sources = new Set<string>();

    for (const item of items) {
      sources.add(item.source);
    }

    const themeNodes: MindMapNode[] = [];

    for (const [theme, themeItems] of themeMap.entries()) {
      const themeSources = new Set<string>();
      const children: MindMapNode[] = themeItems.map((item) => {
        themeSources.add(item.source);
        return {
          id: `item-${item.id}`,
          name: item.title,
          type: 'item' as const,
          value: 1,
          sources: [item.source],
          metadata: {
            sourceId: item.sourceId,
            url: item.url,
            classification: item.classification,
            ...item.metadata,
          },
          children: [],
        };
      });

      themeNodes.push({
        id: `theme-${theme}`,
        name: this.formatThemeName(theme),
        type: 'theme',
        value: children.length,
        sources: [...themeSources],
        metadata: { itemCount: children.length },
        children,
      });
    }

    // Sort themes by item count descending
    themeNodes.sort((a, b) => b.value - a.value);

    const root: MindMapNode = {
      id: 'root',
      name: projectName,
      type: 'root',
      value: items.length,
      sources: [...sources],
      metadata: {
        themeCount: themeNodes.length,
        sourceCount: sources.size,
      },
      children: themeNodes,
    };

    return {
      root,
      metadata: {
        projectName,
        totalItems: items.length,
        themeCount: themeNodes.length,
        sourceCount: sources.size,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Convert tasks to cross-system items for mind map generation.
   */
  tasksToItems(tasks: Task[]): CrossSystemItem[] {
    return tasks.map((task) => ({
      id: task.id,
      title: task.title,
      source: task.sources[0]?.system ?? 'unknown',
      sourceId: task.sources[0]?.id ?? task.id,
      url: task.sources[0]?.url ?? '',
      labels: this.extractLabels(task),
      classification: task.classification,
      metadata: {
        priorityScore: task.priorityScore,
        status: task.status,
        deadline: task.deadline,
      },
    }));
  }

  /**
   * Convert connector read results to cross-system items.
   */
  connectorResultsToItems(
    source: string,
    result: ConnectorReadResult,
  ): CrossSystemItem[] {
    return result.items.map((item) => ({
      id: item.id,
      title: item.title,
      source,
      sourceId: item.sourceId,
      url: item.url,
      labels: (item.metadata['labels'] as string[]) ?? [],
      classification: item.classification,
      metadata: item.metadata,
    }));
  }

  /**
   * Organize items by theme using labels and keyword extraction.
   * Items are grouped by their most prominent label/theme,
   * not by their source system.
   */
  private organizeByTheme(items: CrossSystemItem[]): Map<string, CrossSystemItem[]> {
    const themeMap = new Map<string, CrossSystemItem[]>();

    for (const item of items) {
      const theme = this.determineTheme(item);

      if (!themeMap.has(theme)) {
        themeMap.set(theme, []);
      }
      themeMap.get(theme)!.push(item);
    }

    return themeMap;
  }

  /**
   * Determine the primary theme for an item.
   * Priority: explicit labels > keyword extraction > default
   */
  private determineTheme(item: CrossSystemItem): string {
    // Check explicit labels against known themes
    for (const label of item.labels) {
      const normalized = label.toLowerCase().trim();
      for (const theme of DEFAULT_THEMES) {
        if (normalized.includes(theme) || theme.includes(normalized)) {
          return theme;
        }
      }
    }

    // Keyword extraction from title
    const titleLower = item.title.toLowerCase();
    for (const theme of DEFAULT_THEMES) {
      if (titleLower.includes(theme)) {
        return theme;
      }
    }

    // Check for common keywords that map to themes
    const keywordMap: Record<string, string> = {
      'bug': 'engineering',
      'fix': 'engineering',
      'feature': 'engineering',
      'refactor': 'engineering',
      'api': 'engineering',
      'ui': 'design',
      'ux': 'design',
      'mockup': 'design',
      'deploy': 'operations',
      'ci': 'infrastructure',
      'cd': 'infrastructure',
      'pipeline': 'infrastructure',
      'k8s': 'infrastructure',
      'kubernetes': 'infrastructure',
      'docker': 'infrastructure',
      'test': 'testing',
      'spec': 'testing',
      'qa': 'testing',
      'doc': 'documentation',
      'readme': 'documentation',
      'wiki': 'documentation',
      'auth': 'security',
      'rbac': 'security',
      'policy': 'security',
      'encrypt': 'security',
      'sprint': 'planning',
      'roadmap': 'planning',
      'milestone': 'planning',
    };

    for (const [keyword, theme] of Object.entries(keywordMap)) {
      if (titleLower.includes(keyword)) {
        return theme;
      }
    }

    // Use first label if available, otherwise default
    if (item.labels.length > 0) {
      return item.labels[0]!.toLowerCase();
    }

    return 'uncategorized';
  }

  /**
   * Extract labels from a task's sources and description.
   */
  private extractLabels(task: Task): string[] {
    const labels: string[] = [];

    // Extract from blocking relationships (indicates engineering work)
    if (task.urgencySignals.blockingRelationships.length > 0) {
      labels.push('engineering');
    }

    // Extract keywords from title
    const titleWords = task.title.toLowerCase().split(/\s+/);
    for (const word of titleWords) {
      if (DEFAULT_THEMES.includes(word as typeof DEFAULT_THEMES[number])) {
        labels.push(word);
      }
    }

    return labels;
  }

  /**
   * Format a theme name for display (capitalize first letter).
   */
  private formatThemeName(theme: string): string {
    return theme.charAt(0).toUpperCase() + theme.slice(1);
  }
}
