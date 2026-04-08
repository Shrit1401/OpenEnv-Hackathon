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


if __name__ == "__main__":
    unittest.main()
