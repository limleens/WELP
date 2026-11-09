import { EXERCISES, RepCounter, parseVoiceCommand, suggestTarget, weeklySummary } from './engine.mjs';

const $ = id => document.getElementById(id);
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const mpCdn = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision';
const HISTORY_KEY = 'welp-history-v1';
const LEGACY_HISTORY_KEY = 'pacepal-history-v1';
const HISTORY_MAX = 150;

let history = loadHistory();
const repCounter = new RepCounter('squat');
const state = {
  exercise: 'squat', target: EXERCISES.squat.base,
  count: 0, seconds: 0, mode: 'ready', startedAt: null, elapsedBeforePause: 0,
  cameraStream: null, landmarker: null, raf: null, lastFrameAt: 0, lastVideoTime: -1, modelLoading: false,
  recognition: null, listening: false, speaking: false, recognitionRestart: null,
  reachAnnounced: false,
};

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || localStorage.getItem(LEGACY_HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(x => x && EXERCISES[x.exercise] && Number.isFinite(Number(x.completed))) : [];
  } catch { return []; }
}
function saveHistory() {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-HISTORY_MAX))); }
  catch { setCoach('Unable to save locally. Check browser storage permissions.'); }
}
function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
function elapsedSec() {
  if (state.startedAt === null) return state.elapsedBeforePause;
  return state.elapsedBeforePause + (Date.now() - state.startedAt) / 1000;
}
function setCoach(text, heard = null) {
  $('coachMessage').textContent = text;
  if (heard !== null) $('heardText').textContent = heard;
}
function speak(text) {
  setCoach(text);
  if (!state.listening || !('speechSynthesis' in window)) return;
  state.speaking = true;
  try { state.recognition?.stop(); } catch { /* may already be stopped */ }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.08;
  utterance.pitch = 1.05;
  const done = () => {
    state.speaking = false;
    if (state.listening) setTimeout(startSpeechRecognition, 450);
  };
  utterance.onend = done;
  utterance.onerror = done;
  window.speechSynthesis.speak(utterance);
}
function updateProgress() {
  const amount = state.exercise === 'plank' ? state.seconds : state.count;
  $('completed').textContent = amount;
  $('overlayCount').textContent = amount;
  $('elapsed').textContent = formatClock(elapsedSec());
  $('targetDisplay').textContent = state.target;
  $('targetUnit').textContent = EXERCISES[state.exercise].unit;
  $('overlayUnit').textContent = EXERCISES[state.exercise].unit.toUpperCase();
  $('sessionStatus').textContent = state.mode === 'active' ? '● ACTIVE' : state.mode === 'paused' ? '◉ PAUSED' : '● READY';
  $('sessionStatus').classList.toggle('live', state.mode === 'active');
  $('startBtn').textContent = state.mode === 'active' ? 'Ⅱ Pause session' : state.mode === 'paused' ? '▶ Resume session' : '▶ Start session';
  $('finishBtn').disabled = state.mode === 'ready';
  $('exerciseSelect').disabled = state.mode !== 'ready';
  $('manualBtn').disabled = state.mode !== 'active' || state.exercise === 'plank';
  $('undoBtn').disabled = state.mode !== 'active' || state.exercise === 'plank' || state.count <= 0;
  if (state.mode === 'active' && !state.reachAnnounced && amount >= state.target) {
    state.reachAnnounced = true;
    speak('Target reached! Nice work. Say finish workout to save this session.');
  }
}
function updateSuggestion() {
  const plan = suggestTarget(history, state.exercise);
  state.target = plan.target;
  $('targetReason').textContent = plan.explanation;
  $('exerciseCue').textContent = EXERCISES[state.exercise].cue;
  state.reachAnnounced = false;
  updateProgress();
}
function selectExercise(key) {
  if (!EXERCISES[key]) return;
  if (state.mode !== 'ready') { speak('Please finish your current session before switching exercises.'); $('exerciseSelect').value = state.exercise; return; }
  state.exercise = key;
  state.count = 0;
  state.seconds = 0;
  state.elapsedBeforePause = 0;
  repCounter.reset(key);
  $('exerciseSelect').value = key;
  updateSuggestion();
  setCoach(`${EXERCISES[key].name} selected. ${EXERCISES[key].cue}`);
}
function startSession() {
  if (state.mode === 'active') { pauseSession(); return; }
  if (state.mode === 'paused') {
    state.startedAt = Date.now();
    state.mode = 'active';
    speak('Welcome back. Keep going at your own pace!');
  } else {
    state.count = 0;
    state.seconds = 0;
    state.elapsedBeforePause = 0;
    state.startedAt = Date.now();
    state.mode = 'active';
    state.reachAnnounced = false;
    repCounter.reset(state.exercise);
    speak(`Let's go! Your target is ${state.target} ${EXERCISES[state.exercise].unit}.`);
  }
  updateProgress();
}
function pauseSession() {
  if (state.mode !== 'active') return;
  state.elapsedBeforePause = elapsedSec();
  state.startedAt = null;
  state.mode = 'paused';
  repCounter.suspend();
  speak('Paused. Take your time. Say resume when you are ready.');
  updateProgress();
}
function finishSession() {
  if (state.mode === 'ready') { speak('Start a session first.'); return; }
  const seconds = Math.round(elapsedSec());
  const complete = state.exercise === 'plank' ? Math.min(seconds, 3600) : state.count;
  const log = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString(), exercise: state.exercise, completed: complete, target: state.target, exertion: Number($('effort').value), duration: seconds };
  history.push(log);
  saveHistory();
  state.startedAt = null;
  state.mode = 'ready';
  state.elapsedBeforePause = 0;
  state.seconds = 0;
  state.count = 0;
  repCounter.reset(state.exercise);
  updateSuggestion();
  renderHistory();
  speak(`Workout saved. You completed ${complete} ${EXERCISES[state.exercise].unit}. Your next suggested goal is ${state.target}.`);
}
function adjustRep(delta) {
  if (state.mode !== 'active' || state.exercise === 'plank') return;
  state.count = repCounter.adjust(delta);
  if (state.count < state.target) state.reachAnnounced = false;
  updateProgress();
}
function manualRep() { adjustRep(1); }
function changeDifficulty(direction) {
  if (state.mode === 'ready') {
    state.target = Math.max(state.exercise === 'plank' ? 10 : 4, state.target + direction * (state.exercise === 'plank' ? 5 : 2));
  } else {
    state.target = Math.max(state.exercise === 'plank' ? Math.floor(elapsedSec()) + 5 : state.count + 1, state.target + direction * (state.exercise === 'plank' ? 5 : 2));
  }
  state.reachAnnounced = false;
  $('targetReason').textContent = 'Adjusted at your request. Your effort matters more than the number.';
  updateProgress();
  speak(`Okay, adjusted to ${state.target} ${EXERCISES[state.exercise].unit}.`);
}
function onVoice(text) {
  $('heardText').textContent = `You said: “${text}”`;
  const command = parseVoiceCommand(text);
  switch (command.action) {
    case 'start': if (state.mode === 'ready') startSession(); else speak('Your workout has already started.'); break;
    case 'pause': pauseSession(); break;
    case 'resume': if (state.mode === 'paused') startSession(); else speak('Nothing to resume yet.'); break;
    case 'finish': finishSession(); break;
    case 'easier': changeDifficulty(-1); break;
    case 'harder': changeDifficulty(1); break;
    case 'undo': adjustRep(-1); speak('Last rep removed.'); break;
    case 'weekly': {
      const summary = weeklySummary(history);
      speak(summary.sessions ? `Over the last seven days, you logged ${summary.sessions} sessions and ${summary.reps} repetitions.` : 'No saved workouts this week yet. Start a session when you are ready.');
      break;
    }
    case 'progress': {
      const current = state.exercise === 'plank' ? Math.floor(elapsedSec()) : state.count;
      const remaining = Math.max(0, state.target - current);
      speak(`${current} completed. ${remaining} ${EXERCISES[state.exercise].unit} to go.`);
      break;
    }
    case 'exercise': selectExercise(command.exercise); break;
    case 'help': speak('Try start workout, pause, resume, make it easier, undo rep, how was my week, or finish workout.'); break;
    default: speak('I did not catch a workout command. Say help to hear the available commands.');
  }
}

function startSpeechRecognition() {
  if (!state.listening || state.speaking || !state.recognition) return;
  try { state.recognition.start(); } catch { /* already started, or browser ending previous turn */ }
}
function stopMicrophone() {
  state.listening = false;
  if (state.recognitionRestart) clearTimeout(state.recognitionRestart);
  state.recognitionRestart = null;
  try { state.recognition?.stop(); } catch {}
  try { window.speechSynthesis?.cancel(); } catch {}
  state.speaking = false;
  $('micBtn').classList.remove('listening');
  $('voiceStatus').textContent = '● Voice off';
  $('voiceStatus').classList.remove('live');
}
function toggleMicrophone() {
  if (state.listening) { stopMicrophone(); setCoach('Voice commands off. You can still use the buttons.'); return; }
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { setCoach('Speech recognition is unavailable in this browser. Try Chrome, or use the workout buttons.'); return; }
  if (!state.recognition) {
    const rec = new Recognition();
    rec.lang = 'en-GB';
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = event => {
      const result = event.results[event.resultIndex]?.[0]?.transcript;
      if (result && state.listening) onVoice(result);
    };
    rec.onerror = event => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        stopMicrophone(); setCoach('Microphone permission was denied. Use the on-screen controls instead.');
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setCoach(`Speech recognition issue: ${event.error}. You can still use the buttons.`);
      }
    };
    rec.onend = () => {
      if (state.listening && !state.speaking) state.recognitionRestart = setTimeout(startSpeechRecognition, 650);
    };
    state.recognition = rec;
  }
  state.listening = true;
  $('micBtn').classList.add('listening');
  $('voiceStatus').textContent = '● Listening for commands';
  $('voiceStatus').classList.add('live');
  startSpeechRecognition();
  setCoach('I’m listening. Say “start workout” to begin, or “help” for commands.');
}

function drawPose(points) {
  const canvas = $('overlay');
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!points || !points.length) return;
  const connections = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
  ctx.lineWidth = 4;ctx.strokeStyle = 'rgba(142,240,203,0.88)';ctx.fillStyle = '#c1ffe8';
  for (const [a,b] of connections) {
    if ((points[a]?.visibility ?? 1) < .55 || (points[b]?.visibility ?? 1) < .55) continue;
    ctx.beginPath();ctx.moveTo(points[a].x*w,points[a].y*h);ctx.lineTo(points[b].x*w,points[b].y*h);ctx.stroke();
  }
  for (const i of [11,12,13,14,15,16,23,24,25,26,27,28]) {
    const pt=points[i]; if (!pt || (pt.visibility??1)<.55)continue;
    ctx.beginPath();ctx.arc(pt.x*w,pt.y*h,5,0,Math.PI*2);ctx.fill();
  }
}
function poseLoop(now) {
  if (!state.cameraStream) return;
  const video = $('camera');
  if (state.landmarker && video.readyState >= 2 && now - state.lastFrameAt >= 55 && video.currentTime !== state.lastVideoTime) {
    state.lastFrameAt = now;
    state.lastVideoTime = video.currentTime;
    const canvas=$('overlay');
    if(canvas.width !== video.videoWidth || canvas.height !== video.videoHeight){canvas.width=video.videoWidth;canvas.height=video.videoHeight;}
    try {
      const result = state.landmarker.detectForVideo(video, now);
      const points = result.landmarks?.[0];
      drawPose(points);
      if (state.mode === 'active' && points && state.exercise !== 'plank') {
        const estimate = repCounter.update(points, now);
        $('poseMessage').textContent = estimate.counted
          ? `Rep counted! ${estimate.detail}`
          : `${estimate.detail} · cycle ${estimate.phase}`;
        if (estimate.counted) {
          state.count = estimate.reps;
          updateProgress();
          if (state.count > 0 && state.count % 5 === 0 && state.count < state.target) speak(`${state.count} reps. Keep it up!`);
        }
      } else if (!points) {
        repCounter.suspend();
        $('poseMessage').textContent = 'No body detected. Step farther back and show your full body.';
      } else if (state.mode !== 'active') {
        $('poseMessage').textContent = 'Body detected. Start a session to count repetitions.';
      } else {
        $('poseMessage').textContent = 'Timed exercise: plank form is not evaluated.';
      }
    } catch(error) { $('poseMessage').textContent = `Camera tracking error: ${error.message}`; }
  }
  state.raf = requestAnimationFrame(poseLoop);
}
async function enableCamera() {
  if (state.cameraStream) { stopCamera(); return; }
  if (!navigator.mediaDevices?.getUserMedia) { setCoach('Camera access requires localhost or HTTPS and a supported browser.'); return; }
  $('cameraBtn').disabled = true;
  $('cameraBtn').textContent = 'Starting camera…';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'user', width:{ideal:960}, height:{ideal:720} }, audio:false });
    state.cameraStream = stream;
    $('camera').srcObject = stream;
    await $('camera').play();
    $('cameraEmpty').classList.add('hidden');
    $('cameraLiveLabel').classList.remove('hidden');
    $('cameraStatus').textContent = '● Loading pose model';
    $('cameraStatus').classList.remove('live');
    $('cameraBtn').textContent = 'Turn camera off';
    $('poseMessage').textContent = 'Loading MediaPipe pose model…';
    state.modelLoading = true;
    state.raf = requestAnimationFrame(poseLoop);
    try {
      const { PoseLandmarker, FilesetResolver } = await import(mpCdn + '/vision_bundle.mjs');
      const resolver = await FilesetResolver.forVisionTasks(mpCdn + '/wasm');
      state.landmarker = await PoseLandmarker.createFromOptions(resolver, {
        baseOptions: { modelAssetPath: modelUrl, delegate: 'CPU' },
        runningMode: 'VIDEO', numPoses: 1,
        minPoseDetectionConfidence: 0.55, minPosePresenceConfidence: 0.55,
      });
      $('poseMessage').textContent = 'Pose model ready. Start a session and keep your full body in view.';
      $('cameraStatus').textContent = '● Pose tracking ready';
      $('cameraStatus').classList.add('live');
    } catch (error) {
      console.error('MediaPipe initialization failed', error);
      $('cameraStatus').textContent = '● Model unavailable';
      $('cameraStatus').classList.remove('live');
      $('poseMessage').textContent = 'Pose model could not load. Manual rep button remains available.';
      setCoach('Camera is on, but pose tracking could not load. Check your internet connection.');
    }
  } catch (error) {
    console.error('Camera error', error);
    setCoach(`Could not open camera: ${error.message}. You can track reps manually.`);
    stopCamera();
  } finally {
    state.modelLoading = false;
    $('cameraBtn').disabled = false;
    if (!state.cameraStream) $('cameraBtn').textContent = 'Enable camera';
  }
}
function stopCamera() {
  if (state.raf) cancelAnimationFrame(state.raf);
  state.raf = null;
  state.cameraStream?.getTracks().forEach(track=>track.stop());
  state.cameraStream = null;
  $('camera').srcObject = null;
  state.landmarker?.close();
  state.landmarker = null;
  state.modelLoading = false;
  repCounter.suspend();
  const canvas=$('overlay');canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);
  $('cameraEmpty').classList.remove('hidden');
  $('cameraLiveLabel').classList.add('hidden');
  $('cameraStatus').textContent = '● Camera off';
  $('cameraStatus').classList.remove('live');
  $('cameraBtn').textContent = 'Enable camera';
  $('poseMessage').textContent = 'Camera off — manual reps still work.';
}
function renderHistory() {
  $('totalSessions').textContent = history.length;
  $('weeklySessions').textContent = weeklySummary(history).sessions;
  $('totalReps').textContent = history.filter(h => h.exercise !== 'plank').reduce((acc,h)=>acc+Number(h.completed),0);
  $('totalMinutes').textContent = Math.round(history.reduce((acc,h)=>acc+Number(h.duration||0),0)/60);
  const container=$('historyList');container.replaceChildren();
  if (!history.length) {
    const empty=document.createElement('div');empty.className='empty-history';empty.textContent='No workouts yet. Your first completed session will appear here.';container.append(empty);return;
  }
  for(const session of [...history].reverse()) {
    const item=document.createElement('div'); item.className='history-item';
    const info=document.createElement('div'); const name=document.createElement('strong');name.textContent=EXERCISES[session.exercise].name;
    const detail=document.createElement('small');
    detail.textContent=`${new Date(session.at).toLocaleString()} · Target ${session.target} · Difficulty ${session.exertion}/10 · ${formatClock(session.duration)} elapsed`;
    info.append(name,detail);
    const score=document.createElement('div');score.className='score';score.textContent=`${session.completed} ${EXERCISES[session.exercise].unit}`;
    item.append(info,score);container.append(item);
  }
}
function showTab(which) {
  for (const name of ['workout','history','about']) {
    $(`${name}Tab`).classList.toggle('hidden', name !== which);
    document.querySelector(`[data-tab=${name}]`).classList.toggle('active', name === which);
  }
  $('crumbText').textContent = which === 'workout' ? 'WORKOUT' : which.toUpperCase();
  if (which === 'history') renderHistory();
}
function init() {
  $('date').textContent = new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric'}).format(new Date());
  document.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>showTab(el.dataset.tab)));
  $('cameraBtn').addEventListener('click',enableCamera);
  $('exerciseSelect').addEventListener('change',e=>selectExercise(e.target.value));
  $('startBtn').addEventListener('click',startSession);
  $('finishBtn').addEventListener('click',finishSession);
  $('manualBtn').addEventListener('click',manualRep);
  $('undoBtn').addEventListener('click',()=>adjustRep(-1));
  $('easierBtn').addEventListener('click',()=>changeDifficulty(-1));
  $('harderBtn').addEventListener('click',()=>changeDifficulty(1));
  $('micBtn').addEventListener('click',toggleMicrophone);
  $('effort').addEventListener('input',e=>$('effortValue').textContent=`${e.target.value}/10`);
  $('clearHistory').addEventListener('click',()=>{
    if (!confirm('Delete all WELP workout history stored in this browser?')) return;
    history=[]; saveHistory();
    try { localStorage.removeItem(LEGACY_HISTORY_KEY); } catch {}
    renderHistory(); if(state.mode==='ready')updateSuggestion();
  });
  setInterval(()=>{
    if (state.mode !== 'active') return;
    if (state.exercise === 'plank') state.seconds = Math.floor(elapsedSec());
    updateProgress();
  },250);
  window.addEventListener('pagehide',()=>{stopCamera();stopMicrophone();});
  updateSuggestion(); renderHistory();
}
init();
