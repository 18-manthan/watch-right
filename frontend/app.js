// ==============================
// Global State
// ==============================

let sessionId = null;
let interviewActive = false;
let API_BASE = "http://127.0.0.1:8000/api/v1";

let faceMissingSince = null;

// ==============================
// Session APIs
// ==============================

async function createSession() {
  const res = await fetch(`${API_BASE}/sessions`, { method: "POST" });
  const data = await res.json();

  console.log("Session created:", data);

  sessionId = data.session_id;
  document.getElementById("sessionId").innerText = sessionId;
  document.getElementById("status").innerText = data.status;
}

async function startSession() {
  if (!sessionId) {
    alert("Create session first");
    return;
  }

  const res = await fetch(`${API_BASE}/sessions/${sessionId}/start`, {
    method: "POST",
  });

  const data = await res.json();
  document.getElementById("status").innerText = data.status;

  interviewActive = true;

  enableSystemMonitoring();
  startCamera();
}

// ==============================
// Camera + Face Detection
// ==============================

async function startCamera() {
  const video = document.getElementById("video");

  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;

  startFaceDetection(video);
}

// 🔹 Persistent state (outside callback)
let faceMissingFrames = 0;
const FACE_MISSING_FRAME_THRESHOLD = 20; // ~0.6–0.8 sec

function startFaceDetection(video) {
  const detector = new FaceDetection({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`,
  });

  detector.setOptions({
    model: "short",
    minDetectionConfidence: 0.7, // slightly stricter = better accuracy
  });

  detector.onResults((results) => {
    if (!interviewActive) return;

    const detections = results.detections || [];

    // --------------------
    // FACE MISSING (fast + stable)
    // --------------------
    if (detections.length === 0) {
      faceMissingFrames++;

      if (faceMissingFrames >= FACE_MISSING_FRAME_THRESHOLD) {
        sendEvent("FACE_MISSING", "HIGH");
        faceMissingFrames = 0; // reset to avoid spam
      }
    } else {
      faceMissingFrames = 0;

      // --------------------
      // MULTIPLE FACES
      // --------------------
      if (detections.length > 1) {
        sendEvent("MULTIPLE_FACES", "HIGH");
      }
    }
  });

  const camera = new Camera(video, {
    onFrame: async () => {
      await detector.send({ image: video });
    },
    width: 640,
    height: 480,
  });

  camera.start();
}




// ==============================
// System / Browser Monitoring
// ==============================

function enableSystemMonitoring() {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      sendEvent("TAB_SWITCH", "MEDIUM");
    }
  });

  window.addEventListener("blur", () => {
    sendEvent("WINDOW_BLUR", "LOW");
  });

  window.addEventListener("focus", () => {
    sendEvent("WINDOW_FOCUS", "LOW");
  });
}

// ==============================
// Event Sender
// ==============================

async function sendEvent(eventType, severity) {
  if (!sessionId || !interviewActive) return;

  try {
    await fetch(`${API_BASE}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        event_type: eventType,
        severity: severity,
        confidence: null,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error("Event send failed:", err);
  }
}
