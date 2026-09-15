# Privacy-First Campus Safety

Environmental anomaly detection for camera-restricted spaces (e.g. washrooms).
Uses synthetic noise/motion/vape sensor data instead of cameras or audio recordings
to flag possible altercations or medical/personal distress events.

## How it works

1. `src/scenarios.py` loads one of six synthetic sensor scenarios as a pandas DataFrame.
2. `src/replay.py` calls `src/detector.py` on each prefix of the readings. Future readings are never included in an earlier assessment.
3. `app.py` serves a custom HTML/CSS/JavaScript dashboard and a JSON API. The frontend renders sensor timelines and explainable assessments without a frontend build step.

## Setup

```bash
pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:8000 in your browser. Use `python app.py --port 8001` to choose another port. The server binds to localhost and is intended for the local synthetic demo.

## Usage

Select a scenario, then click **Run simulation**. Readings appear sequentially, with the corresponding Python-engine assessment. The default 5× replay shows five seconds of sensor time per second; 1× and 10× are also available. Use **Pause / Resume**, **Restart simulation**, or **Reset demo** to control playback. Selecting another scenario cancels the current run.

- **Normal Activity** → expected result: `NORMAL`
- **Possible altercation** → expected result: `POSSIBLE_ALTERCATION`
- **Possible distress** → expected result: `POSSIBLE_DISTRESS`
- **Reset demo** → clears the current alert and returns to a clean idle state

An "Additional test scenarios" expander exposes three optional negative-control
scenarios from the PRD test plan:

- **Benign Loud Event** → expected result: `NORMAL` (single spike, no sustained pattern)
- **Vape-Only Reading** → expected result: `NORMAL` (high vape index never affects risk)
- **Missing Sensor Data** → expected result: `DATA_UNAVAILABLE` (fails safe, no incident inferred)

Each scenario shows the latest sensor readings (location, time, noise, motion, vape
index), a noise-over-time line chart, a motion bar chart, and the detector's
heuristic risk assessment with reasons and a recommended action. The detection-engine strip and event trail show progress. **Acknowledge for review** records an operator action in the current browser run only; it does not dispatch responders, send notifications, or persist after reset/reload.

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
├── app.py                    # Local HTTP server + scenario API
├── web/
│   ├── index.html            # Accessible dashboard structure
│   ├── styles.css            # Responsive layout and design tokens
│   └── app.js                # Scenario controls, charts, assessments
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
│   ├── replay.py             # assessments using only each reading prefix
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

## Frontend provenance

The event trail adapts the timestamp, status badge, and vertical connector pattern from
[Incident Status Timeline by cnippet-dev](https://21st.dev/@cnippet-dev/components/incident-status-timeline),
retrieved through the official 21st.dev MCP. It uses the existing vanilla frontend;
no React dependencies or API keys are shipped to the browser.

## Detection concept (not implemented)

A future acoustic pipeline could compute short-time Fourier transforms on-device
and extract frequency-band energy, duration, and repeated-impact features. This
requires access to waveform samples: the current five-second dB summaries cannot
recover the original sound spectrum. Avoiding stored audio would require deliberate
on-device processing and discarding the temporary waveform.

Spectral features could help distinguish types of acoustic events, but cannot by
themselves establish bullying, intent, or whether someone is being harmed. Such a
system would need representative labeled examples, testing against benign events,
and measured false-positive and missed-event rates. Human review remains necessary.
The current engine uses only the existing noise/motion rules. No FFT, audio analysis,
or bullying classifier is implemented.

## Verification

```bash
python -m unittest discover -s tests -v
node --check web/app.js
```
