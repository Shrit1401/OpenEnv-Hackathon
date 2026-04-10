import unittest

from fastapi.testclient import TestClient

from models import JuryAction
import server.app as app_module
from server.app import app
from server.jury_environment import JuryEnvironment


class TestRound1Smoke(unittest.TestCase):
    def setUp(self) -> None:
        # Reset the singleton env before each test so state never leaks
        app_module._env = JuryEnvironment()
        self.client = TestClient(app)

    def test_health_and_reset_contract(self) -> None:
        health = self.client.get("/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json()["status"], "healthy")

        reset = self.client.post("/reset", json={"task_id": "reasonable_doubt", "seed": 42})
        self.assertEqual(reset.status_code, 200)
        data = reset.json()
        self.assertIn("observation", data)
        self.assertFalse(data["done"])
        self.assertIsNone(data["reward"])
        self.assertEqual(data["observation"]["phase"], "voir_dire")
        self.assertIn("valid_actions", data["observation"])

    def test_invalid_action_penalty(self) -> None:
        self.client.post("/reset", json={"task_id": "reasonable_doubt", "seed": 42})
        # closing_emotional is invalid during voir_dire phase — server returns 422
        step = self.client.post("/step", json={"action": {"action_type": "closing_emotional"}})
        self.assertEqual(step.status_code, 422)

    def test_episode_reaches_terminal(self) -> None:
        env = JuryEnvironment()
        obs = env.reset(task_id="reasonable_doubt", seed=42).model_dump()
        for _ in range(60):
            if obs.get("done"):
                break
            valid = obs.get("valid_actions", [])
            if not valid:
                break
            action = valid[0]
            obs = env.step(JuryAction(action_type=action, target_index=0)).model_dump()
        self.assertTrue(obs.get("done"))
        self.assertEqual(obs.get("phase"), "verdict")

    def test_seed_reproducibility_and_variation(self) -> None:
        env1 = JuryEnvironment()
        env2 = JuryEnvironment()
        o1 = env1.reset(task_id="poisoned_panel", seed=111).model_dump()
        o2 = env2.reset(task_id="poisoned_panel", seed=111).model_dump()
        # Same seed → same observable state and same episode_id prefix
        self.assertEqual(o1["juror_moods"], o2["juror_moods"])
        self.assertEqual(o1["conviction_pressure"], o2["conviction_pressure"])
        self.assertEqual(o1["remaining_challenges"], o2["remaining_challenges"])
        # Different tasks → different conviction pressures
        env3 = JuryEnvironment()
        o3 = env3.reset(task_id="reasonable_doubt", seed=111).model_dump()
        self.assertNotEqual(o1["conviction_pressure"], o3["conviction_pressure"])

    def test_grade_range(self) -> None:
        """Grade must always stay in [0.02, 0.98] at reset and after several steps."""
        for task_id in ("reasonable_doubt", "poisoned_panel", "the_impossible_case"):
            env = JuryEnvironment()
            obs = env.reset(task_id=task_id, seed=42)
            score = env.grade()
            self.assertGreaterEqual(score, 0.02, f"{task_id}: grade below 0.02 at reset")
            self.assertLessEqual(score, 0.98, f"{task_id}: grade above 0.98 at reset")
            # Run 5 steps with first available valid action; grade must stay bounded
            for _ in range(5):
                valid = obs.valid_actions
                if not valid:
                    break
                obs = env.step(JuryAction(action_type=valid[0], target_index=0))
                score = env.grade()
                self.assertGreaterEqual(score, 0.02, f"{task_id}: grade below 0.02 mid-episode")
                self.assertLessEqual(score, 0.98, f"{task_id}: grade above 0.98 mid-episode")

    def test_new_observation_fields(self) -> None:
        """All Round-2 additive fields must be present and correctly populated."""
        reset = self.client.post("/reset", json={"task_id": "poisoned_panel", "seed": 42})
        self.assertEqual(reset.status_code, 200)
        obs = reset.json()["observation"]

        # All new field names must exist
        new_fields = [
            "case_summary", "charges", "evidence", "witness_profiles",
            "goals", "pending_goals", "coalition_hint",
            "cross_actions_remaining", "jury_patience",
            "juror_profiles_visible", "reward_breakdown",
            "phase_deadline_steps_remaining",
        ]
        for field in new_fields:
            self.assertIn(field, obs, f"Missing new field: {field}")

        # poisoned_panel must have a non-None coalition_hint
        self.assertIsNotNone(obs["coalition_hint"], "coalition_hint should be set for poisoned_panel")
        self.assertIn("seats", obs["coalition_hint"])

        # juror_profiles_visible must cover all 12 jurors
        self.assertEqual(len(obs["juror_profiles_visible"]), 12)

        # jury_patience starts at 1.0 (Tier A: always 1.0)
        self.assertAlmostEqual(obs["jury_patience"], 1.0, places=2)

        # case_summary and charges must be non-empty for poisoned_panel
        self.assertTrue(len(obs["case_summary"]) > 0, "case_summary should not be empty")
        self.assertTrue(len(obs["charges"]) > 0, "charges should not be empty")

        # After one valid step, reward_breakdown must have the expected keys
        step = self.client.post("/step", json={"action": {"action_type": "probe_bias"}})
        self.assertEqual(step.status_code, 200)
        breakdown = step.json()["observation"]["reward_breakdown"]
        for key in ("avg_conviction", "conviction_pressure_component", "fatigue_penalty_component", "trust_bonus_component"):
            self.assertIn(key, breakdown, f"Missing reward_breakdown key: {key}")

    def test_schema_response(self) -> None:
        """/schema must return action + observation schemas with new fields present."""
        resp = self.client.get("/schema")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("action", data)
        self.assertIn("observation", data)
        # New fields must appear in the observation JSON schema properties
        obs_props = data["observation"].get("properties", {})
        for field in ("jury_patience", "goals", "evidence", "cross_actions_remaining", "coalition_hint"):
            self.assertIn(field, obs_props, f"Field '{field}' missing from observation schema")

    def test_task_id_validation_http(self) -> None:
        """POST /reset with an unknown task_id must return HTTP 422."""
        resp = self.client.post("/reset", json={"task_id": "not_a_real_task", "seed": 42})
        self.assertEqual(resp.status_code, 422, "Unknown task_id should return 422")
        # Error detail should mention the bad task_id
        detail = resp.json().get("detail", "")
        self.assertIn("not_a_real_task", str(detail))

    def test_valid_actions_phase_consistency(self) -> None:
        """/valid_actions must reflect phase=voir_dire after reset with correct action list."""
        self.client.post("/reset", json={"task_id": "reasonable_doubt", "seed": 42})
        resp = self.client.get("/valid_actions")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["phase"], "voir_dire")
        # voir_dire must have exactly these 3 actions (order matters — defined by _PHASE_ACTIONS)
        self.assertEqual(
            sorted(data["valid_actions"]),
            sorted(["probe_bias", "challenge_juror", "accept_panel"]),
        )


    def test_patience_decays_on_repeat(self) -> None:
        """Repeating the same action 3+ times must cause jury_patience to drop below 1.0."""
        env = JuryEnvironment()
        env.reset(task_id="reasonable_doubt", seed=42)
        # probe_bias is valid in voir_dire; repeat it 4 times
        for _ in range(4):
            obs = env.step(JuryAction(action_type="probe_bias"))
        self.assertLess(obs.jury_patience, 1.0, "jury_patience should decay after repeated identical actions")
        self.assertGreaterEqual(obs.jury_patience, 0.20, "jury_patience should not drop below minimum of 0.20")


if __name__ == "__main__":
    unittest.main()
