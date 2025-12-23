
let interviewActive = false;
let sessionId = null;
// let API_BASE = "http://127.0.0.1:8000/api/v1";
let API_BASE = "http://127.0.0.1:8000/api/v1";


// --------------------
// Session APIs
// --------------------

async function createSession() {
  const res = await fetch(`${API_BASE}/sessions`, { method: "POST" });
  const data = await res.json();
  console.log("Session created:", data);   
  sessionId = data.session_id;
  document.getElementById("sessionId").innerText = sessionId;
  document.getElementById("status").innerText = data.status;  
}

async function startSession() {
  if (!sessionId) return alert("Create session first");

  const res = await fetch(`${API_BASE}/sessions/${sessionId}/start`, {
    method: "POST"
  });

  const data = await res.json();
  document.getElementById("status").innerText = data.status;

  interviewActive = true;   
  startCamera();
}


async function startCamera() {
  const video = document.getElementById("video");

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert("Camera API not supported in this browser");
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
}



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


async function sendEvent(eventType, severity) {
  if (!sessionId || !interviewActive) return; 

  await fetch(`${API_BASE}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      event_type: eventType,
      severity: severity,
      confidence: null,
      timestamp: new Date().toISOString()
    })
  });
}
