// Reflection-only voice capture. The recording stays in memory, never in localStorage.
const MAX_MS = 10 * 60 * 1000;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_CHARS = 20000;

export function mergeReflection(original, spoken, cursor = original.length) {
  const base = String(original || "");
  const addition = String(spoken || "").trim();
  const at = Math.max(0, Math.min(base.length, cursor));
  if (!addition) return { value: base, start: at, end: at };
  const left = base.slice(0, at), right = base.slice(at);
  const prefix = left && !/\s$/.test(left) ? "\n" : "";
  const suffix = right && !/^\s/.test(right) ? "\n" : "";
  const start = left.length + prefix.length;
  return { value: left + prefix + addition + suffix + right, start, end: start + addition.length };
}

// Only accept gentle corrections, never paraphrases or significant shortening.
export function chooseLightPolish(original, candidate) {
  const source = String(original || "").trim();
  const edited = String(candidate || "").trim();
  if (!source || !edited) return source;
  if (edited.length > source.length * 1.24 || edited.length < source.length * 0.78) return source;
  const normalize = text => text.toLocaleLowerCase("vi")
    .normalize("NFC").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const from = normalize(source), to = normalize(edited);
  if (!from.length) return source;
  const counts = new Map();
  for (const word of from) counts.set(word, (counts.get(word) || 0) + 1);
  let shared = 0;
  for (const word of to) {
    if ((counts.get(word) || 0) > 0) { shared++; counts.set(word, counts.get(word) - 1); }
  }
  return shared / from.length >= 0.87 ? edited : source;
}

const svg = (path, fill = "none") =>
  '<svg viewBox="0 0 24 24" width="25" height="25" fill="' + fill + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';

const symbols = {
  close: svg('<path d="M5 5l14 14M19 5 5 19"/>'),
  pause: svg('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>', "currentColor"),
  play: svg('<path d="M8 5l11 7-11 7z"/>'),
  send: svg('<path d="M21 3 10 14m11-11-6 18-4-8-8-4z"/>'),
  cloud: svg('<path d="M4 17a4 4 0 0 1 1-7.7A7 7 0 0 1 19 10a4 4 0 0 1 1 7M12 10v9m-3-3 3 3 3-3"/>'),
};

function supportedType() {
  if (!window.MediaRecorder) return null;
  for (const type of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return "";
}

async function postVoice(base, token, operation, input, signal) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  signal.addEventListener("abort", stop, { once: true });
  const timeout = setTimeout(() => controller.abort(), 95000);
  try {
    const response = await fetch(base + "/api/voice/" + operation, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": operation === "transcribe" ? input.type : "application/json",
      },
      body: operation === "transcribe" ? input : JSON.stringify({ original: input }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || "Không xử lý được ghi âm. Vui lòng thử lại.");
    const value = operation === "transcribe" ? data?.original : data?.polished;
    if (typeof value !== "string" || !value.trim() || value.length > MAX_CHARS)
      throw new Error("Bản chép trả về không hợp lệ.");
    return value.trim();
  } catch (error) {
    if (controller.signal.aborted && !signal.aborted)
      throw new Error("Kết nối gián đoạn hoặc quá thời gian. Bản ghi đang được giữ để thử lại.");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", stop);
  }
}

export function createReflectionRecorder({
  authorize, capture, save, baseUrl,
  request = postVoice, root = document.body,
} = {}) {
  const modal = document.createElement("dialog");
  modal.id = "reflection-voice-dialog";
  modal.setAttribute("aria-label", "Ghi âm một chút nhìn lại");
  modal.innerHTML = '<div class="rv-heading"><h2>Ghi âm</h2></div>' +
    '<div class="rv-recording"><div class="rv-orbit" aria-hidden="true">' +
      '<span class="rv-orbit-ring"></span>' +
      '<span class="rv-mic">' + svg('<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>') + '</span></div>' +
      '<span class="rv-clock" aria-label="Thời gian ghi âm">0:00</span>' +
      '<div class="rv-controls">' +
        '<button type="button" data-rv="discard" aria-label="Xóa bản ghi" title="Xóa bản ghi">' + symbols.close + '</button>' +
        '<button type="button" data-rv="pause" aria-label="Tạm dừng" title="Tạm dừng">' + symbols.pause + '</button>' +
        '<button type="button" data-rv="send" aria-label="Gửi bản ghi" title="Gửi bản ghi">' + symbols.send + '</button>' +
      '</div></div>' +
    '<div class="rv-processing" role="img" aria-label="Đang chuyển lời nói thành văn bản và lưu" hidden>' +
      symbols.cloud + '<span class="rv-spinner" aria-hidden="true"></span></div>' +
    '<div class="rv-message" role="status" aria-live="polite"></div>' +
    '<button type="button" class="rv-retry" data-rv="retry" hidden>Thử lại</button>';
  const find = (selector) => modal.querySelector(selector);
  let session = null;
  let index = 0;
  const setPhase = (phase) => {
    modal.dataset.phase = phase;
    find(".rv-processing").hidden = phase !== "processing";
    find("[data-rv=pause]").innerHTML = session?.recorder?.state === "paused" ? symbols.play : symbols.pause;
  };
  const status = (message) => { find(".rv-message").textContent = message || ""; };
  const time = (ms) => Math.floor(ms / 60000) + ":" + String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  function stopTracks(s) {
    for (const track of s.stream?.getTracks?.() || []) track.stop();
    s.stream = null;
  }
  function clearClock(s) {
    clearInterval(s.clockTimer);
    clearTimeout(s.endTimer);
    s.clockTimer = s.endTimer = null;
  }
  function elapsed(s) {
    return (s.elapsed || 0) + (s.recorder?.state === "recording" ? Date.now() - s.startedAt : 0);
  }
  function clockStart(s) {
    clearClock(s);
    s.clockTimer = setInterval(() => {
      if (session === s) find(".rv-clock").textContent = time(elapsed(s));
    }, 400);
    s.endTimer = setTimeout(() => finish(s), Math.max(0, MAX_MS - elapsed(s)));
  }
  function release(s) {
    clearClock(s);
    stopTracks(s);
    if (s.recorder && s.recorder.state !== "inactive") {
      try { s.recorder.stop(); } catch { /* already stopped */ }
    }
    s.controller.abort();
    s.audio = null;
    s.chunks = [];
  }
  function close({ completed = false, discard = false } = {}) {
    const s = session;
    if (s && ["processing", "error"].includes(modal.dataset.phase) && !completed) return false;
    if (s && !completed && !discard && ["recording", "paused", "ready"].includes(modal.dataset.phase) &&
      !confirm("Bỏ bản ghi âm chưa gửi?")) return false;
    session = null;
    if (s) release(s);
    if (modal.open) modal.close();
    modal.remove();
    return true;
  }
  function finish(s) {
    if (session !== s || !s.recorder || s.sendRequested) return;
    if (!["recording", "paused"].includes(s.recorder.state)) return;
    s.sendRequested = true;
    s.elapsed = elapsed(s);
    clearClock(s);
    setPhase("processing");
    status("");
    try { s.recorder.stop(); }
    catch (err) { setPhase("error"); status(err.message || "Không dừng được ghi âm."); find(".rv-retry").hidden = false; }
  }
  async function process(s) {
    if (session !== s || s.processing) return;
    s.processing = true;
    setPhase("processing");
    find(".rv-retry").hidden = true;
    status("");
    try {
      if (!s.original) {
        if (!s.audio || !s.audio.size || s.audio.size > MAX_BYTES) throw Error("Bản ghi trống hoặc quá 8 MB.");
        s.original = await request(baseUrl, s.token, "transcribe", s.audio, s.controller.signal);
        if (session !== s) return;
        s.audio = null;
      }
      if (!s.checkpoint) {
        s.checkpoint = await save({ capture: s.capture, text: s.original, mode: "initial" });
        if (session !== s) return;
      }
      // The original transcript is safely saved first. Editing failure must never lose it.
      try {
        const polished = await request(baseUrl, s.token, "polish", s.original, s.controller.signal);
        if (session === s) {
          const mild = chooseLightPolish(s.original, polished);
          if (mild !== s.original) await save({ capture: s.capture, text: mild, mode: "polish", checkpoint: s.checkpoint });
        }
      } catch { /* Keep the original already saved; do not retranscribe on failure. */ }
      if (session === s) close({ completed: true });
    } catch (error) {
      if (session !== s) return;
      setPhase("error");
      status(error.message || "Chưa lưu được bản ghi. Hãy thử lại.");
      find(".rv-retry").hidden = false;
    } finally {
      s.processing = false;
    }
  }
  async function open() {
    if (session) return false;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !isSecureContext)
      throw Error("Thiết bị chưa hỗ trợ ghi âm. Hãy mở Super Day qua HTTPS và cho phép micro.");
    if (!navigator.onLine) throw Error("Cần kết nối Internet để chuyển ghi âm thành văn bản.");
    if (!baseUrl || !/^https:\/\/[^/]+$/i.test(baseUrl)) throw Error("Dịch vụ chuyển giọng nói chưa được cấu hình.");
    // Request microphone inside the click gesture, before asynchronous authorization.
    const streamPromise = navigator.mediaDevices.getUserMedia({ audio: true });
    const s = {
      id: ++index, capture: capture(), controller: new AbortController(),
      chunks: [], elapsed: 0, startedAt: 0, sendRequested: false, original: "", checkpoint: null,
    };
    session = s;
    find(".rv-clock").textContent = "0:00";
    find(".rv-retry").hidden = true;
    find("[data-rv=pause]").innerHTML = symbols.pause;
    find("[data-rv=pause]").setAttribute("aria-label", "Tạm dừng");
    setPhase("preparing");
    status("Đang mở micro…");
    root.append(modal);
    modal.showModal();
    try {
      s.token = await authorize();
      if (session !== s) { streamPromise.then(stream => stream.getTracks().forEach(t => t.stop()), () => {}); return false; }
      s.stream = await streamPromise;
      if (session !== s) { stopTracks(s); return false; }
      const mimeType = supportedType();
      s.recorder = mimeType ? new MediaRecorder(s.stream, { mimeType }) : new MediaRecorder(s.stream);
      s.recorder.ondataavailable = event => { if (event.data?.size && session === s) s.chunks.push(event.data); };
      s.recorder.onerror = event => {
        if (session !== s) return;
        clearClock(s); stopTracks(s); setPhase("error");
        status(event.error?.message || "Micro bị gián đoạn.");
        find(".rv-retry").hidden = false;
      };
      s.recorder.onstop = () => {
        stopTracks(s);
        if (session !== s || !s.sendRequested) return;
        s.audio = new Blob(s.chunks, { type: s.recorder.mimeType || s.chunks[0]?.type || mimeType });
        s.chunks = [];
        void process(s);
      };
      s.recorder.start();
      s.startedAt = Date.now();
      setPhase("recording"); status("");
      clockStart(s);
      return true;
    } catch (error) {
      streamPromise.then(stream => stream.getTracks().forEach(t => t.stop()), () => {});
      if (session === s) {
        clearClock(s);
        setPhase("error");
        status(error?.name === "NotAllowedError" ? "Chưa có quyền dùng micro. Hãy cấp quyền trong Safari." :
          (error.message || "Không thể bắt đầu ghi âm."));
        find(".rv-retry").hidden = true;
        // Micro setup failed; no audio exists. Allow dismissal using an explicit retry button.
        find(".rv-retry").textContent = "Đóng";
        find(".rv-retry").hidden = false;
        s.setupFailed = true;
      }
      return false;
    }
  }
  modal.addEventListener("click", event => {
    const action = event.target.closest("[data-rv]")?.dataset.rv;
    const s = session;
    if (!s || !action) return;
    if (action === "discard") close({ discard: true });
    if (action === "send") finish(s);
    if (action === "pause") {
      if (!s.recorder) return;
      if (s.recorder.state === "recording") {
        s.elapsed = elapsed(s); s.recorder.pause(); clearClock(s);
        setPhase("paused"); find("[data-rv=pause]").setAttribute("aria-label", "Tiếp tục");
      } else if (s.recorder.state === "paused") {
        s.recorder.resume(); s.startedAt = Date.now();
        setPhase("recording"); clockStart(s);
        find("[data-rv=pause]").setAttribute("aria-label", "Tạm dừng");
      }
    }
    if (action === "retry") {
      if (s.setupFailed) {
        s.controller.abort(); session = null; release(s); modal.close(); modal.remove();
      } else void process(s);
    }
  });
  modal.addEventListener("cancel", event => { event.preventDefault(); close(); });
  window.addEventListener("beforeunload", event => {
    if (!session || !["processing", "error"].includes(modal.dataset.phase)) return;
    event.preventDefault(); event.returnValue = "";
  });
  window.addEventListener("pagehide", () => {
    if (!session) return;
    // The OS may still terminate the tab. Do not claim audio survives a reload.
    if (session.recorder?.state === "recording") {
      try { session.recorder.pause(); } catch { /* best effort */ }
    }
  });
  return { open, isActive: () => !!session, close };
}
