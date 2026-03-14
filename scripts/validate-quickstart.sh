#!/usr/bin/env bash
# Quickstart Validation Script
# Verifies all checklist items from specs/001-enterprise-ai-platform/quickstart.md
#
# Usage: ./scripts/validate-quickstart.sh [--namespace NAMESPACE]
#
# Requires: kubectl configured with cluster access, curl, jq

set -euo pipefail

NAMESPACE="${NAMESPACE:-openclaw-system}"
PASS=0
FAIL=0
SKIP=0

for arg in "$@"; do
  case "$arg" in
    --namespace) shift; NAMESPACE="$1"; shift ;;
  esac
done

check() {
  local description="$1"
  local command="$2"

  printf "  %-60s " "$description"
  if eval "$command" > /dev/null 2>&1; then
    echo "[PASS]"
    PASS=$((PASS + 1))
  else
    echo "[FAIL]"
    FAIL=$((FAIL + 1))
  fi
}

skip() {
  local description="$1"
  local reason="$2"
  printf "  %-60s [SKIP] %s\n" "$description" "$reason"
  SKIP=$((SKIP + 1))
}

echo "=== OpenClaw Enterprise Quickstart Validation ==="
echo "Namespace: $NAMESPACE"
echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# Check prerequisites
echo "--- Prerequisites ---"
check "kubectl is available" "command -v kubectl"
check "kubectl can reach cluster" "kubectl cluster-info"

echo ""
echo "--- Step 1: Operator ---"
check "Operator pod is running" \
  "kubectl get pods -n $NAMESPACE -l app=openclaw-operator --field-selector=status.phase=Running -o name | grep -q pod"
check "CRDs are installed (OpenClawInstance)" \
  "kubectl get crd openclawinstances.openclaw.io"
check "CRDs are installed (PolicyBundle)" \
  "kubectl get crd policybundles.openclaw.io"

echo ""
echo "--- Step 2: Database Secrets ---"
check "Database secret exists" \
  "kubectl get secret openclaw-db -n $NAMESPACE"
check "Audit database secret exists" \
  "kubectl get secret openclaw-audit-db -n $NAMESPACE"
check "Redis secret exists" \
  "kubectl get secret openclaw-redis -n $NAMESPACE"

echo ""
echo "--- Step 4: Instance ---"
check "OpenClawInstance exists" \
  "kubectl get openclawinstance -n $NAMESPACE -o name | grep -q openclawinstance"
check "Gateway pods are running" \
  "kubectl get pods -n $NAMESPACE -l app=openclaw-gateway --field-selector=status.phase=Running -o name | grep -q pod"
check "OPA sidecar is running" \
  "kubectl get pods -n $NAMESPACE -l app=openclaw-gateway -o jsonpath='{.items[0].spec.containers[*].name}' | grep -q opa"

echo ""
echo "--- Step 5: Policies ---"
check "PolicyBundle exists" \
  "kubectl get policybundle -n $NAMESPACE -o name | grep -q policybundle"

echo ""
echo "--- Step 6: API Verification ---"
# These require a valid token and accessible endpoint
if [ -n "${OPENCLAW_API_URL:-}" ] && [ -n "${OPENCLAW_TOKEN:-}" ]; then
  check "System status endpoint" \
    "curl -sf -H 'Authorization: Bearer $OPENCLAW_TOKEN' $OPENCLAW_API_URL/api/v1/status | jq -e '.status'"
  check "SSO userinfo endpoint" \
    "curl -sf -H 'Authorization: Bearer $OPENCLAW_TOKEN' $OPENCLAW_API_URL/api/v1/auth/userinfo | jq -e '.userId'"
  check "Connectors endpoint" \
    "curl -sf -H 'Authorization: Bearer $OPENCLAW_TOKEN' $OPENCLAW_API_URL/api/v1/connectors | jq -e '.'"
  check "Policies endpoint" \
    "curl -sf -H 'Authorization: Bearer $OPENCLAW_TOKEN' $OPENCLAW_API_URL/api/v1/policies | jq -e '.'"
  check "Audit log endpoint" \
    "curl -sf -H 'Authorization: Bearer $OPENCLAW_TOKEN' $OPENCLAW_API_URL/api/v1/audit | jq -e '.'"
else
  skip "API endpoints" "Set OPENCLAW_API_URL and OPENCLAW_TOKEN to validate"
fi

echo ""
echo "=== Summary ==="
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
echo "  Skipped: $SKIP"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "RESULT: FAIL — $FAIL check(s) did not pass"
  exit 1
else
  echo "RESULT: PASS — All checks passed"
  exit 0
fi
