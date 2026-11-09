/** Structured, constrained actions for the workout controller.
 * Gemini proposes an action; the controller validates it before execution.
 */
export const ACTIONS = Object.freeze([
  'none','start','pause','resume','finish','skip','easier','harder',
  'take_break','extend_rest','shorten_rest','add_interval','track_reps',
  'status','next','instructions','feeling_good','feeling_tired','safety'
]);
export const EXERCISE_NAMES = Object.freeze(['squat','jack','plank']);
const between=(n,min,max)=>Math.max(min,Math.min(max,n));
const mapExercise=(raw='')=>{
  const s=String(raw).toLowerCase();
  if(/jump|jack/.test(s))return 'jack';
  if(/squat/.test(s))return 'squat';
  if(/plank/.test(s))return 'plank';
  return null;
};
/** Never trust actions returned by the model, including duration and rep counts. */
export function validateCoachResponse(raw) {
  const data=raw && typeof raw==='object'?raw:{};
  const action=ACTIONS.includes(data.action)?data.action:'none';
  const exercise=mapExercise(data.exercise);
  const requested=Number(data.reps);
  const reps=Number.isFinite(requested)?between(Math.round(requested),3,40):10;
  const seconds=Number.isFinite(Number(data.seconds))?between(Math.round(Number(data.seconds)),5,60):15;
  const reply=typeof data.reply==='string'
    ?data.reply.replace(/[\x00-\x1f]/g,' ').slice(0,260).trim()
    :'';
  return {
    action:((action==='add_interval'||action==='track_reps')&&!exercise)?'none':action,
    exercise,reps,seconds,reply
  };
}
export function fallbackCoachReply(transcript,ctx={}) {
  const t=String(transcript).toLowerCase().replace(/[’]/g,"'");
  const e=mapExercise(t);
  const count=(t.match(/\b(\d{1,2})\s*(?:more\s*)?(?:reps?|jumping jacks?|squats?)\b/)||[])[1];
  const reps=count?between(Number(count),3,40):10;
  const sec=(t.match(/\b(\d{1,2})\s*(?:more\s*)?(?:seconds?|secs?)\b/)||[])[1];
  const seconds=sec?between(Number(sec),5,60):15;
  const pending=ctx.pending;
  if(/\b(chest pain|dizzy|faint|can't breathe|cannot breathe|severe pain)\b/.test(t))
    return {action:'safety',reply:'Stop exercising and take a rest. If symptoms are serious, get urgent help.'};
  if(pending==='feeling' && /\b(good|fine|okay|ok|great|easy|not bad)\b/.test(t))
    return {action:'feeling_good',reply:"Glad you're feeling good. We're keeping a sensible pace."};
  if(pending==='feeling' && /\b(tired|hard|exhausted|struggling|worn out|rough)\b/.test(t))
    return {action:'feeling_tired',reply:"Thanks for telling me. I'll ease the next intervals and give you more recovery."};
  if(pending==='break' && /^(yes|yeah|sure|please|okay|ok)\b/.test(t))
    return {action:'take_break',reply:'Sure. Take a moment to catch your breath.'};
  if(/\b(add|another|extra|more)\b/.test(t) && e && /\b(interval|set|round|exercise|squats?|jacks?)\b/.test(t))
    return {action:count?'track_reps':'add_interval',exercise:e,reps,reply:count?`Got it, adding ${reps} ${e==='jack'?'jumping jacks':'squats'} to your circuit.`:'Sure, I added another exercise interval.'};
  if(/\b(track|count|do)\b/.test(t) && e && count)
    return {action:'track_reps',exercise:e,reps,reply:`Absolutely, let's do ${reps} ${e==='jack'?'jumping jacks':'squats'}.`};
  if(/\b(shorter|shorten|reduce|less)\b/.test(t) && /\b(breaks?|rests?)\b/.test(t))
    return {action:'shorten_rest',seconds,reply:`Okay, I'll shorten your rest by ${seconds} seconds.`};
  if(/\b(longer|extend|increase|more)\b/.test(t) && /\b(breaks?|rests?)\b/.test(t))
    return {action:'extend_rest',seconds,reply:`No problem, I'll add ${seconds} seconds of recovery.`};
  if(/\b(need|want|take|give me)\b/.test(t) && /\b(breaks?|rests?|breather)\b/.test(t))
    return {action:'take_break',reply:"Absolutely. Let's take a breather."};
  if(/\b(too easy|harder|more intense|push me)\b/.test(t))
    return {action:'harder',reply:"You got it. I'll give you a small, controlled challenge."};
  if(/\b(too hard|tired|exhausted|struggling|easier|slow down|less intense)\b/.test(t))
    return {action:'easier',reply:"Got you. I'll dial it back and give you longer breaks."};
  if(/\b(finish|end|stop)\b/.test(t) && /\b(workout|session|circuit)\b/.test(t))
    return {action:'finish',reply:"Okay, let's wrap up your session."};
  if(/^(pause|stop|hold on|wait)$/i.test(t.trim())) return {action:'pause',reply:"Pausing for you."};
  if(/\b(resume|continue|keep going)\b/.test(t))return {action:'resume',reply:"All right, let's keep moving."};
  if(/\b(start|let's go|begin|ready)\b/.test(t))return {action:'start',reply:"Let's do this!"};
  if(/\b(skip|move on|next exercise)\b/.test(t))return {action:'skip',reply:"Okay, moving on."};
  if(/\b(what('s| is) next|coming up)\b/.test(t))return {action:'next',reply:"Let's check what's next."};
  if(/\b(repeat|how do i|instructions|explain)\b/.test(t))return {action:'instructions',reply:"Here's how to do this one."};
  if(/\b(how (much|long)|time left|reps|progress|how am i doing)\b/.test(t))return {action:'status',reply:"Here's your progress."};
  return {action:'none',reply:"I'm here with you. You can ask to adjust your workout, add an exercise, or take a break."};
}
