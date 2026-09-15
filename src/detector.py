"""
Fusion / detection engine.

Consumes a DataFrame of synthetic environmental readings:
    timestamp, location, noise_db, motion   (required)
    vape_index                              (optional, display-only)

and produces a single explainable status for the replay window:
    {
        "status": "NORMAL" | "POSSIBLE_ALTERCATION" | "POSSIBLE_DISTRESS" | "DATA_UNAVAILABLE",
        "risk_score": int,        # heuristic prototype score, NOT a calibrated probability
        "location": str,
        "reasons": list[str],
        "recommended_action": str,
    }

IMPORTANT: vape_index is never read by this module. It is optional environmental
context only and must not influence altercation/distress detection (PRD section 6/8, S5).
"""

import pandas as pd

REQUIRED_COLUMNS = ["timestamp", "location", "noise_db", "motion"]

# --- Prototype heuristic thresholds (not validated safety thresholds) ---
ALTERCATION_NOISE_THRESHOLD_DB = 85
ALTERCATION_BASELINE_OFFSET_DB = 20
ALTERCATION_WINDOW_SIZE = 3
ALTERCATION_MIN_HITS_IN_WINDOW = 2

DISTRESS_SPIKE_THRESHOLD_DB = 90
DISTRESS_INACTIVITY_SECONDS = 20

QUIET_BASELINE_MAX_DB = 70
DEFAULT_SAMPLE_INTERVAL_SECONDS = 5

ALTERCATION_RISK_SCORE = 80
DISTRESS_RISK_SCORE = 90
NORMAL_RISK_SCORE = 0
DATA_UNAVAILABLE_RISK_SCORE = 0


def analyze(df):
    """Fuse noise + motion metadata into a single explainable safety status."""
    location = _extract_location(df)

    data_issues = _validate_required_data(df)
    if data_issues:
        return _data_unavailable_result(location, data_issues)

    working = df.copy().reset_index(drop=True)
    working["noise_db"] = pd.to_numeric(working["noise_db"], errors="coerce")
    working["motion"] = pd.to_numeric(working["motion"], errors="coerce")

    sample_interval_seconds = _infer_sample_interval_seconds(working)
    quiet_baseline_db = _quiet_baseline(working["noise_db"])

    # Precedence: if a distress pattern is present (even after an altercation-like
    # period), report POSSIBLE_DISTRESS rather than two simultaneous primary alerts.
    if _has_distress_pattern(working, sample_interval_seconds):
        return _distress_result(location)

    if _has_altercation_pattern(working, quiet_baseline_db):
        return _altercation_result(location)

    return _normal_result(location)


def _extract_location(df):
    if "location" in df.columns:
        values = df["location"].dropna()
        if len(values) > 0:
            return str(values.iloc[-1])
    return "Unknown location"


def _validate_required_data(df):
    """Return a list of human-readable data problems, or [] if the feed is usable."""
    issues = []

    for column in REQUIRED_COLUMNS:
        if column not in df.columns:
            issues.append(f"Required sensor field '{column}' is missing from the feed.")

    if issues:
        return issues

    if len(df) == 0:
        issues.append("No sensor readings were received.")
        return issues

    noise = pd.to_numeric(df["noise_db"], errors="coerce")
    motion = pd.to_numeric(df["motion"], errors="coerce")

    if noise.isna().any():
        issues.append("One or more noise_db readings are missing or invalid.")
    if motion.isna().any():
        issues.append("One or more motion readings are missing or invalid.")

    return issues


def _infer_sample_interval_seconds(df):
    try:
        timestamps = pd.to_datetime(df["timestamp"], format="%H:%M:%S")
        deltas = timestamps.diff().dropna().dt.total_seconds()
        positive_deltas = deltas[deltas > 0]
        if len(positive_deltas) > 0:
            return float(positive_deltas.median())
    except (ValueError, TypeError):
        pass
    return DEFAULT_SAMPLE_INTERVAL_SECONDS


def _quiet_baseline(noise_series):
    """Approximate the recent 'quiet room' noise floor used as the altercation baseline."""
    quiet_values = noise_series[noise_series < QUIET_BASELINE_MAX_DB]
    if len(quiet_values) > 0:
        return float(quiet_values.mean())
    return float(noise_series.min())


def _has_altercation_pattern(df, quiet_baseline_db):
    """
    POSSIBLE_ALTERCATION rule:
    At least 2 of the last 3 samples have noise >= 85 dB AND motion == 1,
    with the current sample's noise at least 20 dB above the quiet baseline.
    """
    noise = df["noise_db"]
    motion = df["motion"]
    hot = (noise >= ALTERCATION_NOISE_THRESHOLD_DB) & (motion == 1)

    for i in range(len(df)):
        window_start = max(0, i - (ALTERCATION_WINDOW_SIZE - 1))
        window_hits = hot.iloc[window_start:i + 1].sum()
        if (
            window_hits >= ALTERCATION_MIN_HITS_IN_WINDOW
            and hot.iloc[i]
            and noise.iloc[i] >= quiet_baseline_db + ALTERCATION_BASELINE_OFFSET_DB
        ):
            return True
    return False


def _has_distress_pattern(df, sample_interval_seconds):
    """
    POSSIBLE_DISTRESS rule:
    A noise spike >= 90 dB occurs while/just after motion is present, then motion
    stays at 0 continuously for at least 20 seconds.
    """
    noise = df["noise_db"]
    motion = df["motion"]

    spike_indices = df.index[noise >= DISTRESS_SPIKE_THRESHOLD_DB].tolist()
    for idx in spike_indices:
        recent_motion_present = motion.iloc[max(0, idx - 1):idx + 1].eq(1).any()
        if not recent_motion_present:
            continue

        consecutive_quiet_samples = 0
        j = idx + 1
        while j < len(df) and motion.iloc[j] == 0:
            consecutive_quiet_samples += 1
            j += 1

        inactivity_seconds = consecutive_quiet_samples * sample_interval_seconds
        if inactivity_seconds >= DISTRESS_INACTIVITY_SECONDS:
            return True
    return False


def _altercation_result(location):
    return {
        "status": "POSSIBLE_ALTERCATION",
        "risk_score": ALTERCATION_RISK_SCORE,
        "location": location,
        "reasons": [
            "Noise exceeded 85 dB for at least 2 of the last 3 readings",
            "Noise is at least 20 dB above the recent quiet baseline",
            "Continuous motion detected during the noise elevation",
        ],
        "recommended_action": f"Security welfare check recommended at {location}.",
    }


def _distress_result(location):
    return {
        "status": "POSSIBLE_DISTRESS",
        "risk_score": DISTRESS_RISK_SCORE,
        "location": location,
        "reasons": [
            "Sudden acoustic spike detected (>= 90 dB)",
            "Motion stopped immediately afterward",
            "No motion detected for at least 20 seconds",
        ],
        "recommended_action": f"Immediate welfare check recommended at {location}.",
    }


def _normal_result(location):
    return {
        "status": "NORMAL",
        "risk_score": NORMAL_RISK_SCORE,
        "location": location,
        "reasons": [
            "No sustained high-noise-with-motion or spike-then-inactivity pattern detected.",
        ],
        "recommended_action": "No security intervention required.",
    }


def _data_unavailable_result(location, issues):
    return {
        "status": "DATA_UNAVAILABLE",
        "risk_score": DATA_UNAVAILABLE_RISK_SCORE,
        "location": location,
        "reasons": issues,
        "recommended_action": (
            "Do not infer a safety incident. Check sensor connectivity and the "
            "data feed before relying on this reading."
        ),
    }
