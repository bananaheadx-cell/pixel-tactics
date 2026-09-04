const GRID = 5, C = 64, GAP = 6, PAD = 10, MAX = 6;
const U = {
  sword:{n:'ดาบ',i:'⚔',hp:140,atk:48,cr:.12},
  spear:{n:'หอก',i:'➶',hp:115,atk:40,cr:.10},
  gun:{n:'ปืน',i:'▰',hp:95,atk:34,cr:.15},
  bow:{n:'ธนู',i:'🏹',hp:75,atk:56,cr:.20},
  cannon:{n:'ปืนใหญ่',i:'✹',hp:60,atk:30,cr:.08},
  axe:{n:'ขวาน',i:'🪓',hp:110,atk:30,cr:.12},
  priest:{n:'นักบวช',i:'✚',hp:90,atk:18,cr:.05}
};
const ORDER = ['sword','spear','gun','bow','cannon','axe','priest'];
const S = {phase:'deploy',turn:'player',auto:false,busy:false,world:1,stage:1,pick:null,selected:null,boss:null,g:{player:[],bot:[]},v:{player:[],bot:[]}};
const grid = () => Array.from({length:GRID},()=>Array(GRID).fill(null));
S.g.player=grid(); S.g.bot=grid(); S.v.player=grid(); S.v.bot=grid();
const $=x=>document.getElementById(x);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const alive=s=>{const a=[],seen=new Set();S.g[s].flat().forEach(u=>{if(u&&u.hp>0&&!seen.has(u)){seen.add(u);a.push(u)}});return a};
const pos=(s,u)=>{for(let r=0;r<GRID;r++)for(let c=0;c<GRID;c++)if(S.g[s][r][c]===u)return{r,c};return null};
const W=GRID*C+(GRID-1)*GAP+PAD*2;
const H=2*(GRID*C+(GRID-1)*GAP)+100;
let scene, audioCtx;
function log(x,c=''){const d=document.createElement('div');d.className=c;d.textContent=x;$('log').appendChild(d);$('log').scrollTop=1e9}
function say(x){$('turnBox').textContent=x}
function sound(type='hit'){
  try{
    audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==='suspended')audioCtx.resume();
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.connect(g);g.connect(audioCtx.destination);
    const f={sword:[180,90],spear:[260,120],gun:[110,70],bow:[520,260],cannon:[75,45],axe:[140,65],priest:[620,420],heal:[700,900],ult:[160,760],deploy:[360,500],win:[520,880],lose:[180,80]}[type]||[220,100];
    o.frequency.setValueAtTime(f[0],audioCtx.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(30,f[1]),audioCtx.currentTime+.14);g.gain.setValueAtTime(.0001,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.07,audioCtx.currentTime+.01);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+.16);o.start();o.stop(audioCtx.currentTime+.17);
  }catch(e){}
}
function mk(t,boss=false){const h=Math.round(U[t].hp*(boss?(2.5+S.world*.65):1));return{type:t,hp:h,max:h,gauge:0,boss,cells:boss?[[0,2],[0,3],[1,2],[1,3]]:null}}
function addGauge(u,n){u.gauge=Math.min(100,u.gauge+n)}
function cellX(c){return PAD+c*(C+GAP)+C/2}
function cellY(s,r){return(s==='bot'?28:GRID*(C+GAP)+54)+r*(C+GAP)+C/2}
function boardCellAt(pointer,s){const y0=s==='bot'?28:GRID*(C+GAP)+54;const c=Math.floor((pointer.x-PAD)/(C+GAP));const r=Math.floor((pointer.y-y0)/(C+GAP));if(r<0||r>=GRID||c<0||c>=GRID)return null;const x=PAD+c*(C+GAP),y=y0+r*(C+GAP);if(pointer.x<x||pointer.x>x+C||pointer.y<y||pointer.y>y+C)return null;return{r,c}}
function targets(s,r,c,t){
  const g=S.g[s],rows=s==='bot'?[0,1,2,3,4]:[4,3,2,1,0];
  if(t==='bow')return [{r,c,k:1}];
  if(t==='axe'){const fr=rows.find(x=>g[x].some(u=>u&&u.hp>0));return fr==null?[]:[0,1,2,3,4].map(cc=>({r:fr,c:cc,k:1}))}
  if(t==='cannon')return [{r,c,k:.7},[1,0],[-1,0],[0,1],[0,-1]].map((q,i)=>i===0?q:{r:r+q[0],c:c+q[1],k:.45});
  const line=rows.filter(rr=>g[rr][c]?.hp>0),k=t==='gun'?[1,.6,.3]:t==='spear'?[1,.5]:[1];
  return line.slice(0,k.length).map((rr,i)=>({r:rr,c,k:k[i]}));
}
function calc(u,tr,tc,foe,ult=false){
  if(u.type==='priest')return[];
  const mult=ult?1.3:1, a=U[u.type];
  return targets(foe,tr,tc,u.type).filter(h=>h.r>=0&&h.r<GRID&&h.c>=0&&h.c<GRID&&S.g[foe][h.r][h.c]).map(h=>{const cr=Math.random()<a.cr;let d=Math.max(1,Math.round(a.atk*h.k*(.85+Math.random()*.3)*mult));if(cr)d=Math.round(d*1.5);return{...h,d,cr}});
}
function sync(s,u){for(let r=0;r<GRID;r++)for(let c=0;c<GRID;c++)if(S.g[s][r][c]===u)update(s,r,c)}
function heal(s,r,c,n){const u=S.g[s][r][c];if(!u||u.hp<=0)return false;const old=u.hp;u.hp=Math.min(u.max,u.hp+n);update(s,r,c);float(cellX(c),cellY(s,r),`+${u.hp-old}`,'#4ade80');burst(cellX(c),cellY(s,r),[0x4ade80,0xffffff],12);return u.hp>old}
async function hit(s,hs){
  for(const h of hs){let u=S.g[s][h.r][h.c];if(u?.boss)u=S.boss;if(!u||u.hp<=0)continue;u.hp=Math.max(0,u.hp-h.d);addGauge(u,8);sync(s,u);sound(u.type);float(cellX(h.c),cellY(s,h.r),`${h.cr?'CRIT! ':''}-${h.d}`,h.cr?'#ff3333':'#fff',h.cr);burst(cellX(h.c),cellY(s,h.r),h.cr?[0xffffff,0xff3333,0xffd166]:[0xffffff,0xffd166],h.cr?18:9);log(`→ ${U[u.type].n} ${h.cr?'CRIT ':''}${h.d} dmg · HP ${u.hp}`,'dm');if(u.hp<=0){for(let r=0;r<GRID;r++)for(let c=0;c<GRID;c++)if(S.g[s][r][c]===u){destroy(s,r,c);S.g[s][r][c]=null}if(u.boss)S.boss=null;log(`💀 ${U[u.type].n}${u.boss?' BOSS':''} ถูกทำลาย!`,'ko')}await wait(80)}
}
async function ult(s,p,tr,tc){
  const u=S.g[s][p.r][p.c];if(!u||u.gauge<100)return false;u.gauge=0;sound('ult');log(`✨ ${U[u.type].n} ใช้ท่าไม้ตาย!`,'hl');
  const foe=s==='player'?'bot':'player';
  if(u.type==='priest'){for(const x of alive(s)){const q=pos(s,x);if(q)heal(s,q.r,q.c,Math.round(x.max*.30))}burst(W/2,H/2,[0x4ade80,0xffffff,0xc084fc],35);return true}
  let hs=[];
  if(u.type==='bow'){for(let r=0;r<GRID;r++)for(let c=0;c<GRID;c++)if(S.g[foe][r][c])hs.push(...calc(u,r,c,foe,true))}
  else hs=calc(u,tr,tc,foe,true);
  await hit(foe,hs);return true;
}
async function attack(s,p,tr,tc){
  if(S.busy||S.phase!=='battle'||S.turn!==s)return;S.busy=true;
  const u=S.g[s][p.r][p.c];if(!u){S.busy=false;return}
  const foe=s==='player'?'bot':'player';
  if(u.gauge>=100&&(s==='bot'||S.auto)){await ult(s,p,tr,tc);S.busy=false;if(check())return;finish(s);return}
  if(u.type==='priest'){
    if(tr>=0&&tc>=0&&tr<GRID&&tc<GRID&&S.g[s][tr][tc]&&S.g[s][tr][tc]!==u&&S.g[s][tr][tc].hp<S.g[s][tr][tc].max){heal(s,tr,tc,Math.round(u.max*.28));addGauge(u,18);sound('heal');await wait(120);S.busy=false;finish(s);return}
    if(S.g[foe][tr]?.[tc]){addGauge(u,12);const d=Math.max(1,Math.round(U.priest.atk*(.85+Math.random()*.3)));await hit(foe,[{r:tr,c:tc,k:1,d,cr:false}]);addGauge(u,8);S.busy=false;if(check())return;finish(s);return}
    S.busy=false;return;
  }
  const hs=calc(u,tr,tc,foe);if(!hs.length){S.busy=false;return}
  addGauge(u,12);
  const v=S.v[s][p.r][p.c];if(v){const x=v.x,y=v.y;scene.tweens.add({targets:v,x:cellX(tc),y:cellY(foe,hs[0].r),duration:170,yoyo:true});await wait(90);scene.tweens.add({targets:v,x,y,duration:170})}
  await hit(foe,hs);addGauge(u,8);await wait(80);S.busy=false;if(check())return;finish(s);
}
function finish(s){S.turn=s==='player'?'bot':'player';render();if(S.turn==='bot')ai('bot');else if(S.auto)ai('player');else say('🟢 เทิร์นของคุณ')}
function best(s){
  const foe=s==='player'?'bot':'player',o=[];
  for(let r=0;r<GRID;r++)for(let c=0;c<GRID;c++){const u=S.g[s][r][c];if(!u||u.hp<=0)continue;
    if(u.gauge>=100){o.push({p:{r,c},tr:0,tc:0,score:300});continue}
    if(u.type==='priest'){
      const a=alive(s).filter(x=>x!==u&&x.hp<x.max).sort((a,b)=>a.hp/a.max-b.hp/b.max)[0];
      if(a){const p=pos(s,a);o.push({p:{r,c},tr:p.r,tc:p.c,score:120+(1-a.hp/a.max)*100});}
      for(let tr=0;tr<GRID;tr++)for(let tc=0;tc<GRID;tc++)if(S.g[foe][tr][tc])o.push({p:{r,c},tr,tc,score:18});
      continue;
    }
    for(let tr=0;tr<GRID;tr++)for(let tc=0;tc<GRID;tc++){const h=calc(u,tr,tc,foe);if(h.length)o.push({p:{r,c},tr,tc,score:h.reduce((a,x)=>a+x.d,0)})}
  }
  return o.sort((a,b)=>b.score-a.score)[0];
}
function ai(s){if(S.phase!=='battle'||S.turn!==s||S.busy)return;S.busy=true;say(s==='player'?'🤖 AUTO BATTLE — AI กำลังเล่น':'🤖 ศัตรูกำลังคิด...');setTimeout(()=>{S.busy=false;const m=best(s);if(m)attack(s,m.p,m.tr,m.tc);else{S.turn=s==='player'?'bot':'player';render();if(S.turn==='bot')ai('bot');else say('🟢 เทิร์นของคุณ')}},s==='player'?350:650)}
function clearViews(s){for(let r=0;r<GRID;r++)for(let c=0;c<GRID;c++){if(S.v[s][r][c])S.v[s][r][c].destroy();S.v[s][r][c]=null}}
function makeEnemies(){
  clearViews('bot');S.g.bot=grid();S.boss=null;
  if(S.stage===5){const b=mk('cannon',true);S.boss=b;for(const [r,c] of b.cells)S.g.bot[r][c]=b;bossView();[['spear',0],['axe',1],['bow',2]].forEach(([t,c])=>{S.g.bot[2][c]=mk(t);create('bot',2,c,S.g.bot[2][c])});log(`👑 BOSS WORLD ${S.world}-5 — 2×2 + ลูกน้อง 3 ตัว`,'ko')}
  else{const n=Math.min(7,4+Math.ceil(S.world/2)+Math.floor(S.stage/2));for(let i=0;i<n;i++){const r=Math.floor(i/GRID),c=i%GRID,t=ORDER[(i+S.world+S.stage)%6];S.g.bot[r][c]=mk(t);create('bot',r,c,S.g.bot[r][c])}}
}
function deploy(t,r,c){if(S.phase!=='deploy'||!S.pick||S.g.player[r][c]||alive('player').length>=MAX)return false;S.g.player[r][c]=mk(t);create('player',r,c,S.g.player[r][c]);sound('deploy');render();return true}
function next(){
  if(S.stage<5)S.stage++;else{S.stage=1;S.world++}
  if(S.world>10){S.phase='complete';say('🏆 CAMPAIGN COMPLETE — ผ่านครบ 10 WORLD / 50 STAGES!');$('btnNext').style.display='none';sound('win');return}
  S.phase='deploy';S.turn='player';S.auto=false;S.pick=null;S.selected=null;S.g.player=grid();clearViews('player');$('btnStart').style.display='block';$('btnNext').style.display='none';makeEnemies();say(`WORLD ${S.world} · STAGE ${S.stage} — จัดทัพ`);render();
}
function check(){const p=alive('player').length,b=alive('bot').length;if(p&&b)return false;if(!p){S.phase='over';say('💀 DEFEAT — กด เล่นใหม่ เพื่อเริ่มอีกครั้ง');$('btnReset').style.display='block';$('btnNext').style.display='none';sound('lose');return true}S.phase='over';log(`🏆 ชนะ WORLD ${S.world}-${S.stage}!`,'hl');say('🏆 VICTORY — กด ด่านถัดไป');$('btnNext').style.display='block';sound('win');return true}
function reset(){S.phase='deploy';S.turn='player';S.auto=false;S.busy=false;S.world=1;S.stage=1;S.pick=null;S.selected=null;S.g.player=grid();clearViews('player');$('btnStart').style.display='block';$('btnNext').style.display='none';$('btnReset').style.display='block';$('log').innerHTML='';makeEnemies();say('โหมดจัดทัพ — เลือกยูนิตทางซ้าย แล้วคลิกช่อง');render()}
function tex(sc,k,t,s){const q=sc.textures.createCanvas(k,40,40),x=q.getContext();x.fillStyle=s==='player'?'#4da3ff':'#ff6b6b';x.fillRect(7,7,26,27);x.fillStyle='#f2c48d';x.fillRect(13,10,14,11);x.fillStyle='#151923';x.fillRect(11,29,18,7);x.fillStyle='#fff';if(t==='priest'){x.fillRect(18,3,4,30);x.fillRect(10,15,20,4)}else{x.fillRect(29,19,8,3)}q.refresh()}
function create(s,r,c,u){const q=scene.add.container(cellX(c),cellY(s,r));const sp=scene.add.image(0,0,`u_${u.type}_${s}`).setScale(1.45);const hp=scene.add.text(0,-27,`${u.hp}`,{fontFamily:'monospace',fontSize:'11px',color:'#fff',stroke:'#000',strokeThickness:4}).setOrigin(.5);const gb=scene.add.rectangle(-24,29,48,4,0xc084fc).setOrigin(0,.5);const hb=scene.add.rectangle(-24,35,48,4,0x4ade80).setOrigin(0,.5);q.add([sp,hp,gb,hb]);q.hp=hp;q.gb=gb;q.hb=hb;q.setDepth(5);S.v[s][r][c]=q}
function bossView(){if(!S.boss)return;const cx=(cellX(2)+cellX(3))/2,cy=(cellY('bot',0)+cellY('bot',1))/2;const q=scene.add.container(cx,cy);const b=scene.add.rectangle(0,0,C*2+GAP-6,C*2+GAP-6,0x7f1d1d).setStrokeStyle(5,0xffd166);const t=scene.add.text(0,0,'👑',{fontSize:'48px'}).setOrigin(.5);const hp=scene.add.text(0,-73,`${S.boss.hp}`,{fontFamily:'monospace',fontSize:'15px',color:'#fff',stroke:'#000',strokeThickness:5}).setOrigin(.5);q.add([b,t,hp]);q.hp=hp;q.setDepth(4);S.v.bot[0][2]=q;S.v.bot[0][3]=q;S.v.bot[1][2]=q;S.v.bot[1][3]=q}
function update(s,r,c){const u=S.g[s][r][c],v=S.v[s][r][c];if(!u||!v)return;v.hp?.setText(`${u.hp}`);if(!u.boss){if(v.hb)v.hb.width=48*u.hp/u.max;if(v.gb)v.gb.width=48*u.gauge/100}else if(v.hp)v.hp.setText(`${u.hp}`)}
function destroy(s,r,c){const v=S.v[s][r][c];if(v)v.destroy();S.v[s][r][c]=null}
function burst(x,y,cs,n){for(let i=0;i<n;i++){const q=scene.add.rectangle(x,y,4,4,cs[i%cs.length]).setDepth(100);scene.tweens.add({targets:q,x:x+(Math.random()-.5)*80,y:y+(Math.random()-.5)*80,alpha:0,duration:330,onComplete:()=>q.destroy()})}}
function float(x,y,t,col,cr=false){const q=scene.add.text(x,y-8,t,{fontFamily:'monospace',fontSize:cr?'20px':'16px',color:col,stroke:'#000',strokeThickness:5}).setOrigin(.5).setDepth(110);scene.tweens.add({targets:q,y:y-52,alpha:0,duration:700,onComplete:()=>q.destroy()})}
function renderPicker(){$('picker').innerHTML=ORDER.map(t=>`<button data-t="${t}" class="${S.pick===t?'on':''}"><b>${U[t].i} ${U[t].n}</b><small>HP ${U[t].hp} · ATK ${U[t].atk} · ULT +30%${t==='priest'?' · ฮีลเพื่อน / ฮีลหมู่':''}</small></button>`).join('')}
function render(){renderPicker();for(const s of ['player','bot'])for(let r=0;r<GRID;r++)for(let c=0;c<GRID;c++)if(S.g[s][r][c])update(s,r,c);$('cnt').textContent=alive('player').length;$('campaign').textContent=`WORLD ${S.world}/10 · STAGE ${S.stage}/5${S.stage===5?' · 👑 BOSS':''}`;$('btnAuto').style.display=S.phase==='battle'?'block':'none';$('btnAuto').textContent=S.auto?'⏹ หยุด AUTO':'🤖 AUTO BATTLE'}
$('picker').onclick=e=>{const b=e.target.closest('button');if(b&&S.phase==='deploy'){S.pick=S.pick===b.dataset.t?null:b.dataset.t;render()}};
$('btnStart').onclick=()=>{if(!alive('player').length){say('⚠️ กรุณาวางยูนิตอย่างน้อย 1 ตัว');return}S.phase='battle';S.turn='player';S.pick=null;S.selected=null;$('btnStart').style.display='none';log(`════ ⚔️ WORLD ${S.world}-${S.stage} ════`,'hl');say('🟢 เทิร์นของคุณ — คลิกยูนิต แล้วคลิกเป้าหมาย');render()};
$('btnAuto').onclick=()=>{S.auto=!S.auto;render();if(S.auto&&S.turn==='player')ai('player')};
$('btnNext').onclick=next;$('btnReset').onclick=reset;
function pointer(){if(S.phase==='deploy'){const p=boardCellAt(scene.input.activePointer,'player');if(p)deploy(S.pick,p.r,p.c);return}if(S.phase!=='battle'||S.turn!=='player'||S.busy)return;const p=boardCellAt(scene.input.activePointer,'player');const e=boardCellAt(scene.input.activePointer,'bot');if(p&&S.g.player[p.r][p.c]){S.selected=S.selected&&S.selected.r===p.r&&S.selected.c===p.c?null:p;render();say(S.selected?`เลือก ${U[S.g.player[p.r][p.c].type].n} — คลิกเป้าหมายศัตรู/เพื่อน`:'เลือกยูนิต');return}if(!S.selected)return;const u=S.g.player[S.selected.r][S.selected.c];if(!u)return;if(e){attack('player',S.selected,e.r,e.c);S.selected=null;return}if(p&&u.type==='priest'&&S.g.player[p.r][p.c]&&S.g.player[p.r][p.c]!==u){attack('player',S.selected,p.r,p.c);S.selected=null}}
scene=new Phaser.Scene('Battle');scene.preload=function(){for(const t of ORDER){tex(this,`u_${t}_player`,t,'player');tex(this,`u_${t}_bot`,t,'bot')}};scene.create=function(){
  scene=this;this.cameras.main.setBackgroundColor('#0b0f1a');
  this.add.text(W/2,14,'ENEMY', {fontFamily:'monospace',fontSize:'14px',color:'#ff6b6b'}).setOrigin(.5);
  this.add.text(W/2,GRID*(C+GAP)+40,'YOUR ARMY',{fontFamily:'monospace',fontSize:'14px',color:'#4da3ff'}).setOrigin(.5);
  for(const s of ['player','bot'])for(let r=0;r<GRID;r++)for(let c=0;c<GRID;c++)this.add.rectangle(cellX(c),cellY(s,r),C,C,0x151d2c).setStrokeStyle(1,0x2b3448);
  this.input.on('pointerdown',pointer);makeEnemies();render();
};
new Phaser.Game({type:Phaser.AUTO,width:W,height:H,parent:'stage',backgroundColor:'#0b0f1a',scene:[scene],scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},render:{antialias:true}});