let authFaceMeshActive = false;
let interviewFaceMeshActive = false;

// ==============================
// Global State
// ==============================
console.log("app.js LOADED");

let sessionId = null;
let interviewActive = false;
const API_BASE = "http://127.0.0.1:8000/api/v1";

// Face monitoring
let faceMissingFrames = 0;
let faceMismatchFrames = 0;
let baselineFaceLandmarks = null;

// Thresholds
const FACE_MISSING_FRAME_THRESHOLD = 20; // ~0.6s
const AUTH_REQUIRED_FRAMES = 30;          // ~1s
const FACE_MISMATCH_THRESHOLD = 0.06;
const FACE_MISMATCH_FRAME_COUNT = 10;

// ==============================
// Session APIs
// ==============================

async function createSession() {
  const res = await fetch(`${API_BASE}/sessions`, { method: "POST" });
  const data = await res.json();

  sessionId = data.session_id;
  document.getElementById("sessionId").innerText = sessionId;
  document.getElementById("status").innerText = data.status;

  // 🔐 Authentication Gate
  await startAuthGate();
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
// Camera + FaceMesh (Interview)
// ==============================

async function startCamera() {
  const video = document.getElementById("video");

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720 }
  });

  video.srcObject = stream;
  startFaceMesh(video);
}

function startFaceMesh(video) {
  const faceMesh = new FaceMesh({
    locateFile: f =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`,
  });

  faceMesh.setOptions({
    maxNumFaces: 2,
    refineLandmarks: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  faceMesh.onResults(results => {
    if (!interviewActive) return;

    const faces = results.multiFaceLandmarks || [];

    // ---------- FACE MISSING ----------
    if (faces.length === 0) {
      faceMissingFrames++;
      if (faceMissingFrames >= FACE_MISSING_FRAME_THRESHOLD) {
        sendEvent("FACE_MISSING", "HIGH");
        faceMissingFrames = 0;
      }
      return;
    }

    faceMissingFrames = 0;

    // ---------- MULTIPLE FACES ----------
    if (faces.length > 1) {
      sendEvent("MULTIPLE_FACES", "HIGH");
      return;
    }

    // ---------- FACE CONSISTENCY ----------
    if (baselineFaceLandmarks) {
      const current = normalizeLandmarks(faces[0]);
      const baseline = normalizeLandmarks(baselineFaceLandmarks);

      const diff = faceDifferenceScore(current, baseline);

      if (diff > FACE_MISMATCH_THRESHOLD) {
        faceMismatchFrames++;
        if (faceMismatchFrames >= FACE_MISMATCH_FRAME_COUNT) {
          sendEvent("FACE_MISMATCH", "HIGH");
          faceMismatchFrames = 0;
        }
      } else {
        faceMismatchFrames = 0;
      }
    }
  });

  authFaceMeshActive = true;

  const camera = new Camera(video, {
    onFrame: async () => {
      if (!authFaceMeshActive) return;
      await faceMesh.send({ image: video });
    },
  });


  camera.start();
}

// ==============================
// Authentication Gate
// ==============================

function captureSnapshot(video) {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.9);
}

function startAuthGate() {
  return new Promise(async (resolve) => {
    const overlay = document.getElementById("auth-gate");
    const video = document.getElementById("auth-video");
    const status = document.getElementById("auth-status");
    const btn = document.getElementById("auth-confirm");

    overlay.style.display = "flex";
    btn.disabled = true;
    btn.innerText = "Verification Required";

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;

    let stableFrames = 0;
    let authSnapshot = null;

    const faceMesh = new FaceMesh({
      locateFile: f =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 2,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMesh.onResults(results => {
      const faces = results.multiFaceLandmarks || [];

      if (faces.length === 1) {
        stableFrames++;
        status.innerText = "Face detected. Hold still…";

        if (stableFrames >= AUTH_REQUIRED_FRAMES && !authSnapshot) {
          authSnapshot = captureSnapshot(video);
          baselineFaceLandmarks = faces[0];

          status.innerText = "Verification successful";
          btn.disabled = false;
          btn.innerText = "Continue";
        }
      } else {
        stableFrames = 0;
        authSnapshot = null;
        status.innerText =
          faces.length === 0 ? "No face detected" : "Multiple faces detected";
      }
    });
    interviewFaceMeshActive = true;

    const camera = new Camera(video, {
      onFrame: async () => {
        if (!interviewFaceMeshActive) return;
        await faceMesh.send({ image: video });
      },
    });

    camera.start();

    btn.onclick = async () => {
      if (!authSnapshot) return;
      authFaceMeshActive = false;   //  stop send()
      camera.stop();

      setTimeout(() => {
        faceMesh.close();          //  safe now
      }, 0);

      stream.getTracks().forEach(t => t.stop());

      overlay.style.display = "none";

      await fetch(`${API_BASE}/sessions/${sessionId}/auth-snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: authSnapshot }),
      });

      resolve();
    };
  });
}

// ==============================
// Face Utils
// ==============================

function normalizeLandmarks(landmarks) {
  const ref = landmarks[1]; // nose
  return landmarks.map(p => ({
    x: p.x - ref.x,
    y: p.y - ref.y,
    z: p.z - ref.z
  }));
}

function faceDifferenceScore(a, b) {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const dx = a[i].x - b[i].x;
    const dy = a[i].y - b[i].y;
    const dz = a[i].z - b[i].z;
    sum += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return sum / len;
}

// ==============================
// System Monitoring
// ==============================

function enableSystemMonitoring() {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) sendEvent("TAB_SWITCH", "MEDIUM");
  });

  window.addEventListener("blur", () => {
    sendEvent("WINDOW_BLUR", "LOW");
  });
}

// ==============================
// Events + Alerts
// ==============================

const EVENT_MESSAGES = {
  FACE_MISSING: "Face not detected. Please stay in front of the camera.",
  MULTIPLE_FACES: "Multiple faces detected. Only one person should be visible.",
  FACE_MISMATCH: "PLEASE FOCUS ON THE SCREEN CENTER!!!",
  TAB_SWITCH: "Tab switching detected.",
  WINDOW_BLUR: "Interview window lost focus.",
};


const EVENT_SEVERITY = {
  FACE_MISSING: "high",
  MULTIPLE_FACES: "high",
  FACE_MISMATCH: "high",
  TAB_SWITCH: "medium",
  WINDOW_BLUR: "low",
};

async function sendEvent(eventType, severity) {
  showAlert(eventType);

  if (!sessionId || !interviewActive) return;

  await fetch(`${API_BASE}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      event_type: eventType,
      severity,
      timestamp: new Date().toISOString(),
    }),
  });
}

function showAlert(eventType) {
  const container = document.getElementById("alert-container");
  if (!container) return;

  const alert = document.createElement("div");
  alert.className = `alert ${EVENT_SEVERITY[eventType] || "low"}`;
  alert.innerText = EVENT_MESSAGES[eventType] || eventType;

  container.appendChild(alert);
  setTimeout(() => alert.remove(), 4000);
}
