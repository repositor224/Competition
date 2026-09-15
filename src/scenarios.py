import os

import pandas as pd

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

_SCENARIO_FILES = {
    "normal": "normal.csv",
    "altercation": "altercation.csv",
    "distress": "distress.csv",
    # Optional PRD test scenarios (S2, S5, S6)
    "benign_loud": "benign_loud.csv",
    "vape_only": "vape_only.csv",
    "missing_data": "missing_data.csv",
}


def load_scenario(name: str):
    """
    name:
        "normal"
        "altercation"
        "distress"
        "benign_loud"    (optional)
        "vape_only"      (optional)
        "missing_data"   (optional)

    returns:
        pandas DataFrame
    """
    if name not in _SCENARIO_FILES:
        raise ValueError(
            f"Unknown scenario '{name}'. Expected one of: {list(_SCENARIO_FILES.keys())}"
        )

    path = os.path.join(_DATA_DIR, _SCENARIO_FILES[name])
    return pd.read_csv(path)
