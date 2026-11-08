import test from 'node:test';
import assert from 'node:assert/strict';
import { RepCounter, angleDegrees, squatSignal, jackSignal, parseVoiceCommand, suggestTarget } from '../engine.mjs';

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
