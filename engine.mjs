/** Pure workout logic; deliberately independent of browser APIs. */
export const EXERCISES = Object.freeze({
  squat: { name: 'Bodyweight squats', unit: 'reps', base: 10, cue: 'Stand facing sideways, with hips, knees, and ankles visible.' },
  jack: { name: 'Jumping jacks', unit: 'reps', base: 15, cue: 'Face the camera, keeping hands and feet in frame.' },
  plank: { name: 'Timed plank', unit: 'seconds', base: 20, cue: 'Start the timer when ready. This demo times planks but does not validate form.' },
});

export function clamp(number, min, max) {
  return Math.max(min, Math.min(max, number));
}

export function angleDegrees(a, b, c) {
  if (!a || !b || !c) return null;
  const x1 = a.x - b.x, y1 = a.y - b.y;
  const x2 = c.x - b.x, y2 = c.y - b.y;
  const mag = Math.hypot(x1, y1) * Math.hypot(x2, y2);
  if (mag < 1e-7) return null;
  const cosine = clamp((x1 * x2 + y1 * y2) / mag, -1, 1);
  return Math.acos(cosine) * 180 / Math.PI;
}

// These thresholds are heuristic starting points; the UI displays the raw values so
// they can be tuned against real webcam observations without guessing.
const visible = (p, min = .40) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 1) >= min;
const distance = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);

/** Select the usable leg instead of taking the minimum angle from both legs:
 *  the far-side leg is often occluded and creates unrealistic angles. */
export function squatMetrics(points) {
  if (!points || points.length < 29) return null;
  const sides = [[23,25,27,'left'],[24,26,28,'right']];
  const candidates = [];
  for (const [hi,ki,ai,side] of sides) {
    const [hip,knee,ankle] = [points[hi],points[ki],points[ai]];
    if (![hip,knee,ankle].every(p=>visible(p))) continue;
    const thigh=distance(hip,knee), shin=distance(knee,ankle);
    if (thigh < .045 || shin < .045) continue;
    const angle=angleDegrees(hip,knee,ankle);
    const height=ankle.y-hip.y;
    const depth=Math.abs(height)>.09 ? (knee.y-hip.y)/height : null;
    candidates.push({angle,depth,side,confidence:Math.min(hip.visibility??1,knee.visibility??1,ankle.visibility??1),
      score:Math.min(hip.visibility??1,knee.visibility??1,ankle.visibility??1)*(thigh+shin)});
  }
  candidates.sort((x,y)=>y.score-x.score);
  return candidates[0] ?? null;
}
export function squatSignal(points) {
  return squatMetrics(points)?.angle ?? null;
}
export function jackMetrics(points) {
  if (!points || [11,12,15,16,27,28].some(i=>!visible(points[i],.35))) return null;
  const [leftS,rightS,leftW,rightW,leftA,rightA]=[11,12,15,16,27,28].map(i=>points[i]);
  const shoulderWidth=distance(leftS,rightS);
  // Front-facing jacks are unreliable when shoulders collapse into one column.
  if (shoulderWidth < .065) return null;
  const feetRatio=Math.abs(leftA.x-rightA.x)/shoulderWidth;
  const armsHigh=leftW.y < leftS.y-.045 && rightW.y < rightS.y-.045;
  const armsLow=leftW.y > leftS.y+.04 && rightW.y > rightS.y+.04;
  return {feetRatio,armsHigh,armsLow};
}
/** Without a calibrated resting stance, allow a generous starting posture.
 *  Once resting ankle separation is seen, use a personalised relative spread. */
export function jackSignal(points, restingFeetRatio = null) {
  const m=jackMetrics(points);
  if (!m) return null;
  const spread = restingFeetRatio === null
    ? m.feetRatio >= 1.65
    : m.feetRatio >= Math.max(restingFeetRatio*1.28,restingFeetRatio+.33);
  const together = restingFeetRatio === null
    ? m.feetRatio <= 1.8
    : m.feetRatio <= Math.max(restingFeetRatio*1.22,restingFeetRatio+.16);
  if (m.armsHigh && spread) return 'open';
  if (m.armsLow && together) return 'closed';
  return 'transition';
}
export function inspectMovement(points, exercise, restingFeetRatio = null) {
  if (exercise === 'squat') {
    const m=squatMetrics(points);
    if (!m) return {position:null, detail:'Leg landmarks unclear. Move back so hips, knees and ankles are visible.'};
    // Knee angle is useful from the side; hip-to-knee vertical ratio helps
    // in frontal views where a knee may not visibly bend very much in 2D.
    const down=m.angle<=140 || (m.depth!==null && m.depth<=.31);
    const up=m.angle>=155 && (m.depth===null || m.depth>=.38);
    const position=down?'down':up?'up':'transition';
    const detail=`Knee ${Math.round(m.angle)}° · hip depth ${m.depth===null?'n/a':m.depth.toFixed(2)} · ${position}`;
    return {position, detail, angle:m.angle, depth:m.depth};
  }
  if (exercise === 'jack') {
    const m=jackMetrics(points);
    if (!m) return {position:null, detail:'Keep shoulders, both wrists and ankles in frame; face the camera.'};
    const position=jackSignal(points,restingFeetRatio);
    return {position, detail:`Arms ${m.armsHigh?'up':m.armsLow?'down':'moving'} · feet ${m.feetRatio.toFixed(2)}× shoulder width · ${position}`,
      feetRatio:m.feetRatio,armsLow:m.armsLow};
  }
  return {position:null,detail:'Timed exercise'};
}

/** Two consistent posture readings trigger a state transition (rather than
 * holding one posture for 140ms, which missed fast jumping jacks at ~8fps).
 * A complete movement cycle is required to count a rep. */
export class RepCounter {
  constructor(exercise='squat') { this.reset(exercise); }
  reset(exercise=this.exercise) {
    this.exercise=exercise;
    this.phase='start';
    this.candidate=null;
    this.candidateSince=0;
    this.candidateFrames=0;
    this.lastRepAt=-Infinity;
    this.reps=0;
    this.restingFeetRatio=null;
  }
  update(points,nowMs) {
    if(this.exercise==='plank') return {reps:this.reps,counted:false,position:null,detail:'Timed exercise',phase:this.phase};
    const m=inspectMovement(points,this.exercise,this.restingFeetRatio);
    if (this.exercise==='jack' && this.restingFeetRatio===null && m.armsLow &&
      Number.isFinite(m.feetRatio) && m.feetRatio<=2.6) {
      this.restingFeetRatio=m.feetRatio;
    }
    // Re-evaluate with the freshly calibrated resting stance.
    const reading=this.exercise==='jack' && this.restingFeetRatio!==null
      ?inspectMovement(points,this.exercise,this.restingFeetRatio):m;
    const desired=reading.position;
    if (!desired || desired==='transition') {
      this.candidate=null;
      this.candidateFrames=0;
      return {reps:this.reps,counted:false,phase:this.phase,...reading};
    }
    if(desired!==this.candidate) {
      this.candidate=desired;
      this.candidateSince=nowMs;
      this.candidateFrames=1;
      return {reps:this.reps,counted:false,phase:this.phase,...reading};
    }
    this.candidateFrames+=1;
    if(this.candidateFrames<2 || nowMs-this.candidateSince<30)
      return {reps:this.reps,counted:false,phase:this.phase,...reading};
    const first=this.exercise==='squat'?'down':'open';
    const second=this.exercise==='squat'?'up':'closed';
    let counted=false;
    if(this.phase==='start') {
      if(desired===second) this.phase='ready';
      else if(desired===first) this.phase='loaded';
    } else if(this.phase==='ready' && desired===first) {
      this.phase='loaded';
    } else if(this.phase==='loaded' && desired===second) {
      this.phase='ready';
      if(nowMs-this.lastRepAt>=450) {
        this.reps+=1;
        this.lastRepAt=nowMs;
        counted=true;
      }
    }
    return {reps:this.reps,counted,phase:this.phase,...reading};
  }
  suspend() {
    this.phase='start';
    this.candidate=null;
    this.candidateSince=0;
    this.candidateFrames=0;
  }
  adjust(delta) {
    this.reps=Math.max(0,this.reps+delta);
    this.suspend();
    return this.reps;
  }
  manual() { return this.adjust(1); }
}

/** Deterministic conservative suggestions; not a fitness prescription. */
export function suggestTarget(history = [], exercise = 'squat') {
  const spec = EXERCISES[exercise];
  if (!spec) throw new Error('Unknown exercise');
  const recent = history.filter(h => h.exercise === exercise).slice(-3);
  if (recent.length === 0) return { target: spec.base, explanation: 'A comfortable starting target for a first session.' };
  const last = recent[recent.length - 1];
  const prior = Number(last.target) || spec.base;
  const completion = Number(last.completed) / Math.max(1, prior);
  const exertion = Number(last.exertion) || 6;
  if (completion < 0.8 || exertion >= 8) {
    const target = Math.max(exercise === 'plank' ? 10 : 4, Math.round(prior * 0.8));
    return { target, explanation: 'Last time felt difficult, so the next target is a little lighter.' };
  }
  if (completion >= 1 && exertion <= 5) {
    const step = exercise === 'plank' ? 5 : 2;
    return { target: Math.min(exercise === 'plank' ? 90 : 40, prior + step), explanation: 'You met the last target comfortably. Try a small progression.' };
  }
  return { target: prior, explanation: 'Keep the same target and focus on a comfortable session.' };
}

/** Recent workout summary. Invalid timestamps are ignored. */
export function weeklySummary(history = [], now = new Date()) {
  const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const recent = history.filter(h => {
    const time = new Date(h.at).getTime();
    return Number.isFinite(time) && time >= cutoff && time <= now.getTime() && EXERCISES[h.exercise];
  });
  return {
    sessions: recent.length,
    reps: recent.filter(h => h.exercise !== 'plank').reduce((sum, h) => sum + Math.max(0, Number(h.completed) || 0), 0),
    minutes: Math.round(recent.reduce((sum, h) => sum + Math.max(0, Number(h.duration) || 0), 0) / 60),
  };
}

export function parseVoiceCommand(text = '') {
  const lower = text.toLowerCase().trim();
  if (/\b(stop|finish|end)( the| my| this)? (workout|set|session)\b/.test(lower) || /^(done|finish|end workout)$/.test(lower)) return { action: 'finish' };
  if (/\b(pause|hold on|take a break|need a break)\b/.test(lower) || /^(stop|stop please)$/.test(lower)) return { action: 'pause' };
  if (/\b(undo|remove (the )?(last )?rep|subtract (a )?rep|that wasn't a rep)\b/.test(lower)) return { action: 'undo' };
  if (/\b(how (was|did) (my|i) (week|do this week)|this week's progress|weekly summary)\b/.test(lower)) return { action: 'weekly' };
  if (/\b(resume|continue)\b/.test(lower)) return { action: 'resume' };
  if (/\b(start|begin|let's go|lets go)\b/.test(lower)) return { action: 'start' };
  if (/\b(easier|too hard|struggling|can't do|cannot do|tired)\b/.test(lower)) return { action: 'easier' };
  if (/\b(harder|too easy|more challenging)\b/.test(lower)) return { action: 'harder' };
  if (/\b(how many|how much|progress|reps left|time left)\b/.test(lower)) return { action: 'progress' };
  if (/\b(squat|squats)\b/.test(lower)) return { action: 'exercise', exercise: 'squat' };
  if (/\b(jumping jack|jumping jacks)\b/.test(lower)) return { action: 'exercise', exercise: 'jack' };
  if (/\b(plank|planks)\b/.test(lower)) return { action: 'exercise', exercise: 'plank' };
  if (/\b(help|commands|what can i say)\b/.test(lower)) return { action: 'help' };
  return { action: 'unknown' };
}
