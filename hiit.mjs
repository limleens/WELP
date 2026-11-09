/** HIIT planning/session logic. Browser-independent for reproducible tests. */
export const HIIT_EXERCISES = Object.freeze({
  squat: {name:'Bodyweight squats',cue:'Stand side-on so hips, knees and ankles are visible. Keep movements comfortable.',type:'reps'},
  jack: {name:'Jumping jacks',cue:'Face your camera and keep wrists and ankles visible. Step out instead of jumping if preferred.',type:'reps'},
  plank: {name:'Plank hold',cue:'Use a comfortable supported plank. WELP only times this exercise; it does not check form.',type:'timed'},
});
export const DEFAULT_PROFILE = Object.freeze({goal:'general',level:'beginner',intensity:'moderate',minutes:5,weightKg:null});
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export function cleanProfile(raw={}) {
  const goals=['general','cardio','strength','weight'];
  const levels=['beginner','intermediate','advanced'];
  const intensities=['light','moderate','challenging'];
  const weight=Number(raw.weightKg);
  return {
    goal:goals.includes(raw.goal)?raw.goal:'general',
    level:levels.includes(raw.level)?raw.level:'beginner',
    intensity:intensities.includes(raw.intensity)?raw.intensity:'moderate',
    minutes:[5,8,12].includes(Number(raw.minutes))?Number(raw.minutes):5,
    weightKg:raw.weightKg!==null && raw.weightKg!=='' && Number.isFinite(weight) && weight>=30 && weight<=250?weight:null,
  };
}
export function buildHiitPlan(profile=DEFAULT_PROFILE, history=[]) {
  const p=cleanProfile(profile);
  const intensitySeconds={light:20,moderate:30,challenging:40};
  const levelAdd={beginner:-5,intermediate:0,advanced:5};
  const workSec=clamp(intensitySeconds[p.intensity]+levelAdd[p.level],15,45);
  const restSec=p.intensity==='challenging'?20:p.intensity==='moderate'?25:30;
  // Choose a whole number of 3-exercise rounds near the requested duration.
  const nRounds=Array.from({length:7},(_,i)=>i+1).reduce((best,n)=>
    Math.abs(3*n*workSec+(3*n-1)*restSec-p.minutes*60)<Math.abs(3*best*workSec+(3*best-1)*restSec-p.minutes*60)?n:best,1);
  const orders={
    general:['squat','jack','plank'],
    cardio:['jack','squat','jack'],
    strength:['squat','plank','squat'],
    weight:['jack','squat','plank']
  };
  const latest=history.filter(h=>h && h.exertion!=null).slice(-1)[0];
  const completion=latest?Number(latest.completed)/Math.max(1,Number(latest.target)||1):null;
  const struggling=latest && (Number(latest.exertion)>=8 || completion<.75);
  const comfortable=latest && !struggling && completion>=1 && Number(latest.exertion)<=4;
  const adjustment=struggling?0.85:comfortable?1.05:1;
  const stages=[];
  for(let round=0;round<nRounds;round++) {
    for(const exercise of orders[p.goal]) {
      stages.push({kind:'work',exercise,seconds:clamp(Math.round(workSec*adjustment),12,50),round:round+1});
      stages.push({kind:'rest',seconds:restSec+(struggling?5:0),round:round+1});
    }
  }
  // A rest is unnecessary after the last exercise.
  stages.pop();
  return {profile:p,stages,workSeconds:stages.filter(s=>s.kind==='work').reduce((n,s)=>n+s.seconds,0),
    totalSeconds:stages.reduce((n,s)=>n+s.seconds,0),
    rationale:struggling?'Last session felt tough, so work intervals are shorter and breaks are longer.':comfortable?'You completed your last circuit comfortably, so work intervals are slightly longer.':'Built around your preferred goal, level and intensity.'};
}
export function estimateKcal(weightKg, activeSeconds, intensity='moderate') {
  const kg=Number(weightKg);
  if(!Number.isFinite(kg)||kg<30||kg>250) return null;
  // Rough MET-based estimate for *active time only*, not a measured calorie value.
  const met={light:3.5,moderate:5.0,challenging:7.0}[intensity]??5.0;
  return Math.round(met*3.5*kg/200*(Math.max(0,activeSeconds)/60));
}
export class HiitSession {
  constructor(plan) {
    if(!plan?.stages?.length) throw new Error('HIIT plan must contain stages');
    this.stages=plan.stages.map(x=>({...x}));
    this.profile=plan.profile;
    this.index=0;
    this.remaining=this.stages[0].seconds;
    this.status='ready';
    this.lastMs=null;
    this.activeSeconds=0;
    this.restSeconds=0;
    this.elapsedSeconds=0;
    this.completedStages=0;
  }
  get stage() {return this.stages[this.index]??null;}
  start(now) {
    if(this.status==='complete') return [];
    if(this.status==='active') return [];
    this.status='active';this.lastMs=now;
    return [{type:'started',stage:this.stage}];
  }
  pause(now) {
    const events=this.tick(now);
    if(this.status==='active') {this.status='paused';this.lastMs=null;events.push({type:'paused'});}
    return events;
  }
  tick(now) {
    if(this.status!=='active') return [];
    let delta=Math.max(0,(now-this.lastMs)/1000);
    this.lastMs=now;
    const events=[];
    // Cap pathological sleeping-tab gaps; a hidden browser must not skip the workout.
    delta=Math.min(delta,2);
    while(delta>0 && this.status==='active') {
      const spent=Math.min(delta,this.remaining);
      this.remaining-=spent;delta-=spent;
      this.elapsedSeconds+=spent;
      if(this.stage.kind==='work') this.activeSeconds+=spent;
      else this.restSeconds+=spent;
      if(this.remaining <= 1e-7) {
        this.completedStages++;
        this.index++;
        if(!this.stage) {
          this.remaining=0;this.status='complete';this.lastMs=null;
          events.push({type:'completed'});
        } else {
          this.remaining=this.stage.seconds;
          events.push({type:'stage',stage:this.stage,index:this.index});
        }
      }
    }
    return events;
  }
  extendRest(seconds=15) {
    if(this.status!=='active'&&this.status!=='paused') return false;
    if(this.stage?.kind!=='rest') return false;
    this.remaining+=clamp(Math.round(seconds),5,120);
    return true;
  }
  takeBreak(now, seconds=25) {
    if(this.status==='active') this.tick(now);
    if(!['active','paused'].includes(this.status)) return false;
    if(this.stage.kind==='rest') return this.extendRest(seconds);
    // Preserve the unfinished work interval for after the break.
    this.stages[this.index].seconds=this.remaining;
    this.stages.splice(this.index,0,{kind:'rest',seconds:clamp(seconds,10,90),round:this.stage.round,extra:true});
    this.remaining=this.stage.seconds;
    return true;
  }
  makeEasier() {
    if(!['active','paused','ready'].includes(this.status)) return;
    for(let i=this.index;i<this.stages.length;i++) {
      const stage=this.stages[i];
      stage.seconds=stage.kind==='work'?Math.max(10,Math.round(stage.seconds*.8)):stage.seconds+5;
    }
    this.remaining=this.stage.kind==='work'?Math.max(8,Math.round(this.remaining*.8)):this.remaining+5;
  }
  makeHarder() {
    if(!['active','paused','ready'].includes(this.status))return false;
    for(let i=this.index;i<this.stages.length;i++) {
      const stage=this.stages[i];
      if(stage.kind==='work' && !stage.targetReps) {
        stage.seconds=clamp(stage.seconds+5,10,60);
        if(i===this.index)this.remaining=Math.min(60,this.remaining+5);
      } else if(stage.kind==='rest') {
        stage.seconds=clamp(stage.seconds-5,8,120);
        if(i===this.index)this.remaining=Math.max(8,this.remaining-5);
      }
    }
    return true;
  }
  adjustRests(deltaSeconds) {
    if(!['ready','active','paused'].includes(this.status))return false;
    const delta=clamp(Math.round(Number(deltaSeconds)||0),-60,60);
    let updated=false;
    for(let i=this.index;i<this.stages.length;i++) {
      const item=this.stages[i];
      if(item.kind!=='rest')continue;
      const original=i===this.index?this.remaining:item.seconds;
      const adjusted=clamp(Math.round(original+delta),8,120);
      if(i===this.index)this.remaining=adjusted;
      else item.seconds=adjusted;
      updated=true;
    }
    return updated;
  }
  addExercise(exercise,{targetReps=null,seconds=30}={}) {
    if(!['ready','active','paused'].includes(this.status))return false;
    if(!['squat','jack','plank'].includes(exercise)||this.stages.length>70)return false;
    const target=targetReps==null?null:clamp(Math.round(targetReps),3,40);
    const work={kind:'work',exercise,seconds:target?120:clamp(Math.round(seconds),15,60),
      targetReps:target,extra:true,round:this.stage?.round||1};
    // Insert after the upcoming scheduled recovery when one exists.
    const next=this.stages[this.index+1];
    const insertAt=this.index+1+(this.stage?.kind==='work'&&next?.kind==='rest'?1:0);
    this.stages.splice(insertAt,0,work);
    // If another work interval immediately follows, add a small rest after the new interval.
    if(this.stages[insertAt+1]?.kind==='work')
      this.stages.splice(insertAt+1,0,{kind:'rest',seconds:20,extra:true,round:work.round});
    return true;
  }
  skip(now) {
    if(this.status==='active') this.tick(now);
    if(!['active','paused'].includes(this.status)) return [];
    this.completedStages++;
    this.index++;
    if(!this.stage){this.remaining=0;this.status='complete';this.lastMs=null;return [{type:'completed'}];}
    this.remaining=this.stage.seconds;
    return [{type:'stage',stage:this.stage,index:this.index}];
  }
}
export function parseCoachRequest(transcript='',pending=null) {
  const s=transcript.toLowerCase().replace(/[’]/g,"'").trim();
  if(!s) return {action:'unknown'};
  if(/\b(dizzy|faint|chest pain|cannot breathe|can't breathe|feeling faint)\b/.test(s)) return {action:'safety'};
  if(pending==='break' && /\b(yes|yeah|please|sure|okay|ok|go ahead)\b/.test(s)) return {action:'break'};
  if(pending==='break' && /\b(no|nah|not now|keep going)\b/.test(s)) return {action:'decline'};
  if(/\b(stop|end|finish) (the |this |my )?(whole )?(workout|session|circuit)\b/.test(s) || /^i('m| am) done$/.test(s))return {action:'finish'};
  if(/\b(pause|hold on|wait a sec|wait a second)\b/.test(s)||s==='stop')return {action:'pause'};
  if(/\b(resume|continue|keep going|let's go|lets go)\b/.test(s))return {action:'resume'};
  if(/\b(take a break|need a break|want a break|rest now|break please|catch my breath|pause for a bit)\b/.test(s))return {action:'break'};
  if(/\b(longer break|more rest|extra rest|more time to rest|extend the break|another (ten|twenty|thirty|[0-9]+) seconds)\b/.test(s))return {action:'rest_longer'};
  if(/\b(skip|next exercise|move on|do a different (one|exercise)|switch (this|the) exercise)\b/.test(s))return {action:'skip'};
  if(/\b(struggling|too hard|too much|exhausted|worn out|can't keep up|cannot keep up|not sure i can finish|tired|easier|slow down|slower pace|less intense)\b/.test(s))return {action:'struggling'};
  if(/\b(harder|too easy|more intense|challenge me)\b/.test(s))return {action:'harder'};
  if(/\b(what('s| is) next|next up|coming up)\b/.test(s))return {action:'next'};
  if(/\b(repeat|explain|how do i do|what (exercise|are we) doing|instructions)\b/.test(s))return {action:'instructions'};
  if(/\b(how many calories|calories burned|energy burned)\b/.test(s))return {action:'calories'};
  if(/\b(how long|time left|much longer|remaining time|how many seconds)\b/.test(s))return {action:'time'};
  if(/\b(how many (reps|squats|jacks)|reps (left|done)|my progress|how am i doing|how are we doing)\b/.test(s))return {action:'progress'};
  if(/\b(undo|remove last rep|that wasn't a rep)\b/.test(s))return {action:'undo'};
  if(/\b(start|begin|ready|let's begin|lets begin)\b/.test(s))return {action:'start'};
  if(/\b(help|what can i say|what do you understand)\b/.test(s))return {action:'help'};
  return {action:'unknown'};
}
