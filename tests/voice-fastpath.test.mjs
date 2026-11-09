import test from 'node:test';
import assert from 'node:assert/strict';
import {fastCoachDecision,shortStageCue,conciseCoachReply} from '../voice-fastpath.mjs';

test('urgent and common workout requests run locally without Gemini',()=>{
  assert.equal(fastCoachDecision('please pause the workout').action,'pause');
  assert.equal(fastCoachDecision('resume').action,'resume');
  assert.equal(fastCoachDecision('I need a break').action,'take_break');
  assert.equal(fastCoachDecision('shorten my breaks by 15 seconds').action,'shorten_rest');
  assert.equal(fastCoachDecision('make it easier').action,'easier');
});
test('spoken rep targets are understood locally',()=>{
  const a=fastCoachDecision('can you please track ten more jumping jacks?');
  assert.equal(a.action,'track_reps');
  assert.equal(a.exercise,'jack');
  assert.equal(a.reps,10);
});
test('unrecognized conversations can use the Gemini fallback',()=>{
  assert.equal(fastCoachDecision('tell me something interesting'),null);
  assert.equal(fastCoachDecision("I don't want to stop my workout"),null);
  assert.equal(fastCoachDecision(''),null);
});
test('spoken prompts are short enough for workout audio',()=>{
  assert.equal(shortStageCue({kind:'work',exercise:'squat',seconds:25}),"Squats, 25 seconds. Let's go!");
  assert.equal(shortStageCue({kind:'work',exercise:'jack',seconds:120,targetReps:10}),"Jumping jacks. 10 reps. Let's go!");
  assert.equal(shortStageCue({kind:'rest',seconds:20},{exercise:'plank'}),'Rest for 20 seconds. Next: plank.');
  const reply=conciseCoachReply(Array(50).fill('word').join(' '));
  assert.ok(reply.split(' ').length<=22);
});
