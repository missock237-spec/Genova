// Rate Limiter — Sliding window rate limiting

export class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  /**
   * Check if a request is allowed within the rate limit
   */
  isAllowed(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = this.requests.get(key) || [];

    // Remove timestamps outside the window
    timestamps = timestamps.filter(ts => ts > windowStart);

    if (timestamps.length >= maxRequests) {
      this.requests.set(key, timestamps);
      return false;
    }

    timestamps.push(now);
    this.requests.set(key, timestamps);
    return true;
  }

  /**
   * Get remaining requests for a key
   */
  getRemaining(key: string, maxRequests: number, windowMs: number): number {
    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = this.requests.get(key) || [];
    timestamps = timestamps.filter(ts => ts > windowStart);
    this.requests.set(key, timestamps);

    return Math.max(0, maxRequests - timestamps.length);
  }

  /**
   * Get time until next request is allowed (in ms)
   */
  getRetryAfter(key: string, maxRequests: number, windowMs: number): number {
    const timestamps = this.requests.get(key) || [];
    if (timestamps.length < maxRequests) return 0;

    const oldestInWindow = timestamps[0];
    return Math.max(0, oldestInWindow + windowMs - Date.now());
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.requests.delete(key);
  }

  /**
   * Clean up old entries to prevent memory leaks
   */
  cleanup(windowMs: number = 3600000): void {
    const now = Date.now();
    for (const [key, timestamps] of this.requests.entries()) {
      const filtered = timestamps.filter(ts => ts > now - windowMs);
      if (filtered.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, filtered);
      }
    }
  }
}
