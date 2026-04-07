# CHANGES

This file summarizes the implementation updates completed in this session for Round-1 readiness, reliability, and debugging clarity.

## 1) Frontend reliability + transcript improvements

### API base URL default fix
- File: `frontend/src/lib/api.ts`
- Change:
  - Updated default API URL from `http://0.0.0.0:7860` to `http://localhost:7860`.
- Why:
  - Browsers cannot reliably fetch `0.0.0.0`; this caused `API Offline / Failed to fetch` in the UI.

### Live Transcript quality upgrade
- File: `frontend/src/App.tsx`
- Changes:
  - Added richer transcript entry generation using current + previous observation:
    - inferred action label from courtroom event text
    - conviction pressure trend (improved/worsened/flat with point delta)
    - mood shift summary (hostile/receptive count deltas)
    - phase and score snapshot
  - Added transcript dedupe guard to avoid repeated entries from sync updates.
  - Added tone-aware transcript styling:
    - positive (green tint)
    - warning (red tint)
    - neutral (default)
- Why:
  - Makes the live feed easier to follow during demos and judge review.

## 2) Backend logging and observability hardening

### API request logging middleware
- File: `server/app.py`
- Changes:
  - Added structured request logging middleware with:
    - `request_id`, method, path, status, elapsed milliseconds
  - Added `X-Request-ID` response header for traceability.
  - Added consistent logger initialization for API logs.
- Why:
  - Makes endpoint behavior and latency easy to inspect and debug.

### Environment event logging
- File: `server/jury_environment.py`
- Changes:
  - Added structured reset logs (episode, task, seed, start pressure, resources).
  - Added structured step logs:
    - action, target index, phase transition, pressure before/after,
      reward, score, done
  - Added warning logs for invalid actions with valid action list.
- Why:
  - Provides a clear action-by-action audit trail for development and evaluation.

## 3) Determinism and reproducibility improvements

### Seed behavior expanded
- File: `server/jury_environment.py`
- Changes:
  - `_make_task()` now accepts `seed`.
  - `reset(seed=...)` now passes seed into task generation.
- Why:
  - Seed now controls full episode initialization jitter, improving reproducibility.

## 4) Baseline agent robustness

### Visible fallback diagnostics
- File: `inference.py`
- Changes:
  - LLM failure fallback now logs:
    - phase
    - step index
    - exception type + message
- Why:
  - Prevents silent masking of API/model failures and simplifies troubleshooting.

## 5) Round-1 evaluator tooling added

### Deterministic benchmark script
- File: `benchmark.py` (new)
- What it does:
  - Runs all tasks across provided seeds.
  - Outputs JSON summary with per-task and overall metrics:
    - average score
    - average final pressure
    - average total reward
    - per-run details
- Why:
  - Provides programmatic evidence for Round-1 evaluation.

### Smoke tests for core contract
- File: `tests/test_round1_smoke.py` (new)
- Coverage:
  - `/health` and `/reset` contract
  - invalid action penalty behavior
  - episode reaches terminal state
  - seed reproducibility + variation
- Why:
  - Adds minimum automated checks for environment correctness.

## 6) Documentation updates

### Round-1 quickstart section
- File: `README.md`
- Changes:
  - Added test and benchmark commands for evaluator workflow:
    - `python -m unittest discover -s tests -p "test_*.py"`
    - `python benchmark.py --seeds 42 43 44`
  - Added explanation of what seed controls.
- Why:
  - Makes submission checks clear and repeatable.

## 7) Validation run status

Completed after changes:
- Backend tests: `python -m unittest discover -s tests -p "test_*.py"` -> PASS
- Frontend build: `npm run build` -> PASS
- Backend health check: `GET /health` -> PASS

---

If you want, this changelog can be split into:
- `CHANGES_ROUND1.md` (submission-facing summary)
- `CHANGES_TECHNICAL.md` (developer/internal detail)
