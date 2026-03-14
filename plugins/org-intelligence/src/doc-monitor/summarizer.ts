import type { ChangeClassification } from '@openclaw-enterprise/shared/types.js';
import type { ChangeDetectionResult } from './detector.js';

/**
 * A section-level change summary.
 */
export interface SectionChange {
  section: string;
  changeType: 'added' | 'modified' | 'removed';
  description: string;
}

/**
 * User impact assessment for a document change.
 */
export interface UserImpact {
  userId: string;
  impactLevel: 'high' | 'medium' | 'low' | 'none';
  reason: string;
}

/**
 * Complete change summary for a document.
 */
export interface ChangeSummary {
  docId: string;
  title: string;
  changeClassification: ChangeClassification;
  overallSummary: string;
  sectionChanges: SectionChange[];
  userImpacts: UserImpact[];
  actionRequired: boolean;
}

/**
 * User context for impact assessment.
 */
export interface ImpactUserContext {
  userId: string;
  role: string;
  team: string;
  activeProjects: string[];
  referencedDocs: string[];
}

/**
 * Change Summarizer.
 * Summarizes what changed (added/modified/removed) in a document
 * and assesses impact per user.
 */
export class ChangeSummarizer {
  /**
   * Summarize a document change and assess user impacts.
   */
  summarize(
    detection: ChangeDetectionResult,
    oldContent: string | null,
    newContent: string,
    affectedUsers: ImpactUserContext[],
  ): ChangeSummary {
    const sectionChanges = this.extractSectionChanges(oldContent, newContent);
    const overallSummary = this.composeOverallSummary(detection, sectionChanges);
    const userImpacts = affectedUsers.map((user) =>
      this.assessUserImpact(user, detection, sectionChanges),
    );
    const actionRequired =
      detection.changeClassification === 'critical' ||
      detection.changeClassification === 'substantive';

    return {
      docId: detection.docId,
      title: detection.title,
      changeClassification: detection.changeClassification,
      overallSummary,
      sectionChanges,
      userImpacts,
      actionRequired,
    };
  }

  private extractSectionChanges(
    oldContent: string | null,
    newContent: string,
  ): SectionChange[] {
    const changes: SectionChange[] = [];

    if (!oldContent) {
      // No previous version — treat all sections as added
      const sections = this.parseSections(newContent);
      for (const section of sections) {
        changes.push({
          section: section.heading,
          changeType: 'added',
          description: `New section: ${section.heading}`,
        });
      }
      return changes;
    }

    const oldSections = this.parseSections(oldContent);
    const newSections = this.parseSections(newContent);

    const oldMap = new Map(oldSections.map((s) => [s.heading, s.content]));
    const newMap = new Map(newSections.map((s) => [s.heading, s.content]));

    // Find added and modified sections
    for (const [heading, content] of newMap) {
      const oldSectionContent = oldMap.get(heading);
      if (oldSectionContent === undefined) {
        changes.push({
          section: heading,
          changeType: 'added',
          description: `New section added: ${heading}`,
        });
      } else if (oldSectionContent !== content) {
        changes.push({
          section: heading,
          changeType: 'modified',
          description: `Section modified: ${heading}`,
        });
      }
    }

    // Find removed sections
    for (const [heading] of oldMap) {
      if (!newMap.has(heading)) {
        changes.push({
          section: heading,
          changeType: 'removed',
          description: `Section removed: ${heading}`,
        });
      }
    }

    return changes;
  }

  private parseSections(content: string): Array<{ heading: string; content: string }> {
    const lines = content.split('\n');
    const sections: Array<{ heading: string; content: string }> = [];
    let currentHeading = 'Introduction';
    let currentContent: string[] = [];

    for (const line of lines) {
      // Match markdown-style headings or capitalized section labels
      const headingMatch = line.match(/^#{1,3}\s+(.+)$/) ?? line.match(/^([A-Z][A-Za-z\s]+):$/);
      if (headingMatch) {
        if (currentContent.length > 0) {
          sections.push({ heading: currentHeading, content: currentContent.join('\n') });
        }
        currentHeading = headingMatch[1]!.trim();
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }

    if (currentContent.length > 0) {
      sections.push({ heading: currentHeading, content: currentContent.join('\n') });
    }

    return sections;
  }

  private composeOverallSummary(
    detection: ChangeDetectionResult,
    sectionChanges: SectionChange[],
  ): string {
    if (!detection.diffAvailable) {
      return `Document "${detection.title}" was detected for the first time (version ${detection.currentVersion}). No previous version available for comparison.`;
    }

    const added = sectionChanges.filter((c) => c.changeType === 'added').length;
    const modified = sectionChanges.filter((c) => c.changeType === 'modified').length;
    const removed = sectionChanges.filter((c) => c.changeType === 'removed').length;

    const parts: string[] = [];
    if (added > 0) parts.push(`${added} section(s) added`);
    if (modified > 0) parts.push(`${modified} section(s) modified`);
    if (removed > 0) parts.push(`${removed} section(s) removed`);

    const changeSummary = parts.length > 0 ? parts.join(', ') : 'minor formatting changes';

    return `Document "${detection.title}" updated from v${detection.previousVersion} to v${detection.currentVersion} by ${detection.lastModifiedBy}: ${changeSummary}. Change classified as ${detection.changeClassification}.`;
  }

  private assessUserImpact(
    user: ImpactUserContext,
    detection: ChangeDetectionResult,
    sectionChanges: SectionChange[],
  ): UserImpact {
    // Critical changes always have high impact
    if (detection.changeClassification === 'critical') {
      return {
        userId: user.userId,
        impactLevel: 'high',
        reason: `Critical change in "${detection.title}" affects all stakeholders.`,
      };
    }

    // Check if user references this document
    if (user.referencedDocs.includes(detection.docId)) {
      return {
        userId: user.userId,
        impactLevel: detection.changeClassification === 'substantive' ? 'high' : 'medium',
        reason: `User references "${detection.title}" in active work.`,
      };
    }

    // Check if section changes relate to user's team/projects
    const relevantChanges = sectionChanges.filter((sc) => {
      const sectionLower = sc.section.toLowerCase();
      return (
        sectionLower.includes(user.team.toLowerCase()) ||
        user.activeProjects.some((p) => sectionLower.includes(p.toLowerCase()))
      );
    });

    if (relevantChanges.length > 0) {
      return {
        userId: user.userId,
        impactLevel: 'medium',
        reason: `Changes in section(s) "${relevantChanges.map((c) => c.section).join(', ')}" are relevant to user's team or projects.`,
      };
    }

    // Cosmetic changes have no impact
    if (detection.changeClassification === 'cosmetic') {
      return {
        userId: user.userId,
        impactLevel: 'none',
        reason: 'Cosmetic change only.',
      };
    }

    return {
      userId: user.userId,
      impactLevel: 'low',
      reason: `General update to "${detection.title}".`,
    };
  }
}
