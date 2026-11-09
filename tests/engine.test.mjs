import test from 'node:test';
import assert from 'node:assert/strict';
import { RepCounter, angleDegrees, squatSignal, jackSignal, inspectMovement, parseVoiceCommand, suggestTarget, weeklySummary } from '../engine.mjs';

const point = (x,y) => ({ x,y,visibility:0.99 });
function squatPose(bent) {
  const pts = Array(33).fill(null);
  const hip=point(.5,.30), knee=point(.5,.57), ankle=bent?point(.27,.57):point(.5,.83);
  for(const [h,k,a] of [[23,25,27],[24,26,28]]){pts[h]=hip;pts[k]=knee;pts[a]=ankle;}
  return pts;
}
function jackPose(open) {
  const pts=Array(33).fill(null);
  pts[11]=point(.41,.3);pts[12]=point(.59,.3);
  pts[15]=point(.30,open?.08:.55);pts[16]=point(.70,open?.08:.55);
  pts[27]=point(open?.20:.45,.88);pts[28]=point(open?.80:.55,.88);
  return pts;
}
test('geometry angle at a knee: straight and bent',()=>{
  assert.equal(Math.round(angleDegrees(point(0,-1),point(0,0),point(0,1))),180);
  assert.equal(Math.round(angleDegrees(point(0,-1),point(0,0),point(-1,0))),90);
});
test('squat signal distinguishes a bent from straight knee',()=>{
  assert.ok(squatSignal(squatPose(true))<112);
  assert.ok(squatSignal(squatPose(false))>155);
});
test('squat rep counted after stable down-up cycle',()=>{
  const c=new RepCounter('squat');
  c.update(squatPose(false),0);c.update(squatPose(false),150);
  c.update(squatPose(true),300);c.update(squatPose(true),460);
  c.update(squatPose(false),800);
  assert.equal(c.update(squatPose(false),960).reps,1);
});
test('unsteady frames do not create phantom reps',()=>{
  const c=new RepCounter('squat');
  c.update(squatPose(true),0);c.update(squatPose(false),40);
  c.update(squatPose(true),90);c.update(squatPose(false),130);
  assert.equal(c.reps,0);
});
test('jack signal and rep cycle',()=>{
  const c=new RepCounter('jack');
  assert.equal(jackSignal(jackPose(true)),'open');
  assert.equal(jackSignal(jackPose(false)),'closed');
  c.update(jackPose(false),0);c.update(jackPose(false),180);
  c.update(jackPose(true),240);c.update(jackPose(true),420);
  c.update(jackPose(false),700);c.update(jackPose(false),890);
  assert.equal(c.reps,1);
});
test('adaptive target recommends lower target for a difficult workout',()=>{
  assert.equal(suggestTarget([{exercise:'squat',target:10,completed:6,exertion:9}], 'squat').target,8);
});
test('adaptive target increases slightly after an easy complete workout',()=>{
  assert.equal(suggestTarget([{exercise:'squat',target:10,completed:10,exertion:3}],'squat').target,12);
});
test('voice commands are parsed',()=>{
  assert.equal(parseVoiceCommand('make it easier, I am struggling').action,'easier');
  assert.equal(parseVoiceCommand('start workout').action,'start');
  assert.equal(parseVoiceCommand('how many reps left?').action,'progress');
  assert.equal(parseVoiceCommand('finish workout').action,'finish');
  assert.deepEqual(parseVoiceCommand('switch to jumping jacks'),{action:'exercise',exercise:'jack'});
});

test('rep correction never drops below zero and clears stale half-reps', () => {
 const c=new RepCounter('squat');
 assert.equal(c.adjust(-1),0);
 assert.equal(c.manual(),1);
 assert.equal(c.adjust(-1),0);
 c.update(squatPose(false),0);c.update(squatPose(false),150);
 c.update(squatPose(true),300);c.update(squatPose(true),460);
 c.suspend();c.update(squatPose(false),800);c.update(squatPose(false),960);
 assert.equal(c.reps,0);
});
test('voice handles pause, correction and weekly history', () => {
 assert.equal(parseVoiceCommand('stop').action,'pause');
 assert.equal(parseVoiceCommand('stop workout').action,'finish');
 assert.equal(parseVoiceCommand('I need a break').action,'pause');
 assert.equal(parseVoiceCommand('undo the last rep').action,'undo');
 assert.equal(parseVoiceCommand('how was my week').action,'weekly');
});
test('weekly summary excludes older sessions', () => {
 const now=new Date('2026-11-08T12:00:00Z');
 const result=weeklySummary([
 {at:'2026-11-07T12:00:00Z',exercise:'squat',completed:10,duration:60},
 {at:'2026-11-04T12:00:00Z',exercise:'plank',completed:20,duration:30},
 {at:'2026-10-20T12:00:00Z',exercise:'jack',completed:100,duration:600},
 {at:'unknown',exercise:'squat',completed:30,duration:50}
 ],now);
 assert.deepEqual(result,{sessions:2,reps:10,minutes:2});
});

test('squat inspector exposes numeric landmark diagnostic and posture', () => {
  const upright=inspectMovement(squatPose(false),'squat');
  const bent=inspectMovement(squatPose(true),'squat');
  assert.equal(upright.position,'up');
  assert.equal(bent.position,'down');
  assert.match(bent.detail,/Knee/);
});
test('fast jumping-jack cycle is counted with two samples per pose', () => {
  const c=new RepCounter('jack');
  c.update(jackPose(false),0);
  c.update(jackPose(false),45);
  c.update(jackPose(true),100);
  c.update(jackPose(true),145);
  c.update(jackPose(false),240);
  const result=c.update(jackPose(false),285);
  assert.equal(result.reps,1);
});
test('unknown landmarks provide meaningful debugging feedback', () => {
  const c=new RepCounter('squat');
  const x=c.update(Array(33).fill(null),500);
  assert.equal(x.counted,false);
  assert.match(x.detail,/landmarks unclear/);
});
