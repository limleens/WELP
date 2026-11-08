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

const visible = (point) => point && (point.visibility ?? 1) >= 0.55;

export function squatSignal(points) {
  // MediaPipe landmarks: hip=23/24, knee=25/26, ankle=27/28.
  if (!points || points.length < 29) return null;
  const sides = [
    [23, 25, 27], [24, 26, 28]
  ];
  const angles = sides.map(([hip, knee, ankle]) => {
    if (![points[hip], points[knee], points[ankle]].every(visible)) return null;
    return angleDegrees(points[hip], points[knee], points[ankle]);
  }).filter(v => v !== null);
  if (!angles.length) return null;
  return Math.min(...angles); // Favor the more visible bent side in side-facing poses.
}

export function jackSignal(points) {
  // wrists=15/16, shoulders=11/12, ankles=27/28
  if (!points || [11,12,15,16,27,28].some(i => !visible(points[i]))) return null;
  const leftS = points[11], rightS = points[12], leftW = points[15], rightW = points[16];
  const leftA = points[27], rightA = points[28];
  const shoulderWidth = Math.abs(leftS.x - rightS.x);
  if (shoulderWidth < 0.045) return null; // Insufficient frontal view.
  const ankleWidth = Math.abs(leftA.x - rightA.x);
  const armsHigh = leftW.y < leftS.y - 0.08 && rightW.y < rightS.y - 0.08;
  const armsLow = leftW.y > leftS.y + 0.13 && rightW.y > rightS.y + 0.13;
  const legsWide = ankleWidth > shoulderWidth * 1.55;
  const legsClose = ankleWidth < shoulderWidth * 1.25;
  if (armsHigh && legsWide) return 'open';
  if (armsLow && legsClose) return 'closed';
  return 'transition';
}

/**
 * Hysteresis-style exercise counter. Signals must remain stable for 140ms,
 * reducing double-counts from landmark jitter. One full cycle -> one rep.
 */
export class RepCounter {
  constructor(exercise = 'squat') { this.reset(exercise); }
  reset(exercise = this.exercise) {
    this.exercise = exercise;
    this.phase = 'start';
    this.candidate = null;
    this.candidateSince = 0;
    this.lastRepAt = -Infinity;
    this.reps = 0;
  }
  update(points, nowMs) {
    if (this.exercise === 'plank') return { reps: this.reps, signal: null, counted: false };
    const raw = this.exercise === 'squat' ? squatSignal(points) : jackSignal(points);
    const desired = this.exercise === 'squat'
      ? (raw === null ? null : raw < 112 ? 'down' : raw > 155 ? 'up' : 'transition')
      : raw;
    if (!desired || desired === 'transition') {
      this.candidate = null;
      return { reps: this.reps, signal: raw, counted: false };
    }
    if (desired !== this.candidate) {
      this.candidate = desired;
      this.candidateSince = nowMs;
      return { reps: this.reps, signal: raw, counted: false };
    }
    if (nowMs - this.candidateSince < 140) return { reps: this.reps, signal: raw, counted: false };
    let counted = false;
    const first = this.exercise === 'squat' ? 'down' : 'open';
    const second = this.exercise === 'squat' ? 'up' : 'closed';
    if (this.phase === 'start') {
      if (desired === second) this.phase = 'ready';
      else if (desired === first) this.phase = 'loaded';
    } else if (this.phase === 'ready' && desired === first) {
      this.phase = 'loaded';
    } else if (this.phase === 'loaded' && desired === second) {
      this.phase = 'ready';
      if (nowMs - this.lastRepAt >= 650) {
        this.reps += 1;
        this.lastRepAt = nowMs;
        counted = true;
      }
    }
    return { reps: this.reps, signal: raw, counted };
  }
  suspend() {
    this.phase = 'start';
    this.candidate = null;
    this.candidateSince = 0;
  }
  adjust(delta) {
    this.reps = Math.max(0, this.reps + delta);
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
