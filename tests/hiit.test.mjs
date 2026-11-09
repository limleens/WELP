import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanProfile,buildHiitPlan,estimateKcal,HiitSession,parseCoachRequest} from '../hiit.mjs';
const profile={goal:'general',level:'beginner',intensity:'moderate',minutes:5,weightKg:65};
test('profile sanitizes unexpected inputs and weight is optional',()=>{
  assert.deepEqual(cleanProfile({level:'expert',minutes:100,weightKg:'-1'}),{goal:'general',level:'beginner',intensity:'moderate',minutes:5,weightKg:null});
});
test('HIIT plan alternates work and rest, ending on work',()=>{
  const p=buildHiitPlan(profile);
  assert.ok(p.stages.length>=5);
  assert.ok(Math.abs(p.totalSeconds-300)<=100);
  assert.ok(p.stages.every((stage,i)=>stage.kind===(i%2===0?'work':'rest')));
  assert.ok(p.totalSeconds>p.workSeconds);
});
test('HIIT plan responds to goal and longer duration',()=>{
  const p=buildHiitPlan({...profile,goal:'cardio',minutes:8});
  assert.equal(p.stages[0].exercise,'jack');
  assert.ok(p.stages.length>buildHiitPlan(profile).stages.length);
});
test('difficult previous workout makes next circuit gentler',()=>{
  const base=buildHiitPlan(profile);
  const after=buildHiitPlan(profile,[{exercise:'squat',target:10,completed:5,exertion:9}]);
  assert.ok(after.workSeconds < base.workSeconds);
  assert.ok(after.totalSeconds > after.workSeconds);
});
test('session advances and completes automatically when intervals expire',()=>{
  const s=new HiitSession({profile,stages:[{kind:'work',exercise:'squat',seconds:2},{kind:'rest',seconds:1},{kind:'work',exercise:'jack',seconds:2}]});
  s.start(0);
  assert.equal(s.tick(2000)[0].type,'stage');
  assert.equal(s.stage.kind,'rest');
  assert.equal(s.tick(3000)[0].type,'stage');
  assert.equal(s.stage.exercise,'jack');
  assert.equal(s.tick(5000)[0].type,'completed');
  assert.equal(s.status,'complete');
  assert.equal(s.activeSeconds,4);
  assert.equal(s.restSeconds,1);
});
test('pause freezes countdown and resume does not count paused time',()=>{
  const s=new HiitSession({profile,stages:[{kind:'work',exercise:'squat',seconds:20}]});
  s.start(1000);s.pause(3000);
  assert.equal(s.remaining,18);
  s.tick(25000);assert.equal(s.remaining,18);
  s.start(26000);s.tick(27000);assert.equal(s.remaining,17);
});
test('rest extension extends existing rest',()=>{
  const s=new HiitSession({profile,stages:[{kind:'rest',seconds:20}]});
  s.start(0);assert.equal(s.extendRest(15),true);
  assert.equal(s.remaining,35);
});
test('taking a break preserves unfinished work',()=>{
  const s=new HiitSession({profile,stages:[{kind:'work',exercise:'jack',seconds:25},{kind:'rest',seconds:10}]});
  s.start(0);
  for(let t=1000;t<=5000;t+=1000)s.tick(t);
  s.takeBreak(5000,15);
  assert.equal(s.stage.kind,'rest');assert.equal(s.remaining,15);
  s.tick(7000);s.tick(9000);s.tick(11000);s.tick(13000);s.tick(15000);s.tick(17000);s.tick(19000);s.tick(21000);
  assert.equal(s.stage.kind,'work');assert.equal(s.stage.seconds,20);
});
test('make easier reduces remaining work and extends future rest',()=>{
  const s=new HiitSession({profile,stages:[{kind:'work',exercise:'squat',seconds:30},{kind:'rest',seconds:20}]});
  s.start(0);s.makeEasier();
  assert.equal(s.remaining,24);
  assert.equal(s.stages[1].seconds,25);
});
test('rough calorie estimate needs voluntary valid weight',()=>{
  assert.equal(estimateKcal(null,60),null);
  assert.ok(estimateKcal(65,120,'challenging')>estimateKcal(65,120,'light'));
});
test('natural requests cover check-in, safety, rest and next',()=>{
  assert.equal(parseCoachRequest("I'm exhausted, can we slow down?").action,'struggling');
  assert.equal(parseCoachRequest("could I take a break?").action,'break');
  assert.equal(parseCoachRequest("what's coming up next?").action,'next');
  assert.equal(parseCoachRequest("yes please",'break').action,'break');
  assert.equal(parseCoachRequest("no, keep going",'break').action,'decline');
  assert.equal(parseCoachRequest("I feel dizzy").action,'safety');
});

test('comfortable completed session yields a small bounded progression',()=>{
  const previous=[{target:11,completed:11,exertion:3}];
  const base=buildHiitPlan(profile);
  const next=buildHiitPlan(profile,previous);
  assert.ok(next.workSeconds > base.workSeconds);
  assert.match(next.rationale,/comfortably/);
});
test('spoken request variants map to bounded session actions',()=>{
  assert.equal(parseCoachRequest('how am I doing?').action,'progress');
  assert.equal(parseCoachRequest('can you repeat the instructions?').action,'instructions');
  assert.equal(parseCoachRequest('how many calories have I burned?').action,'calories');
  assert.equal(parseCoachRequest('can we do a different exercise?').action,'skip');
});

test('custom rep-target set is inserted after recovery, not on top of current work',()=>{
  const session=new HiitSession({profile,stages:[
    {kind:'work',exercise:'squat',seconds:30},
    {kind:'rest',seconds:20},
    {kind:'work',exercise:'jack',seconds:30}
  ]});
  session.start(0);
  assert.equal(session.addExercise('jack',{targetReps:10}),true);
  assert.equal(session.stages[2].exercise,'jack');
  assert.equal(session.stages[2].targetReps,10);
  assert.equal(session.stages[3].kind,'rest');
});
test('rest durations can be shortened or extended but not below safe minimum',()=>{
  const session=new HiitSession({profile,stages:[
    {kind:'work',exercise:'squat',seconds:25},
    {kind:'rest',seconds:30},
    {kind:'work',exercise:'jack',seconds:25}
  ]});
  session.start(0);
  assert.equal(session.adjustRests(-100),true);
  assert.equal(session.stages[1].seconds,8);
  assert.equal(session.adjustRests(15),true);
  assert.equal(session.stages[1].seconds,23);
});
test('harder request increases bounded work and reduces rest',()=>{
  const session=new HiitSession({profile,stages:[
    {kind:'work',exercise:'squat',seconds:30},
    {kind:'rest',seconds:20}
  ]});
  session.start(0);
  session.makeHarder();
  assert.equal(session.remaining,35);
  assert.equal(session.stages[1].seconds,15);
});

test('live recovery progress remains bounded after voice shortens or extends rest',()=>{
  const session=new HiitSession({profile,stages:[{kind:'rest',seconds:30}]});
  session.start(0);session.tick(1000);
  assert.equal(session.remaining,29);
  session.adjustRests(-10);
  assert.equal(session.remaining,19);
  assert.ok(session.stage.seconds>=session.remaining);
  session.extendRest(15);
  assert.equal(session.remaining,34);
  assert.ok(session.stage.seconds>=session.remaining);
  const fraction=1-session.remaining/session.stage.seconds;
  assert.ok(fraction>=0&&fraction<=1);
});
