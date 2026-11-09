import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCoachResponse,fallbackCoachReply} from '../coach-actions.mjs';
import {askGemini,createWelpServer,sanitizeCoachContext,synthesizeGemini} from '../server.mjs';

test('natural requests create meaningful bounded workout actions',()=>{
  assert.deepEqual(fallbackCoachReply('please help me track 10 more jumping jacks').action,'track_reps');
  const x=validateCoachResponse(fallbackCoachReply('track 10 more jumping jacks'));
  assert.equal(x.exercise,'jack');assert.equal(x.reps,10);
  assert.equal(validateCoachResponse(fallbackCoachReply('add another set of squats')).action,'add_interval');
  assert.equal(validateCoachResponse(fallbackCoachReply('can we shorten the break by 20 seconds?')).action,'shorten_rest');
  assert.equal(validateCoachResponse(fallbackCoachReply('can I have a longer break?')).action,'extend_rest');
  assert.equal(validateCoachResponse(fallbackCoachReply('I feel dizzy')).action,'safety');
  assert.equal(validateCoachResponse(fallbackCoachReply('I feel a bit tired',{pending:'feeling'})).action,'feeling_tired');
  assert.equal(validateCoachResponse(fallbackCoachReply('I feel good',{pending:'feeling'})).action,'feeling_good');
});
test('malformed or unsafe model parameters are ignored or clamped',()=>{
  const z=validateCoachResponse({action:'execute_code',exercise:'jack',reps:5000,seconds:1000,reply:'Hi\nthere'});
  assert.equal(z.action,'none');assert.equal(z.reps,40);assert.equal(z.seconds,60);
  assert.equal(z.reply,'Hi there');
  assert.equal(validateCoachResponse({action:'track_reps',exercise:'handstand'}).action,'none');
  assert.equal(validateCoachResponse({action:'track_reps',exercise:'squat',reps:-20}).reps,3);
});
test('cloud context is small, ignores private data, and normalizes statuses',()=>{
  const ctx=sanitizeCoachContext({status:'active',stage:{kind:'work',exercise:'squat'},
    currentReps:5,remainingSeconds:12,weightKg:60,secret:'foo',
    turns:Array(20).fill({role:'coach',text:'hello'})});
  assert.equal(ctx.weightKg,undefined);assert.equal(ctx.secret,undefined);
  assert.equal(ctx.turns.length,6);
  assert.equal(ctx.stage,'work');
});
test('Gemini proxy sends a server-side API key and validates the JSON action',async()=>{
  let called;
  const mock=async(url,options)=>{
    called={url,options};
    return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({reply:'Nice! Adding that.',action:'track_reps',exercise:'jack',reps:10,seconds:15})}]}}]})};
  };
  const ans=await askGemini({transcript:'give me 10 jacks',context:{status:'active'},apiKey:'a-secret',fetchImpl:mock});
  assert.equal(ans.reps,10);assert.equal(ans.action,'track_reps');
  assert.equal(called.options.headers['x-goog-api-key'],'a-secret');
  assert.ok(!called.options.body.includes('a-secret'));
  assert.ok(called.url.includes(':generateContent'));
});
test('optional Gemini TTS wraps sample PCM in a valid WAV container',async()=>{
  const mock=async()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{inlineData:{mimeType:'audio/L16;rate=24000',data:Buffer.from([1,2,3,4]).toString('base64')}}]}}]})});
  const wav=await synthesizeGemini('hello',{apiKey:'fake',fetchImpl:mock});
  assert.equal(wav.subarray(0,4).toString(),'RIFF');
  assert.equal(wav.subarray(8,12).toString(),'WAVE');
});
test('server without Gemini credentials serves assets but never simulates cloud AI',async()=>{
  const server=createWelpServer({apiKey:null,enableTts:false});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const url='http://127.0.0.1:'+server.address().port;
    const status=await (await fetch(url+'/api/status')).json();
    assert.equal(status.geminiEnabled,false);
    const page=await fetch(url+'/index.html');
    assert.equal(page.status,200);
    assert.match(await page.text(),/WELP/);
    const result=await fetch(url+'/api/coach',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    assert.equal(result.status,503);
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
});
