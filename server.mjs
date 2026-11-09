/**
 * Optional local Gemini proxy + static file server.
 * Run: GEMINI_API_KEY=... node server.mjs  (PowerShell: $env:GEMINI_API_KEY="...")
 * Keys never reach the browser. Node 22+, no npm dependencies.
 */
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateCoachResponse} from './coach-actions.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const TYPES={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.md':'text/plain; charset=utf-8'};
const model=()=>process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const voiceModel=()=>process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
const apiEndpoint=m=>`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`;
const schema={
  type:'OBJECT',
  properties:{
    reply:{type:'STRING'},
    action:{type:'STRING',enum:['none','start','pause','resume','finish','skip','easier','harder','take_break','extend_rest','shorten_rest','add_interval','track_reps','status','next','instructions','feeling_good','feeling_tired','safety']},
    exercise:{type:'STRING',enum:['squat','jack','plank','none']},
    reps:{type:'INTEGER'},
    seconds:{type:'INTEGER'}
  },
  required:['reply','action','exercise','reps','seconds']
};
const SYSTEM=`You are WELP, a warm, conversational and concise hands-free HOME HIIT coach. The user is moving and cannot read a screen.
Respond in 1-2 short conversational sentences suitable for speaking aloud. Be encouraging but not repetitive or condescending. Never pretend to see their form or measure fatigue.
Return strictly JSON: reply, action, exercise, reps, seconds.
Choose EXACTLY ONE allowed action. Commands change the workout only when user requests it. Keep playful replies without an action as "none".
"Can we do ten more jumping jacks?" => track_reps, exercise jack, reps 10.
"Add another round of squats" => add_interval, squat, reps 10.
"Make breaks 10 seconds shorter" => shorten_rest seconds 10.
"I need more rest" => take_break or extend_rest depending on current stage.
Feeling check-in: tired => feeling_tired; good => feeling_good.
Danger symptoms (dizzy, faint, chest pain, severe breathlessness) => safety and advise stopping.
Never give diet prescriptions, fixed calorie-burn goals, diagnosis or intense exercise recommendations. No claim that movement tracking proves safe technique.
If you are unsure or merely chatting, action none. You are a short-turn voice assistant, not a long-form adviser.`;
export function sanitizeCoachContext(raw={}) {
  const stage=raw?.stage??{};
  const turns=Array.isArray(raw.turns)?raw.turns.slice(-6):[];
  return {
    status:['ready','active','paused','complete'].includes(raw.status)?raw.status:'ready',
    stage:stage?.kind==='rest'?'rest':stage?.kind==='work'?'work':'none',
    exercise:['squat','jack','plank'].includes(stage.exercise)?stage.exercise:null,
    targetReps:Number.isFinite(Number(stage.targetReps))?Math.min(40,Math.max(0,Number(stage.targetReps))):null,
    currentReps:Math.min(1000,Math.max(0,Math.floor(Number(raw.currentReps)||0))),
    remainingSeconds:Math.min(3600,Math.max(0,Math.round(Number(raw.remainingSeconds)||0))),
    upcomingExercise:['squat','jack','plank'].includes(raw.upcomingExercise)?raw.upcomingExercise:null,
    pending:['break','feeling'].includes(raw.pending)?raw.pending:null,
    turns:turns.map(t=>({role:t.role==='coach'?'coach':'user',text:String(t.text||'').slice(0,240)})),
  };
}
export async function askGemini({transcript,context,apiKey=process.env.GEMINI_API_KEY,modelName=model(),fetchImpl=fetch}) {
  if(!apiKey)throw new Error('GEMINI_API_KEY is not configured');
  const text=String(transcript||'').slice(0,700).trim();
  if(!text)throw new Error('Empty transcript');
  const body={
    systemInstruction:{parts:[{text:SYSTEM}]},
    contents:[{role:'user',parts:[{text:JSON.stringify({transcript:text,context:sanitizeCoachContext(context)})}]}],
    generationConfig:{responseMimeType:'application/json',responseSchema:schema,temperature:.65,maxOutputTokens:280},
  };
  const response=await fetchImpl(apiEndpoint(modelName),{
    method:'POST',headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(12000),
  });
  if(!response.ok)throw new Error(`Gemini request failed (${response.status})`);
  const payload=await response.json();
  const answer=payload?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
  if(!answer)throw new Error('Gemini returned no text');
  return validateCoachResponse(JSON.parse(answer));
}
function pcmToWav(data, sampleRate=24000) {
  const wav=Buffer.alloc(44+data.length);
  wav.write('RIFF',0);wav.writeUInt32LE(36+data.length,4);wav.write('WAVE',8);
  wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);
  wav.writeUInt16LE(1,22);wav.writeUInt32LE(sampleRate,24);
  wav.writeUInt32LE(sampleRate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
  wav.write('data',36);wav.writeUInt32LE(data.length,40);data.copy(wav,44);
  return wav;
}
export async function synthesizeGemini(text,{apiKey=process.env.GEMINI_API_KEY,modelName=voiceModel(),fetchImpl=fetch}={}) {
  if(!apiKey)throw new Error('Gemini not configured');
  const prompt=String(text||'').slice(0,260).trim();
  if(!prompt)throw new Error('No speech text');
  const response=await fetchImpl(apiEndpoint(modelName),{
    method:'POST',headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},
    body:JSON.stringify({
      contents:[{parts:[{text:`Say this in a natural, warm, energetic personal-trainer voice, without exaggeration: ${prompt}`}]}],
      generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Puck'}}}}
    }),signal:AbortSignal.timeout(11000)
  });
  if(!response.ok)throw new Error(`Gemini TTS failed (${response.status})`);
  const payload=await response.json();
  const audio=payload?.candidates?.[0]?.content?.parts?.find(p=>p.inlineData)?.inlineData;
  if(!audio?.data)throw new Error('Gemini TTS returned no audio');
  const bytes=Buffer.from(audio.data,'base64');
  if(bytes.length>4000000)throw new Error('Audio too large');
  return bytes.subarray(0,4).toString()==='RIFF'?bytes:pcmToWav(bytes);
}
async function readBody(req,max=8192) {
  let result='';
  for await (const chunk of req) {
    result+=chunk.toString('utf8');
    if(Buffer.byteLength(result)>max)throw new Error('Request too large');
  }
  return JSON.parse(result);
}
const json=(res,status,body)=>{
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(body));
};
export function createWelpServer({listenRoot=root,apiKey=process.env.GEMINI_API_KEY,enableTts=process.env.GEMINI_TTS==='1',fetchImpl=fetch}={}) {
  const base=path.resolve(listenRoot);
  return http.createServer(async (req,res)=>{
    try {
      const u=new URL(req.url||'/',`http://localhost`);
      if(req.method==='GET' && u.pathname==='/api/status') {
        return json(res,200,{geminiEnabled:!!apiKey,ttsEnabled:!!apiKey&&enableTts});
      }
      if(req.method==='POST' && u.pathname==='/api/coach') {
        if(!apiKey)return json(res,503,{error:'Gemini is not configured; local coach is available.'});
        const data=await readBody(req);
        if(typeof data.transcript!=='string'||data.transcript.length>700)return json(res,400,{error:'Invalid transcript'});
        try {return json(res,200,await askGemini({transcript:data.transcript,context:data.context,apiKey,fetchImpl}));}
        catch(err){console.warn('Coach unavailable:',err.message);return json(res,502,{error:'The cloud coach is unavailable. Falling back to local coaching.'});}
      }
      if(req.method==='POST' && u.pathname==='/api/tts') {
        if(!apiKey||!enableTts)return json(res,503,{error:'Expressive voice is not configured'});
        const data=await readBody(req,2048);
        if(typeof data.text!=='string'||data.text.length>260)return json(res,400,{error:'Invalid speech text'});
        try {
          const audio=await synthesizeGemini(data.text,{apiKey,fetchImpl});
          res.writeHead(200,{'Content-Type':'audio/wav','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
          res.end(audio);return;
        }catch(err){console.warn('TTS unavailable:',err.message);return json(res,502,{error:'Natural voice unavailable; use device voice.'});}
      }
      if(req.method!=='GET' && req.method!=='HEAD')return json(res,405,{error:'Method not allowed'});
      const urlPath=decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname);
      const file=path.resolve(base,'.'+urlPath);
      if(file!==base && !file.startsWith(base+path.sep))return json(res,403,{error:'Forbidden'});
      const type=TYPES[path.extname(file)];
      if(!type)return json(res,404,{error:'Not found'});
      const st=await stat(file).catch(()=>null);
      if(!st?.isFile())return json(res,404,{error:'Not found'});
      const contents=await readFile(file);
      res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:contents);
    }catch(err){
      console.warn('WELP request:',err.message);
      if(!res.headersSent)json(res,400,{error:'Request could not be processed.'});
    }
  });
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT)||8000;
  createWelpServer().listen(port,'127.0.0.1',()=>console.log(`WELP listening at http://localhost:${port} (Gemini ${process.env.GEMINI_API_KEY?'enabled':'disabled'})`));
}
