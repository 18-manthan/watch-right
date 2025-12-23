def build_final_report(raw_report: dict) -> dict:
    counts = raw_report.get("event_counts", {})

    face_missing = counts.get("face_missing_count", 0)
    tab_switch = counts.get("tab_switch_count", 0)
    window_blur = counts.get("window_blur_count", 0)

    # MULTIPLE_FACES is a boolean signal
    multiple_faces_detected = any(
        r["event_type"] == "MULTIPLE_FACES"
        for r in raw_report.get("reasons", [])
    )

    # Movement Percentage Logic
    movement_score = (
        face_missing * 3 +
        tab_switch * 2 +
        window_blur * 1
    )

    MAX_EXPECTED_SCORE = 30
    movement_percentage = min(
        100,
        int((movement_score / MAX_EXPECTED_SCORE) * 100)
    )

    # Interpretation (Static)
    interpretation = {}

    if face_missing > 0:
        interpretation["face_presence"] = (
            f"Candidate left the camera frame {face_missing} times"
        )

    if tab_switch > 0:
        interpretation["tab_behavior"] = (
            f"Tab switching observed {tab_switch} times"
        )

    if window_blur > 0:
        interpretation["focus_behavior"] = (
            f"Window focus was lost {window_blur} times"
        )

    if multiple_faces_detected:
        interpretation["external_presence"] = (
            "More than one face was detected during the interview"
        )

    return {
        "session_id": raw_report["session_id"],

        "summary": {
            "risk_score": raw_report["risk_score"],
            "risk_level": raw_report["risk_level"],
            "movement_percentage": movement_percentage,
        },

        "behavior_counts": {
            "face_missing": face_missing,
            "tab_switch": tab_switch,
            "window_blur": window_blur,
            "multiple_faces_detected": multiple_faces_detected,
        },

        "interpretation": interpretation,

        "ai_note": (
            "This report summarizes observed candidate behavior during the interview. "
            "AI provides behavioral indicators only."
        ),

        "final_decision_note": (
            "Final interview decisions should always be made by the interviewer."
        ),
    }
