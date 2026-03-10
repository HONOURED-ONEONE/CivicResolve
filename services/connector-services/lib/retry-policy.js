class RetryPolicy {
  constructor() {
    this.maxRetries = 3;
    this.baseBackoffMs = 1000;
  }

  // Determine if an error is transient and should be retried
  isRetryable(error) {
    if (!error) return false;
    // For now, consider network errors or 5xx status codes retryable
    const status = error.status || 500;
    if (status >= 500) return true;
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return true;
    return false;
  }

  // Calculate backoff time with simple exponential strategy
  getBackoffTime(attempt) {
    return this.baseBackoffMs * Math.pow(2, attempt - 1);
  }

  // Helper to execute a function with retries
  async execute(fn) {
    let attempt = 1;
    while (attempt <= this.maxRetries) {
      try {
        return await fn();
      } catch (error) {
        if (attempt >= this.maxRetries || !this.isRetryable(error)) {
          throw error;
        }
        const delay = this.getBackoffTime(attempt);
        console.log(`Retry attempt ${attempt} failed. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
      }
    }
  }
}

module.exports = new RetryPolicy();
