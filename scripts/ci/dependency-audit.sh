#!/usr/bin/env bash
# CI Pipeline: Dependency audit and vulnerability scanning
# Constitution mandate: Update within 7 days for critical CVEs
#
# Usage: ./scripts/ci/dependency-audit.sh [--fail-on-critical] [--fix]
#
# This script:
# 1. Runs pnpm audit for Node.js dependencies
# 2. Runs govulncheck for Go operator dependencies
# 3. Reports findings and optionally fails on critical vulnerabilities

set -euo pipefail

FAIL_ON_CRITICAL=false
AUTO_FIX=false
EXIT_CODE=0

for arg in "$@"; do
  case "$arg" in
    --fail-on-critical) FAIL_ON_CRITICAL=true ;;
    --fix) AUTO_FIX=true ;;
  esac
done

echo "=== OpenClaw Enterprise Dependency Audit ==="
echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# --- Node.js (pnpm) audit ---
echo "--- Node.js Dependency Audit (pnpm) ---"
if command -v pnpm &> /dev/null; then
  AUDIT_OUTPUT=$(pnpm audit --json 2>/dev/null || true)

  CRITICAL_COUNT=$(echo "$AUDIT_OUTPUT" | grep -c '"severity":"critical"' 2>/dev/null || echo "0")
  HIGH_COUNT=$(echo "$AUDIT_OUTPUT" | grep -c '"severity":"high"' 2>/dev/null || echo "0")

  echo "Critical vulnerabilities: $CRITICAL_COUNT"
  echo "High vulnerabilities: $HIGH_COUNT"

  if [ "$CRITICAL_COUNT" -gt 0 ] && [ "$FAIL_ON_CRITICAL" = true ]; then
    echo "FAIL: Critical vulnerabilities found. Update within 7 days per constitution."
    EXIT_CODE=1
  fi

  if [ "$AUTO_FIX" = true ]; then
    echo "Attempting auto-fix..."
    pnpm audit --fix 2>/dev/null || echo "Some vulnerabilities could not be auto-fixed."
  fi
else
  echo "SKIP: pnpm not found"
fi

echo ""

# --- Go (govulncheck) audit ---
echo "--- Go Dependency Audit (operator/) ---"
if [ -d "operator" ] && [ -f "operator/go.mod" ]; then
  if command -v govulncheck &> /dev/null; then
    cd operator
    GOVULN_OUTPUT=$(govulncheck ./... 2>&1 || true)
    VULN_COUNT=$(echo "$GOVULN_OUTPUT" | grep -c "Vulnerability" 2>/dev/null || echo "0")
    echo "Go vulnerabilities found: $VULN_COUNT"

    if [ "$VULN_COUNT" -gt 0 ]; then
      echo "$GOVULN_OUTPUT"
      if [ "$FAIL_ON_CRITICAL" = true ]; then
        EXIT_CODE=1
      fi
    fi
    cd ..
  else
    echo "SKIP: govulncheck not installed (install: go install golang.org/x/vuln/cmd/govulncheck@latest)"
  fi
else
  echo "SKIP: operator/ directory not found"
fi

echo ""

# --- License compliance check ---
echo "--- License Compliance ---"
if command -v pnpm &> /dev/null; then
  # Check for copyleft licenses that may conflict with enterprise deployment
  COPYLEFT_DEPS=$(pnpm licenses list --json 2>/dev/null | grep -i '"GPL\|AGPL\|SSPL"' 2>/dev/null || echo "")
  if [ -n "$COPYLEFT_DEPS" ]; then
    echo "WARNING: Copyleft-licensed dependencies detected. Review for compliance."
    echo "$COPYLEFT_DEPS"
  else
    echo "OK: No copyleft license conflicts detected."
  fi
fi

echo ""
echo "=== Audit Complete ==="
exit $EXIT_CODE
