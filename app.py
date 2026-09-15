import pandas as pd
import streamlit as st

from src.scenarios import load_scenario
from src.detector import analyze

st.set_page_config(page_title="Privacy-First Campus Safety", layout="centered")

st.title("PRIVACY-FIRST CAMPUS SAFETY")
st.caption("Environmental anomaly detection for camera-restricted spaces")
st.caption("🧪 SYNTHETIC DEMO — every reading below is synthetic/test data, not a real event.")


def _reset_state():
    st.session_state.scenario_name = None
    st.session_state.df = None
    st.session_state.result = None


if "scenario_name" not in st.session_state:
    _reset_state()


def _run_scenario(name):
    st.session_state.scenario_name = name
    st.session_state.df = load_scenario(name)
    st.session_state.result = analyze(st.session_state.df)


st.subheader("Scenario controls")
col1, col2, col3, col4 = st.columns(4)

with col1:
    if st.button("Normal Activity", use_container_width=True):
        _run_scenario("normal")

with col2:
    if st.button("Simulate Altercation", use_container_width=True):
        _run_scenario("altercation")

with col3:
    if st.button("Simulate Distress", use_container_width=True):
        _run_scenario("distress")

with col4:
    if st.button("Reset", use_container_width=True):
        _reset_state()

with st.expander("Additional test scenarios (optional)"):
    opt_col1, opt_col2, opt_col3 = st.columns(3)
    with opt_col1:
        if st.button("Benign Loud Event", use_container_width=True):
            _run_scenario("benign_loud")
    with opt_col2:
        if st.button("Vape-Only Reading", use_container_width=True):
            _run_scenario("vape_only")
    with opt_col3:
        if st.button("Missing Sensor Data", use_container_width=True):
            _run_scenario("missing_data")

df = st.session_state.df
result = st.session_state.result


def _fmt(value, suffix=""):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return "N/A"
    return f"{value}{suffix}"


if df is not None and result is not None:
    st.divider()
    st.subheader("Current signals")

    latest = df.iloc[-1]
    motion_value = latest.get("motion")
    motion_label = "N/A"
    if pd.notna(motion_value):
        motion_label = "Detected" if int(motion_value) == 1 else "None"

    vape_value = latest.get("vape_index") if "vape_index" in df.columns else None

    metric_col1, metric_col2, metric_col3, metric_col4, metric_col5 = st.columns(5)
    metric_col1.metric("Location", result.get("location", "Unknown"))
    metric_col2.metric("Time", _fmt(latest.get("timestamp")))
    metric_col3.metric("Noise", _fmt(latest.get("noise_db"), " dB"))
    metric_col4.metric("Motion", motion_label)
    metric_col5.metric("Vape Index", _fmt(vape_value))

    if "noise_db" in df.columns and df["noise_db"].notna().any():
        st.line_chart(df.set_index("timestamp")["noise_db"])
    if "motion" in df.columns and df["motion"].notna().any():
        st.caption("Motion (1 = detected, 0 = none)")
        st.bar_chart(df.set_index("timestamp")["motion"])

    status = result.get("status")
    risk_score = result.get("risk_score")
    reasons = result.get("reasons", [])
    recommended_action = result.get("recommended_action", "")

    st.divider()
    st.subheader("Alert")

    if status == "NORMAL":
        st.success("✓ NORMAL")
        st.write("No security intervention required.")
    elif status == "DATA_UNAVAILABLE":
        st.warning("⚠ DATA UNAVAILABLE")
        st.write("Required sensor reading is missing or invalid. No safety status is inferred.")
        st.write("**Sensor issue detail**")
        for reason in reasons:
            st.write(f"- {reason}")
    else:
        if status == "POSSIBLE_ALTERCATION":
            st.error("🚨 POSSIBLE ALTERCATION")
        elif status == "POSSIBLE_DISTRESS":
            st.error("🚨 POSSIBLE DISTRESS")
        else:
            st.warning(f"Status: {status}")

        st.write(f"**Heuristic Risk Score:** {risk_score} / 100")
        st.caption("Prototype heuristic — not a calibrated probability or confidence value.")

        st.write("**Why this fired**")
        for reason in reasons:
            st.write(f"- {reason}")

        st.write("**Recommended Action**")
        st.write(recommended_action)

st.divider()
st.subheader("PRIVACY BY DESIGN")
st.write("✓ No cameras")
st.write("✓ No facial recognition")
st.write("✓ No identities")
st.write("✓ No raw audio stored")
st.write("✓ Environmental metadata only")
st.write("✓ Synthetic / test data only")
