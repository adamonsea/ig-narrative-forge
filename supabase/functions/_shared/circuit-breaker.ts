/**
 * Circuit Breaker Pattern Implementation for Scraping Resilience
 * Manages source health states and prevents cascading failures
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTime: number; // milliseconds
  monitoringWindow: number; // milliseconds
  minRequests: number; // minimum requests before circuit can open
}

export interface CircuitMetrics {
  requests: number;
  failures: number;
  successes: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  consecutiveFailures: number;
  lastStateChange: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private metrics: CircuitMetrics;
  private config: CircuitBreakerConfig;
  private sourceId: string;

  constructor(
    sourceId: string,
    config: Partial<CircuitBreakerConfig> = {}
  ) {
    this.sourceId = sourceId;
    this.config = {
      failureThreshold: 5, // Open after 5 consecutive failures
      recoveryTime: 300000, // 5 minutes recovery time
      monitoringWindow: 600000, // 10 minute monitoring window
      minRequests: 3, // Need at least 3 requests before opening
      ...config
    };

    this.metrics = {
      requests: 0,
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      lastSuccessTime: 0,
      consecutiveFailures: 0,
      lastStateChange: Date.now()
    };

    console.log(`🔌 Circuit breaker initialized for source ${sourceId} with config:`, this.config);
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
        this.metrics.lastStateChange = Date.now();
        console.log(`🔄 Circuit breaker ${this.sourceId}: Transitioning to HALF_OPEN`);
      } else {
        const timeToRecovery = this.config.recoveryTime - (Date.now() - this.metrics.lastFailureTime);
        throw new Error(`Circuit breaker OPEN for source ${this.sourceId}. Recovery in ${Math.round(timeToRecovery / 1000)}s`);
      }
    }

    this.metrics.requests++;
    const startTime = Date.now();

    try {
      const result = await operation();
      this.recordSuccess();
      console.log(`✅ Circuit breaker ${this.sourceId}: Operation succeeded (${Date.now() - startTime}ms)`);
      return result;
    } catch (error) {
      this.recordFailure();
      console.log(`❌ Circuit breaker ${this.sourceId}: Operation failed - ${error.message}`);
      throw error;
    }
  }

  /**
   * Record successful operation
   */
  private recordSuccess(): void {
    this.metrics.successes++;
    this.metrics.lastSuccessTime = Date.now();
    this.metrics.consecutiveFailures = 0;

    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.metrics.lastStateChange = Date.now();
      console.log(`🟢 Circuit breaker ${this.sourceId}: Recovered to CLOSED state`);
    }
  }

  /**
   * Record failed operation
   */
  private recordFailure(): void {
    this.metrics.failures++;
    this.metrics.lastFailureTime = Date.now();
    this.metrics.consecutiveFailures++;

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.metrics.lastStateChange = Date.now();
      console.log(`🔴 Circuit breaker ${this.sourceId}: Failed in HALF_OPEN, returning to OPEN`);
    } else if (this.shouldTripCircuit()) {
      this.state = 'OPEN';
      this.metrics.lastStateChange = Date.now();
      console.log(`🔴 Circuit breaker ${this.sourceId}: TRIPPED - too many failures (${this.metrics.consecutiveFailures}/${this.config.failureThreshold})`);
    }
  }

  /**
   * Determine if circuit should be tripped
   */
  private shouldTripCircuit(): boolean {
    return (
      this.metrics.requests >= this.config.minRequests &&
      this.metrics.consecutiveFailures >= this.config.failureThreshold
    );
  }

  /**
   * Check if circuit should attempt to reset from OPEN to HALF_OPEN
   */
  private shouldAttemptReset(): boolean {
    return Date.now() - this.metrics.lastFailureTime >= this.config.recoveryTime;
  }

  /**
   * Get current circuit status
   */
  getStatus(): {
    state: CircuitState;
    metrics: CircuitMetrics;
    config: CircuitBreakerConfig;
    isHealthy: boolean;
    failureRate: number;
    timeToRecovery?: number;
  } {
    const failureRate = this.metrics.requests > 0 
      ? (this.metrics.failures / this.metrics.requests) * 100 
      : 0;

    const timeToRecovery = this.state === 'OPEN' 
      ? Math.max(0, this.config.recoveryTime - (Date.now() - this.metrics.lastFailureTime))
      : undefined;

    return {
      state: this.state,
      metrics: { ...this.metrics },
      config: { ...this.config },
      isHealthy: this.state === 'CLOSED' && failureRate < 50,
      failureRate: Math.round(failureRate * 100) / 100,
      timeToRecovery
    };
  }

  /**
   * Reset circuit breaker (for manual intervention)
   */
  reset(): void {
    this.state = 'CLOSED';
    this.metrics = {
      requests: 0,
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      lastSuccessTime: 0,
      consecutiveFailures: 0,
      lastStateChange: Date.now()
    };
    console.log(`🔄 Circuit breaker ${this.sourceId}: Manually reset`);
  }

  /**
   * Check if operation should be allowed
   */
  canExecute(): boolean {
    if (this.state === 'OPEN') {
      return this.shouldAttemptReset();
    }
    return true;
  }

  /**
   * Get health score (0-100)
   */
  getHealthScore(): number {
    if (this.metrics.requests === 0) return 100;
    
    const successRate = (this.metrics.successes / this.metrics.requests) * 100;
    const recencyFactor = this.getRecencyFactor();
    const statePenalty = this.getStatePenalty();
    
    return Math.max(0, Math.min(100, successRate * recencyFactor - statePenalty));
  }

  private getRecencyFactor(): number {
    const timeSinceLastSuccess = Date.now() - this.metrics.lastSuccessTime;
    if (timeSinceLastSuccess < 3600000) return 1.0; // Last hour: full score
    if (timeSinceLastSuccess < 86400000) return 0.8; // Last day: 80%
    return 0.5; // Older: 50%
  }

  private getStatePenalty(): number {
    switch (this.state) {
      case 'OPEN': return 50; // Heavy penalty for open circuit
      case 'HALF_OPEN': return 20; // Moderate penalty for unstable state
      case 'CLOSED': return 0; // No penalty for healthy state
    }
  }
}

/**
 * Circuit Breaker Manager for managing multiple source circuit breakers
 */
export class CircuitBreakerManager {
  private circuits = new Map<string, CircuitBreaker>();
  private globalConfig: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.globalConfig = {
      failureThreshold: 5,
      recoveryTime: 300000, // 5 minutes
      monitoringWindow: 600000, // 10 minutes
      minRequests: 3,
      ...config
    };
  }

  /**
   * Get or create circuit breaker for source
   */
  getCircuitBreaker(sourceId: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.circuits.has(sourceId)) {
      const circuitConfig = { ...this.globalConfig, ...config };
      this.circuits.set(sourceId, new CircuitBreaker(sourceId, circuitConfig));
    }
    return this.circuits.get(sourceId)!;
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(sourceId: string, operation: () => Promise<T>): Promise<T> {
    const circuit = this.getCircuitBreaker(sourceId);
    return await circuit.execute(operation);
  }

  /**
   * Check if source is healthy and can be used
   */
  isSourceHealthy(sourceId: string): boolean {
    const circuit = this.circuits.get(sourceId);
    if (!circuit) return true; // New sources are considered healthy
    return circuit.getStatus().isHealthy;
  }

  /**
   * Get health status of all sources
   */
  getAllSourcesStatus(): Record<string, ReturnType<CircuitBreaker['getStatus']>> {
    const status: Record<string, ReturnType<CircuitBreaker['getStatus']>> = {};
    
    for (const [sourceId, circuit] of this.circuits) {
      status[sourceId] = circuit.getStatus();
    }
    
    return status;
  }

  /**
   * Get healthy sources sorted by health score
   */
  getHealthySources(): Array<{ sourceId: string; healthScore: number; status: ReturnType<CircuitBreaker['getStatus']> }> {
    return Array.from(this.circuits.entries())
      .map(([sourceId, circuit]) => ({
        sourceId,
        healthScore: circuit.getHealthScore(),
        status: circuit.getStatus()
      }))
      .filter(source => source.status.isHealthy)
      .sort((a, b) => b.healthScore - a.healthScore);
  }

  /**
   * Reset circuit breaker for specific source
   */
  resetSource(sourceId: string): boolean {
    const circuit = this.circuits.get(sourceId);
    if (circuit) {
      circuit.reset();
      return true;
    }
    return false;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const circuit of this.circuits.values()) {
      circuit.reset();
    }
    console.log('🔄 All circuit breakers reset');
  }

  /**
   * Get circuit breaker statistics
   */
  getStatistics(): {
    totalSources: number;
    healthySources: number;
    openCircuits: number;
    halfOpenCircuits: number;
    avgHealthScore: number;
  } {
    const statuses = Object.values(this.getAllSourcesStatus());
    
    return {
      totalSources: statuses.length,
      healthySources: statuses.filter(s => s.isHealthy).length,
      openCircuits: statuses.filter(s => s.state === 'OPEN').length,
      halfOpenCircuits: statuses.filter(s => s.state === 'HALF_OPEN').length,
      avgHealthScore: statuses.length > 0 
        ? Math.round(statuses.reduce((sum, s) => sum + (s.metrics.requests > 0 ? (s.metrics.successes / s.metrics.requests) * 100 : 100), 0) / statuses.length)
        : 100
    };
  }
}