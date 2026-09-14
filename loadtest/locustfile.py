"""
FEVER^ Load Testing Suite
=========================
Run:
    locust -f locustfile.py --host https://fever.example.com

Or headless with the built-in step-ramp shape:
    locust -f locustfile.py --host https://fever.example.com --headless

Designed and Developed by Nikhil Chary Sriramoju
GitHub: https://github.com/Nikhil-creat | LinkedIn: https://in.linkedin.com/in/nikhil-chary-sriramoju-95041b38a
Email: sriramojunikhil66@gmail.com | Phone: +91 6300556301
"""

import random
import string
import time
from locust import HttpUser, task, between, LoadTestShape, events

# ---------------------------------------------------------------------------
# Synthetic payload generators
# ---------------------------------------------------------------------------
SKILL_POOL = [
    "python", "kubernetes", "docker", "aws", "terraform", "react", "sql",
    "golang", "distributed systems", "ci/cd", "prometheus", "grafana",
    "redis", "postgresql", "machine learning", "nlp", "microservices",
]

ROLE_TITLES = [
    "Backend Engineer", "DevOps Engineer", "SRE", "Data Scientist",
    "Platform Engineer", "Full Stack Developer", "ML Engineer",
]


def _random_id(n: int = 10) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


def generate_job_description() -> str:
    role = random.choice(ROLE_TITLES)
    skills = random.sample(SKILL_POOL, k=random.randint(4, 8))
    years = random.randint(2, 10)
    return (
        f"We are hiring a {role} with {years}+ years of experience. "
        f"Required skills: {', '.join(skills)}. "
        f"Must be comfortable working in a fast-paced, high-throughput environment."
    )


def generate_resume_text() -> str:
    skills = random.sample(SKILL_POOL, k=random.randint(3, 10))
    experience_lines = [
        f"Worked with {s} for {random.randint(1, 6)} years." for s in skills
    ]
    return " ".join(experience_lines)


def generate_match_payload() -> dict:
    return {
        "candidate_id": _random_id(),
        "job_description": generate_job_description(),
        "resume_text": generate_resume_text(),
    }


# ---------------------------------------------------------------------------
# User behavior
# ---------------------------------------------------------------------------
class FeverMatchingUser(HttpUser):
    """Simulates a client hitting the FEVER^ matching API under heavy concurrency."""

    wait_time = between(0.5, 2.0)

    @task(8)
    def match_resume(self):
        payload = generate_match_payload()
        with self.client.post(
            "/api/v1/match", json=payload, catch_response=True, name="/api/v1/match"
        ) as resp:
            self._validate_match_response(resp, payload)

    @task(1)
    def health_check(self):
        self.client.get("/health/live", name="/health/live")

    @task(1)
    def metrics_scrape(self):
        # Simulates occasional external probing; not representative of real Prometheus
        # scrape frequency, kept low-weight so it doesn't skew API latency numbers.
        self.client.get("/metrics", name="/metrics")

    def _validate_match_response(self, resp, payload):
        if resp.status_code != 200:
            resp.failure(f"Unexpected status code: {resp.status_code}")
            return
        try:
            data = resp.json()
        except ValueError:
            resp.failure("Response was not valid JSON")
            return

        if "score" not in data or not isinstance(data["score"], (int, float)):
            resp.failure("Missing or invalid 'score' field")
            return
        if not (0.0 <= data["score"] <= 1.0):
            resp.failure(f"Score out of expected range [0,1]: {data['score']}")
            return
        if data.get("candidate_id") != payload["candidate_id"]:
            resp.failure("candidate_id mismatch in response")
            return

        resp.success()


# ---------------------------------------------------------------------------
# Custom traffic shape: warm-up -> steady -> step ramp -> spike -> cool-down
# ---------------------------------------------------------------------------
class StepRampSpikeShape(LoadTestShape):
    """
    Stage-based load profile for realistic capacity/HPA validation:

      0s -  60s : warm-up          (10 users)
     60s - 180s : steady baseline  (50 users)
    180s - 300s : step ramp        (50 -> 200 users, +50 every 30s)
    300s - 360s : spike            (500 users) — validates HPA reaction time
    360s - 420s : cool-down        (50 users)
    """

    stages = [
        {"duration": 60, "users": 10, "spawn_rate": 5},
        {"duration": 180, "users": 50, "spawn_rate": 10},
        {"duration": 210, "users": 100, "spawn_rate": 20},
        {"duration": 240, "users": 150, "spawn_rate": 20},
        {"duration": 270, "users": 200, "spawn_rate": 20},
        {"duration": 300, "users": 200, "spawn_rate": 20},
        {"duration": 360, "users": 500, "spawn_rate": 100},   # spike
        {"duration": 420, "users": 50, "spawn_rate": 50},     # cool-down
    ]

    def tick(self):
        run_time = self.get_run_time()
        for stage in self.stages:
            if run_time < stage["duration"]:
                return (stage["users"], stage["spawn_rate"])
        return None  # end load test


# ---------------------------------------------------------------------------
# Event hooks: summary logging
# ---------------------------------------------------------------------------
@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    print(f"[FEVER load test] starting at {time.strftime('%Y-%m-%d %H:%M:%S')}")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    stats = environment.stats.total
    print(
        f"[FEVER load test] complete — requests={stats.num_requests} "
        f"failures={stats.num_failures} p95={stats.get_response_time_percentile(0.95)}ms"
    )
