---
title: Scaler
emoji: 🏆
colorFrom: red
colorTo: indigo
sdk: docker
pinned: false
---

# Jury Consultant Environment

**OpenEnv hackathon submission — Nuera Rangers**  
**Built for Scaler Hackathon**

---

## What this project is

This project is a courtroom strategy environment where an AI agent plays a defense-side jury consultant.

The agent cannot see raw juror conviction values. It must act using only visible signals (mood, fatigue, phase state, valid actions) and reduce conviction pressure over time.

This is designed for:
- OpenEnv API compatibility
- deterministic grading and reproducibility
- hackathon demos (backend + optional cinematic frontend)

---

## Core scenario design

### Hidden state (backend only)
Each juror has hidden:
- conviction
- fatigue
- emotional temperature
- procedural trust
- aggression sensitivity
- social influence strength

### Visible state (agent/front-end sees this)
- phase
- step index
- conviction pressure (aggregate)
- juror mood labels
- juror fatigue labels
- remaining challenges
- remaining witnesses
- current witness
- last event
- task score
- valid actions

### Trial phases and actions
| Phase | Actions |
|---|---|
| `voir_dire` | `probe_bias`, `challenge_juror`, `accept_panel` |
| `witness_exam` | `call_witness`, `request_recess` |
| `cross_examination` | `gentle_cross`, `aggressive_cross`, `impeach_witness`, `request_recess` |
| `closing` | `closing_emotional`, `closing_reasonable_doubt`, `closing_procedural` |
| `verdict` | no actions |

---

## Tasks (single env, task via reset)

All tasks run in one environment. Task selection happens through `reset(task_id=...)`.

1. **`reasonable_doubt`**  
   Case label: **State v. Callahan**  
   Objective: lower average conviction.

2. **`poisoned_panel`**  
   Case label: **State v. Whitmore**  
   Objective: break hostile influence cluster.

3. **`the_impossible_case`**  
   Case label: **State v. Blackwood**  
   Objective: create split/holdout dynamics.

---

## Determinism and grading

- Grading is fully backend code (no LLM judging).
- Final task score is normalized in `0.0..1.0`.
- Same `task_id + seed + action sequence` => same rewards and score.
- Invalid actions are handled cleanly with penalty, not crash.
- Repeated useless action patterns receive increasing soft penalties.

---

## API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Liveness check |
| POST | `/reset` | Start new episode (`task_id`, optional `seed`) |
| POST | `/step` | Apply one action |
| GET | `/state` | Current state **with visible observation + valid actions** |
| GET | `/valid_actions` | Actions legal in current phase |
| GET | `/schema` | Pydantic schema metadata |

### `/reset` example
```json
{
  "task_id": "reasonable_doubt",
  "seed": 42
}
```

### `/step` example
```json
{
  "action": {
    "action_type": "probe_bias"
  }
}
```

---

## Inference script

`inference.py` exists in project root and supports reproducible baseline runs.

### Modes
- **Single task (default)**:
```bash
python inference.py --task reasonable_doubt
```

- **All tasks**:
```bash
python inference.py --all-tasks
```

### Notes
- Uses env vars for model/API config.
- Uses `temperature=0.0`.
- Includes deterministic fallback policy if LLM call fails.

---

## Local setup

## 1) Install dependencies
```bash
pip install "openenv-core[core]>=0.2.1" fastapi uvicorn pydantic requests openai
```

## 2) Start backend
```bash
uvicorn server.app:app --host 0.0.0.0 --port 7860
```

## 3) (Optional) Run frontend
```bash
cd frontend
npm install
npm run dev
```

---

## Environment variables

Required for LLM inference:
- `HF_TOKEN` (or `OPENAI_API_KEY`)

Optional:
- `API_BASE_URL` (default OpenAI-compatible endpoint)
- `MODEL_NAME` (default `gpt-4o`)
- `ENV_URL` (default `http://localhost:7860`)

---

## Validation commands

```bash
# Backend smoke tests
python -m unittest discover -s tests -p "test_*.py"

# Deterministic benchmark runs
python benchmark.py --seeds 42 43 44

# Frontend production build
cd frontend && npm run build
```

---

## Docker

```bash
docker build -t jury-consultant .
docker run -e HF_TOKEN=your_key -p 7860:7860 jury-consultant
```

---

## Hugging Face Spaces deploy

```bash
git remote add space https://huggingface.co/spaces/your-username/jury-consultant
git push space main
```

Set `HF_TOKEN` as a Space secret.

---

## Frontend highlights

- Cinematic courtroom UI
- Multilingual interface (English, Hindi, Kannada, Telugu)
- Onboarding card + level-based task selector
- Live transcript, pressure meter, and verdict reveal

---

## OpenEnv alignment summary

- One environment, three task configs
- Deterministic state transitions and deterministic grader
- `reset(task_id=...)` task switching
- Normalized score (`0.0..1.0`)
- Reproducible seeded episodes

See `openenv.yaml` for spec metadata.
