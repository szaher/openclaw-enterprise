# Load Test Plan — FR-045: 500 Concurrent Users

## Objective

Verify that OpenClaw Enterprise supports 500 concurrent users with acceptable response times as specified in FR-045.

## Test Environment

- **Target**: Production-equivalent K8s cluster
- **Gateway Replicas**: 3 (minimum HA configuration)
- **OPA Sidecars**: 1 per gateway pod
- **PostgreSQL**: 16.x with connection pooling (PgBouncer)
- **Redis**: 7.x cluster mode

## Scenarios

### Scenario 1: Briefing Generation Under Load
- **Users**: 500 concurrent
- **Action**: Each user triggers `generate_briefing` simultaneously
- **Expected**: All briefings complete within 30 seconds
- **Pass criteria**: P95 < 30s, P99 < 60s, zero errors

### Scenario 2: Policy Evaluation Throughput
- **Users**: 500 concurrent
- **Action**: Each user triggers 10 tool invocations (5000 total policy.evaluate calls)
- **Expected**: Policy evaluation under 100ms per call
- **Pass criteria**: P95 < 100ms, P99 < 500ms

### Scenario 3: Audit Log Write Throughput
- **Users**: 500 concurrent
- **Action**: Each action generates an audit entry (5000+ writes)
- **Expected**: Audit writes complete without backpressure
- **Pass criteria**: Zero dropped audit entries, P95 write < 50ms

### Scenario 4: Connector Read Burst
- **Users**: 100 concurrent (connector rate limits apply)
- **Action**: Each user reads from all 5 connectors simultaneously
- **Expected**: Graceful degradation when connector rate limits hit
- **Pass criteria**: No crashes, rate-limited requests queued or retried

### Scenario 5: Mixed Workload (Realistic)
- **Users**: 500 concurrent
- **Distribution**:
  - 40% reading briefings/tasks
  - 25% triggering auto-responses
  - 20% querying audit log
  - 10% admin operations (policy CRUD)
  - 5% OCIP agent-to-agent exchanges
- **Duration**: 30 minutes sustained
- **Pass criteria**: Error rate < 0.1%, P95 < 5s for reads, P95 < 10s for writes

## Tools

- **k6** for HTTP load testing
- **Custom harness** for WebSocket/sessions_send testing
- **Prometheus + Grafana** for metrics during test

## Metrics to Collect

| Metric | Target |
|--------|--------|
| Request throughput (req/s) | > 1000 |
| P50 response time | < 500ms |
| P95 response time | < 5s |
| P99 response time | < 15s |
| Error rate | < 0.1% |
| CPU utilization (gateway) | < 80% |
| Memory utilization (gateway) | < 80% |
| DB connection pool utilization | < 70% |
| Audit entry completeness | 100% |

## Results

> *Test results will be recorded here after execution against a production-equivalent environment.*

### Baseline (TBD)
| Scenario | P50 | P95 | P99 | Error Rate | Status |
|----------|-----|-----|-----|------------|--------|
| Briefing Generation | — | — | — | — | Not run |
| Policy Evaluation | — | — | — | — | Not run |
| Audit Write | — | — | — | — | Not run |
| Connector Burst | — | — | — | — | Not run |
| Mixed Workload | — | — | — | — | Not run |

## Scaling Recommendations

Based on test results, document:
1. Minimum pod count for 500 users
2. Database connection pool sizing
3. Redis cache sizing
4. OPA sidecar resource limits
5. Horizontal Pod Autoscaler configuration
