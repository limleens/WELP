/** Low-latency speech policies: inspired by streaming voice-agent turn management,
 * but self-contained; no third-party source code has been copied.
 */
import {fallbackCoachReply,validateCoachResponse} from './coach-actions.mjs';

export const QUICK_ACTIONS = new Set([
  'start','pause','resume','finish','skip','easier','harder','take_break',
  'extend_rest','shorten_rest','add_interval','track_reps','status','next',
  'instructions','feeling_good','feeling_tired','safety'
]);

/** Execute unambiguous, time-sensitive workout requests without network latency.
 * A Gemini call is reserved for unknown/ambiguous conversational expressions.
 */
export function fastCoachDecision(transcript, context={}) {
  const raw=String(transcript||'').trim();
  if(!raw)return null;
  // Avoid interpreting a negated command as an instruction to end exercise.
  if(/\b(don't|do not|never|shouldn't)\s+(?:want to\s+)?(?:stop|finish|end|pause|skip)\b/i.test(raw))return null;
  const proposed=validateCoachResponse(fallbackCoachReply(raw,context));
  return QUICK_ACTIONS.has(proposed.action)?proposed:null;
}

/** Audio cues must be short: long sentences lock out Web Speech recognition
 * in browsers which cannot recognize audio while speaking.
 */
export function shortStageCue(stage, next=null) {
  if(!stage)return 'Nice work. Workout complete.';
  const seconds=Math.max(0,Math.ceil(Number(stage.seconds)||0));
  if(stage.kind==='rest') {
    const nextText=next?.exercise==='jack'?'jumping jacks':next?.exercise==='squat'?'squats':next?.exercise==='plank'?'plank':'the next exercise';
    return `Rest for ${seconds} seconds. Next: ${nextText}.`;
  }
  const exercise=stage.exercise==='jack'?'Jumping jacks':stage.exercise==='squat'?'Squats':'Plank';
  if(stage.targetReps)return `${exercise}. ${stage.targetReps} reps. Let's go!`;
  return `${exercise}, ${seconds} seconds. Let's go!`;
}

/** A short response reduces time during which the mic is gated by TTS. */
export function conciseCoachReply(reply,maxWords=22) {
  const words=String(reply||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
  return words.slice(0,maxWords).join(' ')+(words.length>maxWords?'…':'');
}
