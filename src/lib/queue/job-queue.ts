// Job Queue — In-memory priority job queue with concurrency control

export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'retrying';
  priority: number;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
  progress?: number;
}

type JobHandler = (job: Job) => Promise<unknown>;

export class JobQueue {
  private queue: Job[] = [];
  private activeJobs: Map<string, Job> = new Map();
  private completedJobs: Map<string, Job> = new Map();
  private maxConcurrency: number;
  private handlers: Map<string, JobHandler> = new Map();
  private processing = false;
  private jobCounter = 0;

  constructor(maxConcurrency: number = 3) {
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * Add a job to the queue
   */
  enqueue(type: string, payload: Record<string, unknown>, priority: number = 0): string {
    const id = `job_${Date.now()}_${++this.jobCounter}`;

    const job: Job = {
      id,
      type,
      payload,
      status: 'queued',
      priority,
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date().toISOString(),
    };

    this.queue.push(job);

    // Sort by priority (higher first)
    this.queue.sort((a, b) => b.priority - a.priority);

    // Start processing if not already running
    this.processQueue();

    return id;
  }

  /**
   * Register a handler for a job type
   */
  registerHandler(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  /**
   * Start processing the queue
   */
  start(): void {
    this.processing = true;
    this.processQueue();
  }

  /**
   * Stop processing the queue
   */
  stop(): void {
    this.processing = false;
  }

  /**
   * Get queue status
   */
  getStatus(): { queued: number; active: number; completed: number; failed: number } {
    return {
      queued: this.queue.length,
      active: this.activeJobs.size,
      completed: Array.from(this.completedJobs.values()).filter(j => j.status === 'completed').length,
      failed: Array.from(this.completedJobs.values()).filter(j => j.status === 'failed').length,
    };
  }

  /**
   * Get a job by ID
   */
  getJob(id: string): Job | undefined {
    return this.activeJobs.get(id) || this.completedJobs.get(id) || this.queue.find(j => j.id === id);
  }

  /**
   * Get all jobs
   */
  getAllJobs(): Job[] {
    return [...this.queue, ...Array.from(this.activeJobs.values()), ...Array.from(this.completedJobs.values())];
  }

  /**
   * Process the queue
   */
  private processQueue(): void {
    if (!this.processing) return;

    while (this.activeJobs.size < this.maxConcurrency && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;

      this.activeJobs.set(job.id, job);
      this.executeJob(job);
    }
  }

  /**
   * Execute a single job
   */
  private async executeJob(job: Job): Promise<void> {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      job.status = 'failed';
      job.error = `Aucun gestionnaire pour le type: ${job.type}`;
      this.completeJob(job);
      return;
    }

    job.status = 'running';
    job.startedAt = new Date().toISOString();
    job.attempts++;

    try {
      const result = await handler(job);
      job.status = 'completed';
      job.result = result;
      job.completedAt = new Date().toISOString();
      this.completeJob(job);
    } catch (error) {
      if (job.attempts < job.maxAttempts) {
        job.status = 'retrying';
        // Re-queue with a slight delay
        setTimeout(() => {
          job.status = 'queued';
          this.queue.unshift(job); // Add to front for retry
          this.processQueue();
        }, 1000 * job.attempts); // Exponential backoff
      } else {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'Erreur inconnue';
        job.completedAt = new Date().toISOString();
        this.completeJob(job);
      }
    }
  }

  /**
   * Complete a job and move it to completed jobs
   */
  private completeJob(job: Job): void {
    this.activeJobs.delete(job.id);
    this.completedJobs.set(job.id, job);

    // Keep only last 100 completed jobs to prevent memory leaks
    if (this.completedJobs.size > 100) {
      const oldest = Array.from(this.completedJobs.keys()).slice(0, 50);
      for (const key of oldest) {
        this.completedJobs.delete(key);
      }
    }

    this.processQueue();
  }
}
