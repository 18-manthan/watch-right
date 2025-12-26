console.log("app.js LOADED");

let sessionId = null;
let interviewActive = false;
const API_BASE = "http://127.0.0.1:8000/api/v1";

// Face state
let faceMissingFrames = 0;
let faceMismatchFrames = 0;
let baselineFaceLandmarks = null;

// MediaPipe lifecycle guards
let authFaceMeshActive = false;
let interviewFaceMeshActive = false;

// Screen recording
let screenRecorder = null;
let screenStream = null;
let micStream = null;
let screenChunks = [];

// Thresholds
const FACE_MISSING_FRAME_THRESHOLD = 20;
const AUTH_REQUIRED_FRAMES = 30;
const FACE_MISMATCH_THRESHOLD = 0.035;
const FACE_MISMATCH_FRAME_COUNT = 3.4;

// ==============================
// Session APIs
// ==============================
async function createSession() {
  const res = await fetch(`${API_BASE}/sessions`, { method: "POST" });
  const data = await res.json();

  sessionId = data.session_id;
  document.getElementById("sessionId").innerText = sessionId;
  document.getElementById("status").innerText = data.status;

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

  document.getElementById("setupControls").style.display = "none";
  document.getElementById("interviewStarted").style.display = "flex";
  document.getElementById("interviewControls").style.display = "flex";

  enableSystemMonitoring();
  startCamera();

  // Enable interview buttons
  document.getElementById("screenBtn").disabled = false;
  document.getElementById("endBtn").disabled = false;
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
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  interviewFaceMeshActive = true;

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

  const camera = new Camera(video, {
    onFrame: async () => {
      if (!interviewFaceMeshActive) return;
      await faceMesh.send({ image: video });
    },
    width: 1280,
    height: 720,
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

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;

    let stableFrames = 0;
    let snapshot = null;

    const faceMesh = new FaceMesh({
      locateFile: f =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 2,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    authFaceMeshActive = true;

    faceMesh.onResults(results => {
      if (!authFaceMeshActive) return;

      const faces = results.multiFaceLandmarks || [];

      if (faces.length === 1) {
        stableFrames++;
        status.innerText = "Face detected.";

        if (stableFrames >= AUTH_REQUIRED_FRAMES && !snapshot) {
          snapshot = captureSnapshot(video);
          baselineFaceLandmarks = faces[0];
          btn.disabled = false;
          status.innerText = "Verified";
        }
      } else {
        stableFrames = 0;
        snapshot = null;
        status.innerText =
          faces.length === 0 ? "No face detected" : "Multiple faces detected";
      }
    });

    const camera = new Camera(video, {
      onFrame: async () => {
        if (!authFaceMeshActive) return;
        await faceMesh.send({ image: video });
      },
    });

    camera.start();

    btn.onclick = async () => {
      authFaceMeshActive = false;
      camera.stop();
      setTimeout(() => faceMesh.close(), 0);
      stream.getTracks().forEach(t => t.stop());
      overlay.style.display = "none";

      await fetch(`${API_BASE}/sessions/${sessionId}/auth-snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: snapshot }),
      });

      resolve();
    };
  });
}

// ==============================
// Screen Recording (Screen + Mic)
// ==============================
async function startScreenRecording() {
  try {
    // Screen (video only)
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 15 },
      audio: false
    });

    // Mic
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Merge audio
    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    audioContext.createMediaStreamSource(micStream).connect(destination);

    const combinedStream = new MediaStream([
      ...screenStream.getVideoTracks(),
      ...destination.stream.getAudioTracks()
    ]);

    screenRecorder = new MediaRecorder(combinedStream, {
      mimeType: "video/webm;codecs=vp8,opus"
    });

    screenChunks = [];

    screenRecorder.ondataavailable = e => {
      if (e.data.size > 0) screenChunks.push(e.data);
    };

    screenRecorder.onstop = handleScreenRecordingStop;

    screenStream.getVideoTracks()[0].onended = () => {
      sendEvent("SCREEN_SHARE_STOPPED", "HIGH");
      stopScreenRecording();
    };

    screenRecorder.start();
    sendEvent("SCREEN_RECORDING_STARTED", "LOW");

  } catch (err) {
    console.error(err);
    sendEvent("SCREEN_RECORDING_FAILED", "HIGH");
  }
}

function stopScreenRecording() {
  if (screenRecorder && screenRecorder.state !== "inactive") {
    screenRecorder.stop();
  }
  screenStream?.getTracks().forEach(t => t.stop());
  micStream?.getTracks().forEach(t => t.stop());
}

async function handleScreenRecordingStop() {
  if (!screenChunks.length) return;

  try {
    const blob = new Blob(screenChunks, { type: "video/webm" });
    const formData = new FormData();
    formData.append("file", blob, `${sessionId}.webm`);

    await fetch(`${API_BASE}/sessions/${sessionId}/screen-recording`, {
      method: "POST",
      body: formData,
    });

    sendEvent("SCREEN_RECORDING_SAVED", "LOW");

  } catch {
    sendEvent("SCREEN_RECORDING_UPLOAD_FAILED", "HIGH");
  }
}

// ==============================
// End Interview
// ==============================
function endInterview() {
  interviewActive = false;
  interviewFaceMeshActive = false;
  stopScreenRecording();
  sendEvent("INTERVIEW_ENDED", "LOW");
}

// ==============================
// Utils
// ==============================
function normalizeLandmarks(landmarks) {
  const ref = landmarks[1];
  return landmarks.map(p => ({
    x: p.x - ref.x,
    y: p.y - ref.y,
    z: p.z - ref.z
  }));
}

function faceDifferenceScore(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const dx = a[i].x - b[i].x;
    const dy = a[i].y - b[i].y;
    const dz = a[i].z - b[i].z;
    sum += Math.sqrt(dx*dx + dy*dy + dz*dz);
  }
  return sum / a.length;
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
  SCREEN_RECORDING_STARTED: "Screen recording started.",
  SCREEN_SHARE_STOPPED: "Screen sharing stopped.",
  SCREEN_RECORDING_SAVED: "Recording saved.",
  SCREEN_RECORDING_FAILED: "Recording failed.",
  SCREEN_RECORDING_UPLOAD_FAILED: "Upload failed."
};

const EVENT_SEVERITY = {
  FACE_MISSING: "high",
  MULTIPLE_FACES: "high",
  FACE_MISMATCH: "high",
  TAB_SWITCH: "medium",
  WINDOW_BLUR: "low",
  SCREEN_RECORDING_STARTED: "low",
  SCREEN_RECORDING_SAVED: "low",
  SCREEN_SHARE_STOPPED: "high",
  SCREEN_RECORDING_FAILED: "high",
  SCREEN_RECORDING_UPLOAD_FAILED: "high"
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
  const c = document.getElementById("alert-container");
  if (!c) return;
  const a = document.createElement("div");
  a.className = `alert ${EVENT_SEVERITY[eventType] || "low"}`;
  a.innerText = EVENT_MESSAGES[eventType] || eventType;
  c.appendChild(a);
  setTimeout(() => a.remove(), 4000);
}

async function exitInterview() {
  const confirmExit = confirm(
    "Are you sure you want to exit the interview?\nYour session will be ended."
  );

  if (!confirmExit) return;

  // Stop monitoring
  interviewActive = false;
  interviewFaceMeshActive = false;

  // Stop screen recording safely
  stopScreenRecording();

  // Fire event
  sendEvent("INTERVIEW_EXITED", "HIGH");

  // End session on backend
  try {
    await fetch(`${API_BASE}/sessions/${sessionId}/end`, {
      method: "POST",
    });
  } catch (e) {
    console.warn("Session end failed:", e);
  }

  setTimeout(() => {
   window.location.href = "end.html"; 
  }, 500);
}
