import type { Briefing } from '@openclaw-enterprise/shared/types.js';
import { TaskDiscoveryScanner } from '../discovery/scanner.js';
import { TaskCorrelator } from '../correlation/correlator.js';
import { PriorityScorer } from '../scoring/scorer.js';
import { BriefingGenerator, type BriefingInput, type CalendarEvent } from './generator.js';

export interface BriefingStore {
  save(briefing: Briefing): Promise<void>;
}

export interface BriefingDelivery {
  deliver(briefing: Briefing): Promise<void>;
}

/**
 * Briefing scheduler service.
 * Registered via api.registerService().
 *
 * - Generates morning briefing on cron schedule
 * - Refreshes briefing during the day as new data arrives
 * - Persists briefings to PostgreSQL
 * - Delivers via configured channel (slack/email/web_ui)
 */
export class BriefingScheduler {
  private interval: ReturnType<typeof setInterval> | null = null;
  private running = false;

  private readonly scanner: TaskDiscoveryScanner;
  private readonly correlator: TaskCorrelator;
  private readonly scorer: PriorityScorer;
  private readonly generator: BriefingGenerator;

  constructor(
    scanner: TaskDiscoveryScanner,
    private readonly store: BriefingStore,
    private readonly delivery: BriefingDelivery,
    private readonly getCalendarEvents: () => Promise<CalendarEvent[]>,
    private readonly userId: string,
    private readonly tenantId: string,
    private readonly scheduleIntervalMs: number = 3600 * 1000, // Refresh hourly
  ) {
    this.scanner = scanner;
    this.correlator = new TaskCorrelator();
    this.scorer = new PriorityScorer();
    this.generator = new BriefingGenerator();
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Generate initial briefing
    await this.generateAndDeliver();

    // Schedule periodic refreshes
    this.interval = setInterval(() => {
      void this.generateAndDeliver();
    }, this.scheduleIntervalMs);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async healthCheck(): Promise<{ status: string }> {
    return { status: this.running ? 'healthy' : 'stopped' };
  }

  async generateAndDeliver(): Promise<Briefing> {
    // 1. Discover tasks from all connectors
    const discovered = await this.scanner.scan();

    // 2. Correlate and deduplicate
    const groups = this.correlator.correlate(discovered);

    // 3. Score by priority
    const primaryTasks = groups.map((g) => g.primary);
    const scored = this.scorer.scoreBatch(primaryTasks);

    // 4. Get calendar events for time-blocking
    const calendarEvents = await this.getCalendarEvents();

    // 5. Generate briefing
    const input: BriefingInput = {
      userId: this.userId,
      tenantId: this.tenantId,
      taskGroups: groups,
      scoredTasks: scored,
      calendarEvents,
      connectorStatuses: {
        gmail: 'ok',
        gcal: 'ok',
        jira: 'ok',
        github: 'ok',
        gdrive: 'ok',
      },
    };

    const briefing = this.generator.generate(input);

    // 6. Persist and deliver
    await this.store.save(briefing);
    await this.delivery.deliver(briefing);

    return briefing;
  }
}
