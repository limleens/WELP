import { EXERCISES, RepCounter, parseVoiceCommand, suggestTarget, weeklySummary } from './engine.mjs';
import { cleanProfile, buildHiitPlan, estimateKcal, HiitSession, parseCoachRequest, HIIT_EXERCISES } from './hiit.mjs';
import {validateCoachResponse, fallbackCoachReply} from './coach-actions.mjs';

const $ = id => document.getElementById(id);
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const mpCdn = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision';
const HISTORY_KEY = 'welp-history-v1';
const LEGACY_HISTORY_KEY = 'pacepal-history-v1';
const HISTORY_MAX = 150;
const PROFILE_KEY = 'welp-profile-v1';
const HIIT_HISTORY_KEY = 'welp-hiit-history-v1';

let history = loadHistory();
let hiitHistory = loadHiitHistory();
const repCounter = new RepCounter('squat');
const state = {
  exercise: 'squat', target: EXERCISES.squat.base,
  count: 0, seconds: 0, mode: 'ready', startedAt: null, elapsedBeforePause: 0,
  cameraStream: null, landmarker: null, raf: null, lastFrameAt: 0, lastVideoTime: -1, modelLoading: false,
  recognition: null, listening: false, speaking: false, recognitionRestart: null,
  reachAnnounced: false,
  profile: null, hiit: null, hiitPlan: null, hiitReps: 0, hiitSegments: [],
  lastRepAt: 0, lastBodyAt: 0, idlePrompted: false, pendingVoice: null,
  lastCountdownCue: false,
  reportedEffort:6, restCount:0, speechToken:0, cloudAudio:null,
  cloudEnabled:false, cloudAvailable:false, ttsAvailable:false, ttsEnabled:false,
  suppressVoice:false, pendingCoachRequest:false, coachTurns:[], lastMilestone:-1,
};

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || localStorage.getItem(LEGACY_HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(x => x && EXERCISES[x.exercise] && Number.isFinite(Number(x.completed))) : [];
  } catch { return []; }
}
function loadHiitHistory() {
  try {
    const data=JSON.parse(localStorage.getItem(HIIT_HISTORY_KEY)||'[]');
    return Array.isArray(data)?data.filter(x=>x && Number.isFinite(Number(x.activeSeconds))):[];
  } catch {return [];}
}
function saveHiitHistory() {
  try {localStorage.setItem(HIIT_HISTORY_KEY,JSON.stringify(hiitHistory.slice(-HISTORY_MAX)));}
  catch {setCoach('Unable to save this workout in local browser storage.');}
}
function loadProfile() {
  try {const raw=localStorage.getItem(PROFILE_KEY);return raw?cleanProfile(JSON.parse(raw)):null;}
  catch{return null;}
}
function saveProfile(profile) {
  try {localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));}
  catch{setCoach('Preferences could not be saved in this browser.');}
}
function renderPlan() {
  if(!state.hiitPlan) return;
  const plan=state.hiitPlan;
  const work=plan.stages.filter(s=>s.kind==='work');
  const rounded=Math.round(plan.totalSeconds/60);
  $('planTitle').textContent=`${rounded}-minute ${plan.profile.intensity} HIIT circuit`;
  $('planReason').textContent=plan.rationale;
  const steps=$('planSteps');steps.replaceChildren();
  // Summarize one exercise round instead of creating dozens of repeating cards.
  for(const step of plan.stages.slice(0,5)) {
    const card=document.createElement('div');card.className='plan-step';
    const name=document.createElement('span');name.textContent=step.kind==='rest'?'Recovery':HIIT_EXERCISES[step.exercise].name;
    const duration=document.createElement('small');duration.textContent=`${step.seconds} seconds`;
    card.append(name,duration);steps.append(card);
  }
  const more=plan.stages.length-5;
  if(more>0) {const tail=document.createElement('div');tail.className='plan-step';tail.textContent=`+ ${more} more intervals`;steps.append(tail);}
  $('sessionResult').classList.add('hidden');
  $('planPanel').classList.remove('hidden');
  $('welcomePanel').classList.add('hidden');
  renderHiitClock();
}
function createPlan() {
  const past=hiitHistory.length
    ? hiitHistory.map(h=>({...h,target:h.totalStages,completed:h.stagesCompleted}))
    : history;
  state.hiitPlan=buildHiitPlan(state.profile,past);
  state.hiit=new HiitSession(state.hiitPlan);
  state.hiitReps=0;
  state.hiitStruggled=false;
  state.reportedEffort=6;
  state.restCount=0;
  state.lastMilestone=-1;
  state.coachTurns=[];
  state.hiitSegments=[];
  state.mode='ready';
  state.exercise=state.hiit.stage.exercise || 'squat';
  repCounter.reset(state.exercise);
  state.count=0;state.seconds=0;state.elapsedBeforePause=0;state.startedAt=null;
  state.reachAnnounced=false;
  $('exerciseSelect').value=state.exercise;
  $('exerciseCue').textContent=HIIT_EXERCISES[state.exercise].cue;
  renderPlan();
  renderQueue();
  updateProgress();
}
function renderHiitClock() {
  const session=state.hiit;
  if(!session)return;
  const stage=session.stage;
  $('stageName').textContent=session.status==='complete'?'Circuit complete!':stage?.kind==='rest'?'Recovery break':(HIIT_EXERCISES[stage?.exercise]?.name||'Ready to begin');
  const repTarget=stage?.targetReps;
  $('stageRemaining').textContent=repTarget?String(Math.max(0,repTarget-state.count))+' reps left':formatClock(Math.ceil(session.remaining));
  $('circuitProgress').textContent=`Step ${Math.min(session.index+1,session.stages.length)} / ${session.stages.length}`;
  const kcal=estimateKcal(state.profile?.weightKg,session.activeSeconds,state.profile?.intensity);
  $('liveEnergy').textContent=kcal===null?'':'~'+kcal+' kcal estimated';
  renderFocusDisplay();
  $('startCircuitBtn').textContent=session.status==='ready'?'▶ Start guided HIIT':session.status==='paused'?'▶ Resume circuit':session.status==='active'?'Ⅱ Pause circuit':'↻ New circuit';
  $('startCircuitBtn').disabled=false;
  $('editProfileBtn').disabled=session.status==='active'||session.status==='paused';
  const running=session.status==='active'||session.status==='paused';
  document.body.classList.toggle('workout-live',running);
  $('focusPauseBtn').textContent=session.status==='active'?'Ⅱ Pause':session.status==='paused'?'▶ Resume':session.status==='complete'?'↻ New workout':'▶ Start';
  $('focusEndBtn').disabled=!running;
  $('focusMicBtn').textContent=state.listening?'🎙 Listening':'🎙 Enable mic';
  // The compact queue is refreshed on stage transitions and edits.
}
function renderFocusDisplay() {
  const ses=state.hiit;
  if(!ses)return;
  const stage=ses.stage;
  const resting=stage?.kind==='rest';
  const done=ses.status==='complete';
  $('focusDisplay').classList.toggle('resting',resting);
  $('focusStage').textContent=done?'Workout complete':resting?'Catch your breath':HIIT_EXERCISES[stage?.exercise]?.name||'Ready for your workout';
  const target=Number(stage?.targetReps)||0;
  const repMode=!!target && !resting;
  $('focusRemaining').textContent=done?'DONE':repMode?String(Math.max(0,target-state.count)):formatClock(Math.ceil(ses.remaining));
  $('focusMeasure').textContent=done?'GREAT WORK':resting?'REST TIME':repMode?'REPS TO GO':'TIME LEFT';
  let fraction=done?1:repMode?state.count/target:1-ses.remaining/Math.max(1,stage?.seconds||1);
  fraction=Math.max(0,Math.min(1,fraction));
  $('focusFill').style.width=(fraction*100).toFixed(1)+'%';
  $('focusTrack').setAttribute('aria-valuenow',String(Math.round(fraction*100)));
  $('focusHint').textContent=done?'You can build another circuit.':resting?'Your coach will tell you what is next':repMode?'Each counted rep moves your bar':'Eyes off the screen — follow the coach';
  $('focusTotal').textContent=ses.completedStages+' / '+ses.stages.length+' intervals completed';
}
function renderQueue() {
  const s=state.hiit;
  if(!s)return;
  const steps=$('planSteps');
  steps.replaceChildren();
  const upcoming=s.stages.slice(s.index,s.index+6);
  for(let i=0;i<upcoming.length;i++) {
    const stage=upcoming[i],card=document.createElement('div'),name=document.createElement('span'),meta=document.createElement('small');
    card.className='plan-step'+(i===0?' is-active':'');
    name.textContent=stage.kind==='rest'?'Rest':HIIT_EXERCISES[stage.exercise]?.name;
    meta.textContent=stage.targetReps?String(stage.targetReps)+' reps':String(stage.seconds)+' sec';
    card.append(name,meta);steps.append(card);
  }
  if(s.stages.length-s.index>6){
    const tail=document.createElement('div');tail.className='plan-step';
    tail.textContent='+'+(s.stages.length-s.index-6)+' intervals';
    steps.append(tail);
  }
}
function describeStage(stage) {
  if(stage.kind==='rest'){
    const upcoming=state.hiit?.stages.slice(state.hiit.index+1).find(s=>s.kind==='work');
    return `Take ${Math.ceil(state.hiit.remaining)} seconds to breathe. ${upcoming?'Up next: '+HIIT_EXERCISES[upcoming.exercise].name+'.':''}`;
  }
  return stage.targetReps
    ? `Let's do ${stage.targetReps} ${HIIT_EXERCISES[stage.exercise].name.toLowerCase()}. ${HIIT_EXERCISES[stage.exercise].cue}`
    : `${HIIT_EXERCISES[stage.exercise].name} for ${Math.ceil(state.hiit.remaining)} seconds. ${HIIT_EXERCISES[stage.exercise].cue}`;
}
function startCircuit() {
  if(!state.hiit){setCoach('First, choose your workout preferences.');return;}
  if(state.hiit.status==='complete')createPlan();
  if(state.hiit.status==='active'){pauseSession();return;}
  const wasPaused=state.hiit.status==='paused';
  state.hiit.start(Date.now());
  state.mode='active';
  state.startedAt=Date.now();
  if(wasPaused)repCounter.suspend();
  state.lastRepAt=Date.now();
  state.idlePrompted=false;
  speak(wasPaused?'Circuit resumed. Keep going!':`Let's begin! ${describeStage(state.hiit.stage)}`);
  updateProgress();renderHiitClock();
}
function recordCurrentWork() {
  if(!state.hiit || state.hiit.stage?.kind!=='work')return;
  const stage=state.hiit.stage;
  state.hiitReps+=state.exercise==='plank'?0:state.count;
  state.hiitSegments.push({exercise:stage.exercise,reps:state.count,plannedSeconds:stage.seconds});
}
function onStageChanged(previous) {
  if(previous?.kind==='work') {
    // Preserve completed reps before moving on to a recovery stage.
    state.hiitReps+=previous.exercise==='plank'?0:state.count;
    state.hiitSegments.push({exercise:previous.exercise,reps:state.count,plannedSeconds:previous.seconds});
  }
  const stage=state.hiit.stage;
  if(!stage) return;
  if(stage.kind==='work') {
    state.exercise=stage.exercise;
    $('exerciseSelect').value=stage.exercise;
    $('exerciseCue').textContent=HIIT_EXERCISES[stage.exercise].cue;
    repCounter.reset(stage.exercise);
  } else {
    $('exerciseCue').textContent='Recovery time. Focus on breathing; the next exercise will begin automatically.';
    repCounter.suspend();
  }
  state.count=0;state.seconds=0;state.lastRepAt=Date.now();
  state.idlePrompted=false;state.lastCountdownCue=false;state.pendingVoice=null;state.lastMilestone=-1;
  if(stage.kind==='rest')state.restCount++;
  if(stage.kind==='rest' && state.restCount%3===0){
    state.pendingVoice='feeling';
    speak("Nice work. Here's a breather. How's the pace feeling: comfortable, or a little too much?");
  } else speak(describeStage(stage));
  updateProgress();renderQueue();renderHiitClock();
}
function endCircuit(reason='finished',previous=state.hiit?.stage) {
  if(!state.hiit) return;
  if(previous?.kind==='work'){
    state.hiitReps+=previous.exercise==='plank'?0:state.count;
    state.hiitSegments.push({exercise:previous.exercise,reps:state.count,plannedSeconds:previous.seconds});
  }
  const ses=state.hiit;
  if(ses.status!=='complete') {ses.pause(Date.now());ses.status='complete';}
  state.mode='ready';state.startedAt=null;state.elapsedBeforePause=0;
  const result={at:new Date().toISOString(),goal:state.profile.goal,
    intensity:state.profile.intensity,activeSeconds:Math.round(ses.activeSeconds),
    restSeconds:Math.round(ses.restSeconds),reps:state.hiitReps,
    stagesCompleted:ses.completedStages,totalStages:ses.stages.length,
    exertion:Math.max(state.reportedEffort,state.hiitStruggled?8:0),segments:state.hiitSegments};
  hiitHistory.push(result);saveHiitHistory();
  const calories=estimateKcal(state.profile.weightKg,result.activeSeconds,state.profile.intensity);
  const summary=`Circuit ${reason}! ${result.reps} recorded reps across ${result.stagesCompleted} intervals. Active time ${formatClock(result.activeSeconds)}.${calories===null?'':' Rough estimated active energy '+calories+' kilocalories.'}`;
  $('sessionResult').textContent=summary+(calories===null?'':' Calorie estimate is approximate, not measured.');
  $('sessionResult').classList.remove('hidden');
  renderQueue();renderHiitClock();renderHistory();updateProgress();
  speak(summary+' Great job listening to your body.');
}
function tickCircuit() {
  const s=state.hiit;
  if(!s || s.status!=='active')return;
  const prior={...s.stage};
  const events=s.tick(Date.now());
  for(const e of events) {
    if(e.type==='stage')onStageChanged(prior);
    if(e.type==='completed'){endCircuit('complete',prior);return;}
  }
  if(s.status!=='active')return;
  if(s.stage.kind==='work' && !state.lastCountdownCue && s.remaining<=10){
    state.lastCountdownCue=true;
    speak('Ten seconds to go!');
  }
  if(s.stage.kind==='work' && state.exercise!=='plank' && !state.idlePrompted &&
     Date.now()-state.lastRepAt>14000 && Date.now()-state.lastBodyAt<2000){
    state.idlePrompted=true;state.pendingVoice='break';
    speak('Need a breather? You can say yes, or keep going.');
  }
  renderHiitClock();
}
function takeCircuitBreak() {
  if(!state.hiit || !['active','paused'].includes(state.hiit.status))return;
  const prior={...state.hiit.stage};
  state.hiit.takeBreak(Date.now(),25);
  if(prior.kind==='work') {
    // Work not completed; preserve counts for summary, then resume remaining time after rest.
    onStageChanged(prior);
  } else {speak('Added more recovery time.');renderHiitClock();}
  state.pendingVoice=null;
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
/** The UI always has a text transcript; speech is the primary control surface. */
function speak(text) {
  setCoach(text);
  if(state.suppressVoice) return;
  const token=++state.speechToken;
  if(state.cloudAudio) {state.cloudAudio.pause();state.cloudAudio=null;}
  try {window.speechSynthesis?.cancel();} catch {}
  if(!('speechSynthesis' in window))return;
  state.speaking=true;
  try {state.recognition?.stop();} catch {}
  const done=()=>{
    if(token!==state.speechToken)return;
    state.speaking=false;
    if(state.listening)setTimeout(startSpeechRecognition,250);
  };
  const deviceVoice=()=>{
    if(token!==state.speechToken)return;
    const utterance=new SpeechSynthesisUtterance(text);
    const voices=window.speechSynthesis.getVoices?.()||[];
    const english=voices.filter(v=>v.lang.toLowerCase().startsWith('en'));
    const preferred=english.find(v=>/natural|neural|online|premium|enhanced/i.test(v.name))
      ||english.find(v=>/aria|jenny|samantha|daniel|google uk/i.test(v.name))
      ||english[0];
    if(preferred)utterance.voice=preferred;
    utterance.lang=preferred?.lang||'en-GB';
    utterance.rate=1.03;utterance.pitch=1;
    utterance.onend=done;utterance.onerror=done;
    try {window.speechSynthesis.speak(utterance);}catch{done();}
  };
  if(!state.ttsEnabled) {deviceVoice();return;}
  (async()=>{
    try {
      const response=await fetch('/api/tts',{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({text}),
        signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw Error('Natural voice unavailable');
      const audioBlob=await response.blob();
      if(token!==state.speechToken)return;
      const url=URL.createObjectURL(audioBlob);
      const audio=new Audio(url);
      state.cloudAudio=audio;
      audio.onended=()=>{URL.revokeObjectURL(url);state.cloudAudio=null;done();};
      audio.onerror=()=>{URL.revokeObjectURL(url);state.cloudAudio=null;deviceVoice();};
      await audio.play();
    }catch{
      if(token===state.speechToken)deviceVoice();
    }
  })();
}
async function detectCloudCoach() {
  try {
    const response=await fetch('/api/status',{signal:AbortSignal.timeout(2000)});
    if(!response.ok)throw Error('No local AI backend');
    const config=await response.json();
    state.cloudAvailable=!!config.geminiEnabled;
    state.ttsAvailable=!!config.ttsEnabled;
    $('cloudCoachToggle').disabled=!state.cloudAvailable;
    $('neuralVoiceToggle').disabled=true;
    $('aiStatus').textContent=state.cloudAvailable
      ?'Gemini is available · switch on to send requests with limited workout context'
      :'Local voice coach · run node server.mjs with GEMINI_API_KEY for Gemini';
  } catch {
    state.cloudAvailable=false;state.ttsAvailable=false;
    $('aiStatus').textContent='Local coach · Gemini requires the optional Node server';
  }
}

function updateProgress() {
  const amount = state.exercise === 'plank' ? state.seconds : state.count;
  $('completed').textContent = amount;
  $('overlayCount').textContent = amount;
  $('elapsed').textContent = formatClock(elapsedSec());
  $('targetDisplay').textContent = state.hiit?.status==='active'||state.hiit?.status==='paused' ? Math.ceil(state.hiit.remaining) : state.target;
  $('targetUnit').textContent = state.hiit && state.hiit.status!=='complete' ? 'seconds left' : EXERCISES[state.exercise].unit;
  $('overlayUnit').textContent = EXERCISES[state.exercise].unit.toUpperCase();
  $('sessionStatus').textContent = state.mode === 'active' ? '● ACTIVE' : state.mode === 'paused' ? '◉ PAUSED' : '● READY';
  $('sessionStatus').classList.toggle('live', state.mode === 'active');
  $('startBtn').textContent = state.mode === 'active' ? 'Ⅱ Pause session' : state.mode === 'paused' ? '▶ Resume session' : '▶ Start session';
  $('finishBtn').disabled = state.mode === 'ready';
  $('exerciseSelect').disabled = state.mode !== 'ready' || !!state.hiit;
  $('manualBtn').disabled = state.mode !== 'active' || state.exercise === 'plank' || (state.hiit && state.hiit.stage?.kind!=='work');
  $('undoBtn').disabled = state.mode !== 'active' || state.exercise === 'plank' || state.count <= 0 || (state.hiit && state.hiit.stage?.kind!=='work');
  if (!state.hiit && state.mode === 'active' && !state.reachAnnounced && amount >= state.target) {
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
  if(!state.profile) {setCoach('Choose your preferences and build a HIIT circuit first.');return;}
  if (state.hiit) {startCircuit();return;}
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
  if (state.hiit && state.hiit.status==='active') state.hiit.pause(Date.now());
  state.elapsedBeforePause = elapsedSec();
  state.startedAt = null;
  state.mode = 'paused';
  repCounter.suspend();
  speak('Paused. Take your time. Say resume when you are ready.');
  updateProgress();
}
function finishSession() {
  if (state.hiit) {if(state.hiit.status!=='ready' && state.hiit.status!=='complete')endCircuit('saved early');return;}
  if (state.mode === 'ready') { speak('Start a session first.'); return; }
  const seconds = Math.round(elapsedSec());
  const complete = state.exercise === 'plank' ? Math.min(seconds, 3600) : state.count;
  const log = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString(), exercise: state.exercise, completed: complete, target: state.target, exertion: state.reportedEffort, duration: seconds };
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
  if (state.mode !== 'active' || state.exercise === 'plank' || (state.hiit && state.hiit.stage?.kind!=='work')) return;
  state.count = repCounter.adjust(delta);
  state.lastRepAt=Date.now();
  if (state.count < state.target) state.reachAnnounced = false;
  updateProgress();
}
function manualRep() { adjustRep(1); }
function changeDifficulty(direction) {
  if (state.hiit) {
    if(direction<0 && ['active','paused'].includes(state.hiit.status)){
      state.hiitStruggled=true;
      state.hiit.makeEasier();renderHiitClock();speak('I shortened the remaining intervals and lengthened breaks. Would you like a break now?');state.pendingVoice='break';
    } else speak('You can choose a different workout intensity in your preferences before starting your next circuit.');
    return;
  }
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
  if(!state.profile){speak('First choose your goal, experience and intensity, then build a HIIT circuit.');return;}
  if(state.hiit){processSmartVoice(text);return;}
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

function getCoachContext() {
  const s=state.hiit;
  return {status:s?.status||'ready',
    stage:s?.stage?{kind:s.stage.kind,exercise:s.stage.exercise,targetReps:s.stage.targetReps}:null,
    currentReps:state.count,remainingSeconds:Math.ceil(s?.remaining||0),
    upcomingExercise:s?.stages.slice(s.index+1).find(x=>x.kind==='work')?.exercise||null,
    pending:state.pendingVoice,
    turns:state.coachTurns.slice(-6)};
}
function maybeAnnounceReps() {
  const s=state.hiit;
  if(!s || s.status!=='active' || s.stage?.kind!=='work')return;
  const target=Number(s.stage.targetReps)||0;
  if(target) {
    const remain=target-state.count;
    if(remain>0 && remain<=3 && state.lastMilestone!==remain) {
      state.lastMilestone=remain;
      speak(remain===1?'One more!':remain===2?'Two to go!':'Three left. You can do this!');
    }
    if(state.count>=target)advanceRepStage();
  }
}
function advanceRepStage() {
  const s=state.hiit;
  if(s?.status!=='active'||!s.stage?.targetReps||state.count<s.stage.targetReps)return;
  const previous={...s.stage};
  const events=s.skip(Date.now());
  for(const e of events) {
    if(e.type==='completed')endCircuit('complete',previous);
    else if(e.type==='stage')onStageChanged(previous);
  }
}
function performCoachAction(raw) {
  const output=validateCoachResponse(raw);
  const ses=state.hiit;
  if(!ses)return;
  const action=output.action;
  let response=output.reply || 'Of course.';
  const active=['active','paused'].includes(ses.status);
  state.suppressVoice=true;
  // Clear the check-in context after an answer; some actions create a new one.
  state.pendingVoice=null;
  try {
    switch(action){
      case 'start': case 'resume':
        if(['ready','paused'].includes(ses.status))startCircuit();
        else response="We're already moving. Keep going!";
        break;
      case 'pause':
        if(ses.status==='active')pauseSession();
        else response="You're already taking a breather.";
        break;
      case 'finish':
        if(active)finishSession();
        else response="Your circuit isn't running yet.";
        break;
      case 'safety':
        if(ses.status==='active')pauseSession();
        state.reportedEffort=9;state.hiitStruggled=true;
        response='Stop exercising and rest. If symptoms are severe or persist, seek medical help.';
        break;
      case 'easier': case 'feeling_tired':
        if(active){
          state.hiitStruggled=true;state.reportedEffort=8;
          ses.makeEasier();
          state.pendingVoice='break';
          response=action==='feeling_tired'?"Thanks for telling me. I've eased the next intervals. Want a little longer to rest?": "Got it, I've shortened your work and added recovery time. Want a break now?";
        } else response="We can lower the intensity before your next session in preferences.";
        break;
      case 'feeling_good':
        if(!state.hiitStruggled)state.reportedEffort=4;
        response=output.reply||"Love to hear it. We'll keep a steady pace.";
        break;
      case 'harder':
        if(active){
          ses.makeHarder();state.reportedEffort=4;
          response="All right, a little extra challenge. We'll still keep the breaks sensible.";
        } else response="You can choose a more challenging level in your preferences.";
        break;
      case 'take_break':
        if(active){
          takeCircuitBreak();
          response="Absolutely. Let's take a breather.";
        } else response="Start your workout whenever you're ready.";
        break;
      case 'extend_rest': case 'shorten_rest': {
        if(!active&&ses.status!=='ready'){response="Start a new workout to change the break lengths.";break;}
        const diff=output.seconds*(action==='shorten_rest'?-1:1);
        const ok=ses.adjustRests(diff);
        response=ok?(action==='shorten_rest'?"Sure, I've shortened the remaining breaks.":"No problem, I've added more recovery time.")
          :"There aren't any upcoming breaks to adjust.";
        break;
      }
      case 'track_reps': case 'add_interval': {
        if(ses.status==='complete'){response="Let's build a new session before adding exercises.";break;}
        if(output.exercise==='plank' && action==='track_reps'){
          response="Planks are timed, not counted. Ask me to add a plank interval instead.";break;
        }
        const ok=ses.addExercise(output.exercise,{
          targetReps:action==='track_reps'?output.reps:null,seconds:30
        });
        response=ok?(action==='track_reps'
          ?`I've added ${output.reps} ${HIIT_EXERCISES[output.exercise].name.toLowerCase()} after your next recovery. I'll count with you.`
          :`You got it. One more ${HIIT_EXERCISES[output.exercise].name.toLowerCase()} interval is on the plan.`)
          :"That circuit is already full. Let's finish what we've got.";
        break;
      }
      case 'skip':{
        if(ses.status!=='active'){response="Start the circuit before skipping an interval.";break;}
        const previous={...ses.stage};
        for(const e of ses.skip(Date.now())) {
          if(e.type==='completed')endCircuit('complete',previous);
          else if(e.type==='stage')onStageChanged(previous);
        }
        response="Okay, we're moving on. Listen for the next exercise.";
        break;
      }
      case 'status':{
        const stage=ses.stage;
        response=stage?.targetReps?
          `${state.count} of ${stage.targetReps} reps done. ${Math.max(0,stage.targetReps-state.count)} to go.`
          :`You're on step ${Math.min(ses.index+1,ses.stages.length)} of ${ses.stages.length}. ${Math.ceil(ses.remaining)} seconds left in this interval.`;
        break;
      }
      case 'next':{
        const next=ses.stages.slice(ses.index+1).find(x=>x.kind==='work');
        response=next?`Next is ${HIIT_EXERCISES[next.exercise].name.toLowerCase()}.`:'This is your final exercise. Nice work!';
        break;
      }
      case 'instructions':
        response=ses.stage?.kind==='rest'?"It's recovery time. Breathe and get ready for the next move.":describeStage(ses.stage);
        break;
      case 'none':default:
        response=output.reply || "I'm here. You can ask to change the workout or talk through how it's feeling.";
    }
  } finally {state.suppressVoice=false;}
  renderQueue();renderHiitClock();updateProgress();
  speak(response);
}
async function processSmartVoice(text) {
  if(state.pendingCoachRequest){
    setCoach("Just a moment, I'm still processing your previous request.");
    return;
  }
  const ses=state.hiit;
  const index=ses.index;
  const context=getCoachContext();
  let output;
  state.pendingCoachRequest=true;
  try {
    if(state.cloudEnabled) {
      $('aiStatus').textContent='Gemini is thinking…';
      const response=await fetch('/api/coach',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({transcript:text,context}),
        signal:AbortSignal.timeout(11000)
      });
      if(!response.ok)throw Error('Cloud request unavailable');
      output=validateCoachResponse(await response.json());
    } else output=validateCoachResponse(fallbackCoachReply(text,context));
  }catch {
    output=validateCoachResponse(fallbackCoachReply(text,context));
    $('aiStatus').textContent='Gemini unavailable · local coach fallback active';
  }finally {
    state.pendingCoachRequest=false;
    if(state.cloudEnabled && $('aiStatus').textContent==='Gemini is thinking…')
      $('aiStatus').textContent='Gemini conversation active';
  }
  if(ses!==state.hiit)return;
  // If the clock moved to the next interval while cloud AI was deciding,
  // do not apply an action to a different exercise.
  if(index!==ses.index && !['none','status','next','instructions','safety'].includes(output.action)){
    speak("We've moved to the next exercise while I was thinking. Could you repeat that?");
    return;
  }
  state.coachTurns.push({role:'user',text:text.slice(0,220)},{role:'coach',text:(output.reply||'').slice(0,220)});
  state.coachTurns=state.coachTurns.slice(-6);
  performCoachAction(output);
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
  $('focusMicBtn').textContent='🎙 Enable mic';
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
  $('focusMicBtn').textContent='🎙 Listening';
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
      if(points)state.lastBodyAt=Date.now();
      if (state.mode === 'active' && points && state.exercise !== 'plank' && (!state.hiit || state.hiit.stage?.kind==='work')) {
        const estimate = repCounter.update(points, now);
        $('poseMessage').textContent = estimate.counted
          ? `Rep counted! ${estimate.detail}`
          : `${estimate.detail} · cycle ${estimate.phase}`;
        if (estimate.counted) {
          state.count = estimate.reps;
          state.lastRepAt=Date.now();
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
  $('totalSessions').textContent = history.length+hiitHistory.length;
  $('weeklySessions').textContent = weeklySummary(history).sessions+hiitHistory.filter(h=>Date.parse(h.at)>=Date.now()-7*86400000).length;
  $('totalReps').textContent = history.filter(h => h.exercise !== 'plank').reduce((acc,h)=>acc+Number(h.completed),0)+hiitHistory.reduce((acc,h)=>acc+(Number(h.reps)||0),0);
  $('totalMinutes').textContent = Math.round((history.reduce((acc,h)=>acc+Number(h.duration||0),0)+hiitHistory.reduce((acc,h)=>acc+(Number(h.activeSeconds)||0),0))/60);
  const container=$('historyList');container.replaceChildren();
  if (!history.length && !hiitHistory.length) {
    const empty=document.createElement('div');empty.className='empty-history';empty.textContent='No workouts yet. Your first completed session will appear here.';container.append(empty);return;
  }
  const combined=[...history.map(h=>({kind:'single',...h})),...hiitHistory.map(h=>({kind:'hiit',...h}))].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  for(const session of combined) {
    if(session.kind==='hiit') {
      const item=document.createElement('div');item.className='history-item';
      const info=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('small');
      name.textContent='Guided HIIT circuit';
      detail.textContent=`${new Date(session.at).toLocaleString()} · ${session.intensity} · ${session.stagesCompleted}/${session.totalStages} intervals · ${formatClock(session.activeSeconds)} active`;
      info.append(name,detail);
      const score=document.createElement('div');score.className='score';score.textContent=`${session.reps} reps`;
      item.append(info,score);container.append(item);
      continue;
    }
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
  state.profile=loadProfile();
  if(state.profile) {
    $('profileGoal').value=state.profile.goal;
    $('profileLevel').value=state.profile.level;
    $('profileIntensity').value=state.profile.intensity;
    $('profileMinutes').value=String(state.profile.minutes);
    $('profileWeight').value=state.profile.weightKg??'';
    createPlan();
  } else {
    $('welcomePanel').classList.remove('hidden');
    $('planPanel').classList.add('hidden');
    setCoach('Welcome to WELP. Build your first HIIT circuit above to get started.');
  }
  $('profileForm').addEventListener('submit',e=>{
    e.preventDefault();
    state.profile=cleanProfile({
      goal:$('profileGoal').value,level:$('profileLevel').value,
      intensity:$('profileIntensity').value,minutes:Number($('profileMinutes').value),
      weightKg:$('profileWeight').value
    });
    saveProfile(state.profile);createPlan();
    setCoach('Circuit ready. Enable your camera and mic, then say start workout or press Start guided HIIT.');
  });
  $('editProfileBtn').addEventListener('click',()=>{
    if(state.mode!=='ready'||state.hiit?.status==='active'||state.hiit?.status==='paused')return;
    $('welcomePanel').classList.remove('hidden');$('planPanel').classList.add('hidden');
  });
  $('startCircuitBtn').addEventListener('click',startCircuit);
  $('focusPauseBtn').addEventListener('click',startCircuit);
  $('focusEndBtn').addEventListener('click',()=>{if(state.hiit?.status==='active'||state.hiit?.status==='paused')finishSession();});
  $('focusMicBtn').addEventListener('click',toggleMicrophone);
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
  $('coachTextForm').addEventListener('submit',e=>{
    e.preventDefault();const text=$('coachTextInput').value.trim();
    if(!text)return;
    $('coachTextInput').value='';onVoice(text);
  });
  $('cloudCoachToggle').addEventListener('change',e=>{
    state.cloudEnabled=state.cloudAvailable && e.target.checked;
    if(!state.cloudEnabled){state.ttsEnabled=false;$('neuralVoiceToggle').checked=false;}
    $('neuralVoiceToggle').disabled=!state.cloudEnabled || !state.ttsAvailable;
    $('aiStatus').textContent=state.cloudEnabled?'Gemini conversation active · workout actions are validated':'Local coach active · no transcript sent to Gemini';
  });
  $('neuralVoiceToggle').addEventListener('change',e=>{state.ttsEnabled=state.cloudEnabled&&state.ttsAvailable&&e.target.checked;});
  detectCloudCoach();
  $('clearHistory').addEventListener('click',()=>{
    if (!confirm('Delete all WELP workout history stored in this browser?')) return;
    history=[];hiitHistory=[];saveHistory();saveHiitHistory();
    try { localStorage.removeItem(LEGACY_HISTORY_KEY); } catch {}
    renderHistory(); if(state.mode==='ready')updateSuggestion();
  });
  setInterval(()=>{
    if (state.mode !== 'active') return;
    if (state.hiit) {
      tickCircuit();
      if(state.hiit.stage?.kind==='work' && state.exercise==='plank')state.seconds = Math.round(state.hiit.stage.seconds-state.hiit.remaining);
    } else if (state.exercise === 'plank') state.seconds = Math.floor(elapsedSec());
    updateProgress();
  },250);
  window.addEventListener('pagehide',()=>{stopCamera();stopMicrophone();});
  updateSuggestion(); renderHistory();
}
init();
