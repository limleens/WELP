import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
test('every static DOM lookup referenced by app.mjs exists in index.html',()=>{
  const all=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  const refs=[...app.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map(m=>m[1]);
  const missing=[...new Set(refs.filter(id=>!all.has(id)))];
  assert.deepEqual(missing,[]);
});
test('WELP onboarding and guided HIIT have stable required controls',()=>{
  for(const id of ['profileForm','profileGoal','profileLevel','profileIntensity','profileMinutes','profileWeight','startCircuitBtn','planPanel','stageRemaining','coachTextForm','micBtn','cameraBtn']){
    assert.ok(html.includes(`id="${id}"`),`Missing ${id}`);
  }
});
