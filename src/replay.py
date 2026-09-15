"""Evaluate each replay prefix without including future readings."""
import json
from src.detector import analyze
from src.scenarios import load_scenario


def build_replay(name):
    df = load_scenario(name)
    readings = json.loads(df.to_json(orient="records"))
    frames = [analyze(df.iloc[:count]) for count in range(1, len(df) + 1)]
    return {"name": name, "readings": readings, "frames": frames,
            "assessment": frames[-1] if frames else analyze(df)}
