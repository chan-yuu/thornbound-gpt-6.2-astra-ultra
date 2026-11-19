(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const arena = byId('arena'), veil = byId('veil'), loading = byId('loading');
  const plateLayer = byId('nameplates'), radar = byId('radar');
  const skillButtons = [...document.querySelectorAll('[data-skill]')];
  const pointGems = [...document.querySelectorAll('.gems i')], killPips = [...document.querySelectorAll('.pips i')];
  const held = new Set(), plates = new Map();
  let game, renderer, three, scene, camera, forest, aim, projected, radarBase;
  let needsRender=true;
  let width=1, height=1, clock=0, previous=0, dialog='', lastFocus;
  let soundOn=true, audio, noise, toastTimer, flashTimer;
  let stickX=0,stickZ=0,shake=0, rectObserver, radarTime=0;
  const controls = [
    ['W A S D / 方向键','移动'], ['鼠标左键 / J','挥剑，按住连续攻击'],
    ['鼠标右键 / K','按住举盾格挡'], ['空格','闪避'], ['1 / 2 / 3','施放对应怒气技能'], ['Esc','暂停 / 继续']
  ];
  function unlockAudio(){
    if(!soundOn || (navigator.userActivation && !navigator.userActivation.hasBeenActive)) return;
    try{
      if(!audio){
        const Context=window.AudioContext||window.webkitAudioContext;
        if(!Context)return;
        audio=new Context();
        noise=audio.createBuffer(1,audio.sampleRate*.5,audio.sampleRate);
        const channel=noise.getChannelData(0);
        for(let i=0;i<channel.length;i++)channel[i]=Math.random()*2-1;
      }
      if(audio.state==='suspended')audio.resume().catch(()=>{});
    }catch{ /* Audio is optional on devices without a sound output. */ }
  }
  function tone(freq,end,duration,gain,type='sine',delay=0){
    if(!soundOn||!audio||audio.state!=='running')return;
    const start=audio.currentTime+delay, osc=audio.createOscillator(), env=audio.createGain();
    osc.type=type;osc.frequency.setValueAtTime(freq,start);osc.frequency.exponentialRampToValueAtTime(end,start+duration);
    env.gain.setValueAtTime(.0001,start);env.gain.exponentialRampToValueAtTime(gain,start+.007);
    env.gain.exponentialRampToValueAtTime(.0001,start+duration);
    osc.connect(env).connect(audio.destination);osc.start(start);osc.stop(start+duration+.015);
    osc.onended=()=>{osc.disconnect();env.disconnect();};
  }
  function swish(freq,duration,volume){
    if(!soundOn||!audio||audio.state!=='running')return;
    const start=audio.currentTime, src=audio.createBufferSource(), filter=audio.createBiquadFilter(), env=audio.createGain();
    src.buffer=noise;src.loop=true;filter.type='bandpass';filter.Q.value=.72;
    filter.frequency.setValueAtTime(freq,start);filter.frequency.exponentialRampToValueAtTime(freq*.22,start+duration);
    env.gain.setValueAtTime(.0001,start);env.gain.exponentialRampToValueAtTime(volume,start+.012);env.gain.exponentialRampToValueAtTime(.0001,start+duration);
    src.connect(filter).connect(env).connect(audio.destination);src.start();src.stop(start+duration+.015);
    src.onended=()=>{src.disconnect();filter.disconnect();env.disconnect();};
  }
  function setIcon(button,name){button.querySelector('use').setAttribute('href','#'+name);}
  byId('sound').onclick=()=>{
    soundOn=!soundOn;if(soundOn){unlockAudio();tone(480,640,.12,.035);}
    const label=soundOn?'关闭音效':'开启音效';
    byId('sound').setAttribute('aria-label',label);byId('sound').setAttribute('aria-pressed',String(soundOn));
    byId('sound').title=label;setIcon(byId('sound'),soundOn?'volume':'mute');
  };
  function toast(message){
    const el=byId('toast');el.textContent=message;el.classList.add('show');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),1400);
  }
  function floatHit(data){
    if(!projected||!data.position)return;
    projected.copy(data.position).project(camera);
    if(projected.z>1||projected.z< -1)return;
    const el=document.createElement('span');el.className='float-number'+(data.heavy?' heavy':'');
    el.textContent=Math.round(data.amount);el.style.left=((projected.x*.5+.5)*width)+'px';
    el.style.top=((-projected.y*.5+.5)*height-8)+'px';
    byId('damage-layer').append(el);el.addEventListener('animationend',()=>el.remove(),{once:true});
  }
  function onEvent(type,data={}){
    switch(type){
      case 'swing':swish(1350,.16,.13);break;
      case 'hit':floatHit(data);swish(780,.07,.12);tone(105,50,.12,.045,'triangle');if(data.heavy)shake=.055;break;
      case 'hurt':{
        tone(84,38,.19,.07,'triangle');shake=.09;
        const flash=byId('damage-flash');flash.style.opacity='1';clearTimeout(flashTimer);flashTimer=setTimeout(()=>flash.style.opacity='0',95);break;
      }
      case 'block':tone(840,315,.14,.05,'triangle');swish(2300,.07,.07);break;
      case 'dodge':swish(950,.2,.085);break;
      case 'point':toast('怒气凝聚  ·  '+data.points+' / 3');tone(440,660,.2,.035);tone(660,880,.24,.03,'sine',.08);break;
      case 'skill':toast(['','突进斩','回旋飞盾','旋风斩'][data.slot]||data.name);swish(data.slot===2?2400:1300,.3,.16);break;
      case 'notice':toast(data.text);break;
      case 'kill':tone(210,120,.22,.05,'triangle');break;
      case 'victory':case 'defeat':queueMicrotask(()=>openDialog(type));break;
      case 'restart':byId('damage-layer').replaceChildren();byId('toast').classList.remove('show');shake=0;break;
    }
  }
  function action(kind,down=true){
    if(!game||dialog)return;
    if(down)unlockAudio();
    game.input(kind,down);
  }
  function once(kind){action(kind);action(kind,false);}
  function updateMove(){
    const x=(held.has('KeyD')||held.has('ArrowRight')?1:0)-(held.has('KeyA')||held.has('ArrowLeft')?1:0);
    const z=(held.has('KeyS')||held.has('ArrowDown')?1:0)-(held.has('KeyW')||held.has('ArrowUp')?1:0);
    game?.setMove(x+stickX,z+stickZ);
  }
  function resetInput(){
    held.clear();stickX=stickZ=0;game?.setMove(0,0);
    game?.input('attack',false);game?.input('block',false);
    byId('touch-move').firstElementChild.style.transform='translate(-50%,-50%)';
  }
  function closeDialog(){
    if(!dialog)return;
    needsRender=true;
    dialog='';veil.hidden=true;game?.setPaused(false);setIcon(byId('pause'),'pause-bars');
    byId('pause').setAttribute('aria-label','暂停战斗');byId('pause').title='暂停战斗 (Esc)';
    previous=performance.now();
    (lastFocus instanceof HTMLElement?lastFocus:byId('world')).focus({preventScroll:true});
  }
  function restart(){
    resetInput();game.restart();aim.set(0,1,0);clock=0;closeDialog();previous=performance.now();
  }
  function openDialog(kind){
    if(!game)return;
    if(!dialog)lastFocus=document.activeElement;
    resetInput();dialog=kind;needsRender=true;game.setPaused(true);veil.hidden=false;
    setIcon(byId('pause'),'play');byId('pause').setAttribute('aria-label','继续战斗');byId('pause').title='继续战斗 (Esc)';
    const body=byId('dialog-content'),buttons=byId('dialog-actions'),title=byId('dialog-title');
    body.replaceChildren();buttons.replaceChildren();
    const ended=kind==='victory'||kind==='defeat';byId('dialog-close').hidden=ended;
    const addText=str=>{const p=document.createElement('p');p.textContent=str;body.append(p);};
    const addButton=(label,fn,primary)=>{const b=document.createElement('button');b.textContent=label;b.className=primary?'primary':'secondary';b.onclick=fn;buttons.append(b);return b;};
    if(kind==='guide'){
      title.textContent='操作指南';
      const rows=document.createElement('div');rows.className='guide-rows';
      const items=matchMedia('(pointer:coarse)').matches?[['左侧摇杆','移动'],['普攻 / 格挡','按住连续挥剑 / 举盾'],['闪避','快速躲开攻击'],['下方技能','点击施放对应技能']]:controls;
      for(const [key,desc] of items){const row=document.createElement('div'),k=document.createElement('kbd'),s=document.createElement('span');k.textContent=key;s.textContent=desc;row.append(k,s);rows.append(row);}
      body.append(rows);addText('近战命中积攒怒气。每满 100 怒气凝聚 1 点，最多储存 3 点。三个技能依次消耗 1、2、3 点。');
    }else if(kind==='pause'){
      title.textContent='战斗已暂停';
      const state=game.getState();addText('黑棘森林　·　已击败 '+state.kills+' / '+state.total);
    }else{
      title.textContent=kind==='victory'?'战斗胜利':'战斗失败';
      addText(kind==='victory'?'半兽人统领与他的战士已被击败。':'剑盾战士倒下了。重新迎战林地中的敌人。');
      const state=game.getState();addText('已击败 '+state.kills+' / '+state.total);
    }
    const primary=addButton(ended?'再次挑战':'继续战斗',ended?restart:closeDialog,true);
    if(kind==='pause')addButton('重新挑战',restart,false);
    primary.focus({preventScroll:true});
  }
  byId('dialog-close').onclick=closeDialog;
  byId('guide').onclick=()=>openDialog('guide');
  byId('pause').onclick=()=>dialog?closeDialog():openDialog('pause');
  const moves=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
  const keyActions={KeyJ:'attack',KeyK:'block',Space:'dodge',Digit1:'skill1',Digit2:'skill2',Digit3:'skill3',Numpad1:'skill1',Numpad2:'skill2',Numpad3:'skill3'};
  addEventListener('keydown',e=>{
    if(e.key==='Tab'&&dialog){
      const nodes=[...veil.querySelectorAll('button:not([hidden])')],first=nodes[0],last=nodes.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      return;
    }
    if(e.altKey||e.ctrlKey||e.metaKey||!game)return;
    if(e.code==='Escape'&&!e.repeat){if(dialog==='victory'||dialog==='defeat')return;e.preventDefault();dialog?closeDialog():openDialog('pause');return;}
    if(dialog)return;
    if(moves.includes(e.code)||keyActions[e.code]){
      if(e.code==='Space'&&document.activeElement?.matches('button:focus-visible'))return;
      e.preventDefault();if(e.repeat)return;world.focus({preventScroll:true});unlockAudio();
      if(keyActions[e.code])action(keyActions[e.code]);else{held.add(e.code);updateMove();}
    }
  });
  addEventListener('keyup',e=>{
    if(moves.includes(e.code)){held.delete(e.code);updateMove();}
    else if(keyActions[e.code])action(keyActions[e.code],false);
  });
  const world=byId('world');world.tabIndex=-1;
  world.oncontextmenu=e=>e.preventDefault();
  world.addEventListener('pointerdown',e=>{
    if(e.pointerType==='touch'||(e.button!==0&&e.button!==2))return;
    e.preventDefault();world.focus({preventScroll:true});world.setPointerCapture(e.pointerId);
    action(e.button===2?'block':'attack');
  });
  // Buttons can be chorded. Mouseup covers releases while another button is held.
  addEventListener('mouseup',e=>{if(e.button===0)action('attack',false);if(e.button===2)action('block',false);});
  world.addEventListener('mousedown',e=>{if(e.buttons===3)action(e.button===2?'block':'attack');});
  world.addEventListener('pointercancel',resetInput);
  skillButtons.forEach(button=>button.onclick=()=>{once('skill'+button.dataset.skill);world.focus({preventScroll:true});});
  document.querySelectorAll('.touch-attack button').forEach(button=>{
    button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);action(button.dataset.action);});
    for(const event of ['pointerup','pointercancel'])button.addEventListener(event,()=>action(button.dataset.action,false));
  });
  const pad=byId('touch-move');let stickPointer=null;
  function moveStick(e){
    const box=pad.getBoundingClientRect(),r=box.width*.34;
    const x=e.clientX-box.left-box.width/2,z=e.clientY-box.top-box.height/2;
    const length=Math.max(Math.hypot(x,z),r);stickX=x/length;stickZ=z/length;
    pad.firstElementChild.style.transform='translate(calc(-50% + '+stickX*r+'px),calc(-50% + '+stickZ*r+'px))';updateMove();
  }
  pad.addEventListener('pointerdown',e=>{if(stickPointer!==null||dialog)return;e.preventDefault();unlockAudio();stickPointer=e.pointerId;pad.setPointerCapture(e.pointerId);moveStick(e);});
  pad.addEventListener('pointermove',e=>{if(stickPointer===e.pointerId)moveStick(e);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(event,e=>{
    if(stickPointer!==e.pointerId)return;stickPointer=null;stickX=stickZ=0;updateMove();pad.firstElementChild.style.transform='translate(-50%,-50%)';
  });
  function pauseOnLeave(){resetInput();if(game&&!dialog){const s=game.getState();if(s.started&&s.status==='playing')openDialog('pause');}}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseOnLeave();});
  window.addEventListener('blur',pauseOnLeave);

  function makeRadar(){
    const base=document.createElement('canvas');base.width=base.height=276;
    const c=base.getContext('2d');c.scale(2,2);c.translate(69,69);
    const circle=(r,fill,stroke)=>{c.beginPath();c.arc(0,0,r,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}};
    circle(57,'rgba(20,31,24,.86)','#beb490');circle(53,'#344135','#646b50');c.save();c.clip();
    let seed=83;const rnd=()=>(seed=seed*16807%2147483647)/2147483647;
    for(let i=0;i<105;i++){
      const a=rnd()*Math.PI*2,r=27+rnd()*38,x=Math.cos(a)*r,y=Math.sin(a)*r,size=2+rnd()*7;
      c.beginPath();for(let j=0;j<8;j++){const t=j*Math.PI/4,rad=size*(.75+rnd()*.45);c.lineTo(x+Math.cos(t)*rad,y+Math.sin(t)*rad*.8);}c.closePath();
      c.fillStyle=['#344234','#414e3c','#29392f','#3b493a','#48523d'][i%5];c.fill();
    }
    c.beginPath();c.moveTo(36,-52);c.bezierCurveTo(14,-25,18,-12,-5,7);c.bezierCurveTo(-19,20,-7,32,-33,54);
    c.strokeStyle='#86856a52';c.lineWidth=5;c.stroke();c.strokeStyle='#afa27b47';c.lineWidth=.7;c.stroke();
    c.lineWidth=.5;c.setLineDash([2,3]);circle(31,null,'#d4ce9d66');c.setLineDash([]);
    c.beginPath();c.moveTo(-54,0);c.lineTo(54,0);c.moveTo(0,-54);c.lineTo(0,54);c.strokeStyle='#a4ab8c55';c.stroke();c.restore();
    for(let i=0;i<32;i++){
      const a=i*Math.PI/16;c.beginPath();c.moveTo(Math.sin(a)*54,Math.cos(a)*54);c.lineTo(Math.sin(a)*(i%4===0?59:56),Math.cos(a)*(i%4===0?59:56));
      c.strokeStyle=i%4===0?'#ddcfaa':'#b5af91';c.lineWidth=i%4===0?1:.6;c.stroke();
    }
    c.textAlign='center';c.font='bold 9px Georgia';c.fillStyle='#fff0c2';c.shadowColor='#17241a';c.shadowBlur=2;c.fillText('N',0,-59);
    return base;
  }
  function drawRadar(s){
    const c=radar.getContext('2d');c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,276,276);c.drawImage(radarBase,0,0);
    c.scale(2,2);c.translate(69,69);
    for(const e of s.enemies){
      if(e.hp<=0)continue;
      const x=e.root.position.x*3.24,y=e.root.position.z*3.24;c.save();c.translate(x,y);
      c.fillStyle=e.boss?'#e7aa64':'#cf7764';c.strokeStyle='#492d24';c.lineWidth=1.1;c.beginPath();
      if(e.boss){c.moveTo(0,-4);c.lineTo(3.7,0);c.lineTo(0,4);c.lineTo(-3.7,0);c.closePath();}else c.arc(0,0,2.7,0,Math.PI*2);
      c.fill();c.stroke();c.restore();
    }
    const hero=game.hero.root;
    c.translate(hero.position.x*3.24,hero.position.z*3.24);c.rotate(Math.PI-hero.rotation.y);
    c.fillStyle='#e5cc8e';c.strokeStyle='#263326';c.lineWidth=1;c.beginPath();c.moveTo(0,-5.3);c.lineTo(3.7,4);c.lineTo(0,2.2);c.lineTo(-3.7,4);c.closePath();c.fill();c.stroke();
  }
  const hudValues={};
  function setText(id,value){if(hudValues[id]!==value){hudValues[id]=value;byId(id).textContent=value;}}
  function syncHUD(s){
    setText('health-number',Math.ceil(s.hp)+' / '+s.maxHp);setText('rage-number',Math.floor(s.rage)+' / 100');
    setText('point-count',s.points+' / 3');setText('kills',s.kills+' / '+s.total);
    const hp=s.hp/s.maxHp, rage=s.rage/100;
    if(hudValues.hp!==hp){hudValues.hp=hp;byId('health-fill').style.width=hp*100+'%';}
    if(hudValues.rage!==rage){hudValues.rage=rage;byId('rage-fill').style.width=rage*100+'%';}
    if(hudValues.points!==s.points){hudValues.points=s.points;pointGems.forEach((g,i)=>g.classList.toggle('on',i<s.points));skillButtons.forEach((b,i)=>b.classList.toggle('ready',i<s.points));}
    if(hudValues.killsCount!==s.kills){hudValues.killsCount=s.kills;killPips.forEach((p,i)=>p.classList.toggle('on',i<s.kills));}
    for(const e of s.enemies){
      let tag=plates.get(e.root);
      if(!tag){
        tag=document.createElement('div');tag.className='enemy-tag'+(e.boss?' elite':'');
        const title=document.createElement('strong');title.textContent=e.boss?'半兽人统领':'半兽人';
        const bar=document.createElement('div');bar.className='enemy-hp';bar.append(document.createElement('i'));tag.append(title,bar);plateLayer.append(tag);plates.set(e.root,tag);
      }
      projected.copy(e.root.position);projected.y+=e.boss?3.25:2.46;projected.project(camera);
      tag.hidden=e.hp<=0||projected.z>1||projected.z< -1||Math.abs(projected.x)>1.12||Math.abs(projected.y)>1.15;
      if(!tag.hidden){
        tag.style.transform='translate('+Math.round((projected.x*.5+.5)*width)+'px,'+Math.round((.5-projected.y*.5)*height)+'px) translate(-50%,-100%)';
        tag.lastChild.firstChild.style.width=Math.max(0,e.hp/e.maxHp*100)+'%';tag.classList.toggle('telegraph',!!e.attacking);
      }
    }
    for(const [root,tag] of plates){if(!s.enemies.some(e=>e.root===root)){tag.remove();plates.delete(root);}}
  }
  function resize(){
    needsRender=true;
    width=arena.clientWidth;height=arena.clientHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.65));renderer.setSize(width,height,false);
    camera.aspect=width/Math.max(1,height);
    camera.fov=camera.aspect<1.15?51:41;camera.updateProjectionMatrix();
  }
  function placeCamera(dt,live){
    const hero=game.hero.root.position;
    const smooth=1-Math.exp(-dt*5);
    aim.x+=(hero.x*.91-aim.x)*smooth;aim.z+=((hero.z-3)*.92-aim.z)*smooth;
    const narrow=camera.aspect<1.15?1.28:1;
    const followX=aim.x,followZ=aim.z;
    const wobble=live?Math.sin(clock*1.2)*.025:0;
    camera.position.set(followX+.35+Math.sin(clock*91)*shake,6.5*narrow+wobble,followZ+12.3*narrow);
    camera.lookAt(followX,1.05+Math.cos(clock*75)*shake*.5,followZ-.55);
    camera.updateMatrixWorld();shake*=Math.exp(-dt*16);
  }
  function frame(now){
    const dt=previous?Math.min(Math.max((now-previous)/1000,0),.1):1/60;previous=now;
    if(dialog&&!needsRender)return;
    needsRender=false;
    if(!dialog){clock+=dt;game.update(dt);forest.update(dt,clock);}
    placeCamera(dt,!dialog);const s=game.getState();syncHUD(s);
    radarTime-=dt;if(radarTime<=0){drawRadar(s);radarTime=.08;}
    renderer.render(scene,camera);
  }
  async function loadThree(){
    const urls=['https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.min.js','https://unpkg.com/three@0.180.0/build/three.module.min.js'];
    let lastError;
    for(const url of urls){
      let timer;
      try{
        return await Promise.race([import(url),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('CDN 加载超时')),12000);})]);
      }catch(e){lastError=e;}finally{clearTimeout(timer);}
    }
    throw lastError;
  }
  async function boot(){
    try{
      three=await loadThree();renderer=new three.WebGLRenderer({canvas:world,antialias:true,alpha:false,powerPreference:'high-performance'});
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=three.PCFSoftShadowMap;
      renderer.toneMapping=three.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;
      scene=new three.Scene();camera=new three.PerspectiveCamera(41,1,.12,130);
      forest=window.createForest(three,scene);game=window.createGame({THREE:three,scene,obstacles:forest.obstacles,createCharacter:window.createCharacter,onEvent});
      aim=new three.Vector3(0,1,0);projected=new three.Vector3();radarBase=makeRadar();
      resize();rectObserver=new ResizeObserver(resize);rectObserver.observe(arena);
      frame(performance.now());loading.hidden=true;renderer.setAnimationLoop(frame);
    }catch(error){
      console.error(error);loading.replaceChildren();
      const p=document.createElement('span');p.textContent=three?'启动失败，请检查浏览器的 WebGL 2 支持。':'未能载入 3D 引擎，请检查网络后重试。';
      const retry=document.createElement('button');retry.textContent='重新载入';retry.onclick=()=>location.reload();loading.append(p,retry);
    }
  }
  boot();
})();
