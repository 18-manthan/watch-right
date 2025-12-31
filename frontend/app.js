console.log("app.js LOADED------------------------------------>");
let fullscreenExitCount = 0;
let fullscreenEnforcementEnabled = false;
const MAX_FULLSCREEN_EXITS = 5;

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
const FACE_MISSING_FRAME_THRESHOLD = 40;
const AUTH_REQUIRED_FRAMES = 55;
const FACE_MISMATCH_THRESHOLD = 0.065;
const FACE_MISMATCH_FRAME_COUNT = 10;


// Head Movement State
let headTurnFrames = 0;
const HEAD_TURN_THRESHOLD = 0.35;
const HEAD_TURN_FRAME_COUNT = 4;


// Eye Tracking State
let eyeOffCenterFrames = 0;
let eyeClosedFrames = 0;

let baselineEyeOffset = null;
let eyeDeviationFrames = 0;

const EYE_RELATIVE_THRESHOLD = 0.03;   // VERY SENSITIVE
const EYE_RELATIVE_FRAME_COUNT = 6;


// Eye landmark indices (MediaPipe)
const LEFT_EYE = [33, 133];
const RIGHT_EYE = [362, 263];
const LEFT_IRIS = [468];
const RIGHT_IRIS = [473];
function enterFullscreen() {
  const elem = document.documentElement;

  if (!document.fullscreenElement) {
    elem.requestFullscreen().then(() => {
      setTimeout(() => logFullscreenStatus("after enterFullscreen"), 200);
    }).catch(err => {
      console.error("Fullscreen failed:", err);
    });
  }
}


function exitFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  }
}



// Session APIs
async function createSession() {

  enterFullscreen();

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

  if (!document.fullscreenElement) {
    alert("Interview must be started in fullscreen mode.");
    return;
  }

  fullscreenExitCount = 0;
  fullscreenEnforcementEnabled = true;

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
    refineLandmarks: true,   // REQUIRED for eyes
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

    // ---------- EYE MOVEMENT ----------
    try {
      processEyeMovement(faces[0]);
      processHeadMovement(faces[0]);
    } catch (e) {
      console.error("Eye detection error:", e);
    }
    //  SANITY TEST — ADD ONLY TEMPORARILY
    // sendEvent("EYE_LOOKING_AWAY", "LOW");
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
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });


    authFaceMeshActive = true;

    faceMesh.onResults(results => {
      console.log("Auth FaceMesh frame");

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

  fullscreenEnforcementEnabled = false;
  fullscreenExitCount = 0;

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
    sum += Math.sqrt(dx * dx + dy * dy + dz * dz);
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
document.addEventListener("fullscreenchange", () => {
  if (!fullscreenEnforcementEnabled || !interviewActive) return;

  // User exited fullscreen (ESC / browser UI)
  if (!document.fullscreenElement) {
    fullscreenExitCount++;

    console.warn(
      `Fullscreen exit detected (${fullscreenExitCount}/${MAX_FULLSCREEN_EXITS})`
    );

    if (fullscreenExitCount <= MAX_FULLSCREEN_EXITS) {
      sendEvent("FULLSCREEN_EXIT_WARNING", "MEDIUM");

      showAlertMessage(
        `Make sure you do not click it again` +
        `Please remain in fullscreen mode.`,
        "medium"
      );

      // ✅ IMPORTANT: allow exit to be visible
      fullscreenEnforcementEnabled = false;

      setTimeout(() => {
        enterFullscreen();
        fullscreenEnforcementEnabled = true;
      }, 1200);

    } else {
      sendEvent("FULLSCREEN_EXIT_LIMIT_EXCEEDED", "HIGH");

      showAlertMessage(
        "Fullscreen exited multiple times. Interview terminated.",
        "high"
      );

      fullscreenEnforcementEnabled = false;
      endInterview();
      exitFullscreen();
    }
  }
});





// ==============================
// Events + Alerts
// ==============================
const EVENT_MESSAGES = {
  FACE_MISSING: "Face not detected. Please stay visible on camera.",
  MULTIPLE_FACES: "Multiple faces detected. Only one participant is allowed.",
  FACE_MISMATCH: "Face verification failed.",
  TAB_SWITCH: "Tab switch detected. Stay on the interview screen.",
  WINDOW_BLUR: "Interview window changed",
  SCREEN_RECORDING_STARTED: "Screen recording started.",
  SCREEN_SHARE_STOPPED: "Screen sharing stopped.",
  SCREEN_RECORDING_SAVED: "Recording saved successfully.",
  SCREEN_RECORDING_FAILED: "Recording failed.",
  SCREEN_RECORDING_UPLOAD_FAILED: "Recording upload failed.",
  EYE_LOOKING_AWAY: "Please keep your eyes on the screen.",
  EYES_CLOSED: "Eyes closed for too long.",
  HEAD_TURNED: "Face not centered. Please face the screen.",
  EYE_MOVEMENT: "Excessive eye movement detected.",
  FULLSCREEN_EXIT_ATTEMPT: "Fullscreen exit detected. Interview must remain in fullscreen mode.",
  FULLSCREEN_EXIT_WARNING: "Fullscreen exited. Please remain in fullscreen mode.",
  FULLSCREEN_EXIT_LIMIT_EXCEEDED: "Fullscreen exited too many times. Interview terminated."
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
  SCREEN_RECORDING_UPLOAD_FAILED: "high",
  EYE_LOOKING_AWAY: "medium",
  EYES_CLOSED: "medium",
  EYE_MOVEMENT: "medium",
  HEAD_TURNED: "medium",
  FULLSCREEN_EXIT_ATTEMPT: "high",
  FULLSCREEN_EXIT_WARNING: "medium",
  FULLSCREEN_EXIT_LIMIT_EXCEEDED: "high"


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

function getEyeCenter(landmarks, eye) {
  const p1 = landmarks[eye[0]];
  const p2 = landmarks[eye[1]];
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };
}

function getDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function processEyeMovement(landmarks) {
  if (!landmarks || !landmarks[468] || !landmarks[473]) return;

  // Eye corners
  const l1 = landmarks[33];
  const l2 = landmarks[133];
  const r1 = landmarks[362];
  const r2 = landmarks[263];

  // Iris
  const li = landmarks[468];
  const ri = landmarks[473];

  const leftWidth = Math.abs(l2.x - l1.x);
  const rightWidth = Math.abs(r2.x - r1.x);
  if (leftWidth === 0 || rightWidth === 0) return;

  // Normalized iris offset
  const leftOffset =
    Math.abs(li.x - (l1.x + l2.x) / 2) / leftWidth;
  const rightOffset =
    Math.abs(ri.x - (r1.x + r2.x) / 2) / rightWidth;

  const avgOffset = (leftOffset + rightOffset) / 2;

  // ---------- BASELINE CAPTURE ----------
  if (baselineEyeOffset === null) {
    baselineEyeOffset = avgOffset;
    return;
  }

  const deviation = Math.abs(avgOffset - baselineEyeOffset);

  // console.log(
  //   "EYE BASE:", baselineEyeOffset.toFixed(3),
  //   "CUR:", avgOffset.toFixed(3),
  //   "DEV:", deviation.toFixed(3)
  // );

  // ---------- RELATIVE EYE MOVEMENT ALERT ----------
  if (deviation > EYE_RELATIVE_THRESHOLD) {
    eyeDeviationFrames++;
    if (eyeDeviationFrames >= EYE_RELATIVE_FRAME_COUNT) {
      sendEvent("EYE_MOVEMENT", "MEDIUM");
      eyeDeviationFrames = 0;
    }
  } else {
    eyeDeviationFrames = 0;
  }
}



function processHeadMovement(landmarks) {
  const nose = landmarks[1];
  const leftCheek = landmarks[234];
  const rightCheek = landmarks[454];

  const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
  if (faceWidth === 0) return;

  const noseOffset =
    Math.abs(nose.x - (leftCheek.x + rightCheek.x) / 2) / faceWidth;

  // console.log("HEAD OFFSET:", noseOffset.toFixed(2));

  if (noseOffset > HEAD_TURN_THRESHOLD) {
    headTurnFrames++;
    if (headTurnFrames >= HEAD_TURN_FRAME_COUNT) {
      sendEvent("HEAD_TURNED", "MEDIUM");
      headTurnFrames = 0;
    }
  } else {
    headTurnFrames = 0;
  }
}



async function exitInterview() {
  const confirmExit = confirm(
    "Are you sure you want to exit the interview?\nYour session will be ended."
  );

  if (!confirmExit) return;

  interviewActive = false;
  interviewFaceMeshActive = false;

  stopScreenRecording();
  sendEvent("INTERVIEW_EXITED", "HIGH");

  exitFullscreen();

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


function showAlertMessage(message, severity = "medium") {
  const c = document.getElementById("alert-container");
  if (!c) return;

  const a = document.createElement("div");
  a.className = `alert ${severity}`;
  a.innerText = message;

  c.appendChild(a);
  setTimeout(() => a.remove(), 5000);
}
