# Privacy-First Campus Safety

Environmental anomaly detection for camera-restricted spaces (e.g. washrooms).
Uses synthetic noise/motion/vape sensor data instead of cameras or audio recordings
to flag possible altercations or medical/personal distress events.

## How it works

1. `src/scenarios.py` loads one of three synthetic sensor scenarios as a pandas DataFrame.
2. `src/detector.py` analyzes the DataFrame and returns a structured risk assessment.
3. `app.py` is a Streamlit dashboard that ties the two together and displays the result.

## Setup

```bash
pip install -r requirements.txt
streamlit run app.py
```

## Usage

Click one of the three primary buttons to simulate a scenario:

- **Normal Activity** → expected result: `NORMAL`
- **Simulate Altercation** → expected result: `POSSIBLE_ALTERCATION`
- **Simulate Distress** → expected result: `POSSIBLE_DISTRESS`
- **Reset** → clears the current alert and returns to a clean idle state

An "Additional test scenarios" expander exposes three optional negative-control
scenarios from the PRD test plan:

- **Benign Loud Event** → expected result: `NORMAL` (single spike, no sustained pattern)
- **Vape-Only Reading** → expected result: `NORMAL` (high vape index never affects risk)
- **Missing Sensor Data** → expected result: `DATA_UNAVAILABLE` (fails safe, no incident inferred)

Each scenario shows the latest sensor readings (location, time, noise, motion, vape
index), a noise-over-time line chart, a motion bar chart, and the detector's
heuristic risk assessment with reasons and a recommended action.

## Detection logic (heuristic, not a calibrated probability)

- **POSSIBLE_ALTERCATION**: at least 2 of the last 3 readings have noise >= 85 dB
  AND motion = 1, with the current reading at least 20 dB above the recent quiet
  baseline. Risk score 80.
- **POSSIBLE_DISTRESS**: a noise spike >= 90 dB occurs while motion is present,
  then motion stays at 0 continuously for at least 20 seconds. Risk score 90.
  Takes precedence over an altercation reading in the same window.
- **DATA_UNAVAILABLE**: a required field (`timestamp`, `location`, `noise_db`,
  `motion`) is missing or invalid. The app fails safe instead of guessing.
- `vape_index` is optional, display-only context and is never used by the
  detector to score altercation/distress risk.

## Project structure

```
campus-safety/
├── app.py                    # Dashboard + integration
├── requirements.txt
├── data/
│   ├── normal.csv
│   ├── altercation.csv
│   ├── distress.csv
│   ├── benign_loud.csv       # optional test scenario (S2)
│   ├── vape_only.csv         # optional test scenario (S5)
│   └── missing_data.csv      # optional test scenario (S6)
├── src/
│   ├── scenarios.py          # load_scenario(name) -> DataFrame
│   └── detector.py           # analyze(df) -> result dict
└── README.md
```

## Privacy by design

- No cameras
- No facial recognition
- No identities
- No raw audio stored
- Environmental metadata only
- Synthetic / test data only

## Out of scope (per PRD)

No real Verkada API/hardware integration, no raw audio or video processing, no
ML training or calibrated probability claims, no autonomous dispatch/locking
actions, and no auth, database, or notification infrastructure. This is a
single-page synthetic-data MVP intended for a 60-90 second demo.
