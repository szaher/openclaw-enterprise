import type { NewsRelevance } from '@openclaw-enterprise/shared/types.js';
import type { RawNewsItem } from './aggregator.js';

/**
 * User profile used for relevance scoring.
 */
export interface UserProfile {
  userId: string;
  role: string;
  team: string;
  orgUnit: string;
  activeProjects: string[];
  interests: string[];
}

/**
 * A news item with relevance score and classification.
 */
export interface ScoredNewsItem {
  item: RawNewsItem;
  score: number;
  relevance: NewsRelevance;
  matchReasons: string[];
}

/**
 * Relevance Scorer.
 * Scores each news item against the user's role, team, and active projects.
 * Classifies as: must-read | should-read | nice-to-know | skip.
 *
 * Scoring rubric (0-100):
 * - Direct team mention: 0-30 points
 * - Active project reference: 0-25 points
 * - Role relevance: 0-20 points
 * - Org unit match: 0-15 points
 * - Interest keyword match: 0-10 points
 */
export class RelevanceScorer {
  score(item: RawNewsItem, profile: UserProfile): ScoredNewsItem {
    let totalScore = 0;
    const matchReasons: string[] = [];

    // Team mention (0-30 points)
    const teamScore = this.scoreTeamMention(item, profile.team);
    if (teamScore > 0) {
      totalScore += teamScore;
      matchReasons.push(`team-mention:${profile.team}`);
    }

    // Active project reference (0-25 points)
    const projectScore = this.scoreProjectReference(item, profile.activeProjects);
    if (projectScore > 0) {
      totalScore += projectScore;
      matchReasons.push('project-reference');
    }

    // Role relevance (0-20 points)
    const roleScore = this.scoreRoleRelevance(item, profile.role);
    if (roleScore > 0) {
      totalScore += roleScore;
      matchReasons.push(`role-relevant:${profile.role}`);
    }

    // Org unit match (0-15 points)
    const orgScore = this.scoreOrgUnit(item, profile.orgUnit);
    if (orgScore > 0) {
      totalScore += orgScore;
      matchReasons.push(`org-unit:${profile.orgUnit}`);
    }

    // Interest keyword match (0-10 points)
    const interestScore = this.scoreInterests(item, profile.interests);
    if (interestScore > 0) {
      totalScore += interestScore;
      matchReasons.push('interest-match');
    }

    const clampedScore = Math.min(100, Math.max(0, Math.round(totalScore)));

    return {
      item,
      score: clampedScore,
      relevance: this.classifyRelevance(clampedScore),
      matchReasons,
    };
  }

  scoreBatch(items: RawNewsItem[], profile: UserProfile): ScoredNewsItem[] {
    return items
      .map((item) => this.score(item, profile))
      .sort((a, b) => b.score - a.score);
  }

  classifyRelevance(score: number): NewsRelevance {
    if (score >= 70) return 'must-read';
    if (score >= 45) return 'should-read';
    if (score >= 20) return 'nice-to-know';
    return 'skip';
  }

  private scoreTeamMention(item: RawNewsItem, team: string): number {
    const text = `${item.title} ${item.body}`.toLowerCase();
    const teamLower = team.toLowerCase();

    if (text.includes(teamLower)) return 30;

    // Partial match (team name words)
    const teamWords = teamLower.split(/\s+/);
    const matchedWords = teamWords.filter((w) => text.includes(w));
    if (matchedWords.length > 0) {
      return Math.round((matchedWords.length / teamWords.length) * 20);
    }

    return 0;
  }

  private scoreProjectReference(item: RawNewsItem, projects: string[]): number {
    if (projects.length === 0) return 0;

    const text = `${item.title} ${item.body}`.toLowerCase();
    const matchCount = projects.filter((p) => text.includes(p.toLowerCase())).length;

    if (matchCount === 0) return 0;
    if (matchCount === 1) return 15;
    return 25; // Multiple project references
  }

  private scoreRoleRelevance(item: RawNewsItem, role: string): number {
    const text = `${item.title} ${item.body}`.toLowerCase();
    const roleLower = role.toLowerCase();

    // Direct role mention
    if (text.includes(roleLower)) return 20;

    // Common role-adjacent keywords
    const roleKeywords: Record<string, string[]> = {
      engineer: ['engineering', 'technical', 'architecture', 'code', 'deploy'],
      manager: ['management', 'leadership', 'strategy', 'team', 'headcount'],
      designer: ['design', 'ux', 'ui', 'user experience', 'mockup'],
      analyst: ['analysis', 'data', 'metrics', 'report', 'dashboard'],
      director: ['strategy', 'roadmap', 'budget', 'executive', 'leadership'],
    };

    const keywords = roleKeywords[roleLower] ?? [];
    const keywordMatch = keywords.some((kw) => text.includes(kw));
    if (keywordMatch) return 10;

    return 0;
  }

  private scoreOrgUnit(item: RawNewsItem, orgUnit: string): number {
    const text = `${item.title} ${item.body}`.toLowerCase();
    if (text.includes(orgUnit.toLowerCase())) return 15;
    return 0;
  }

  private scoreInterests(item: RawNewsItem, interests: string[]): number {
    if (interests.length === 0) return 0;

    const text = `${item.title} ${item.body}`.toLowerCase();
    const matchCount = interests.filter((i) => text.includes(i.toLowerCase())).length;

    if (matchCount === 0) return 0;
    if (matchCount === 1) return 5;
    return 10;
  }
}
