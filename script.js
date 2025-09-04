(async function(){
  const MATTER_CDN='https://cdn.jsdelivr.net/npm/matter-js@0.19.0/build/matter.min.js';
  function loadScript(url){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=()=>resolve();s.onerror=(e)=>reject(e);document.head.appendChild(s);});}
  function domReady(){return new Promise(res=>{if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',res);else res();});}
  await domReady();
  if(typeof Matter==='undefined'){try{await loadScript(MATTER_CDN);}catch(e){alert('Matter.js 로드 실패');return;}}

  // Stage 생성 및 크기 조정
  let stage=document.getElementById('stage')||document.querySelector('.stage');
  if(!stage){
    stage=document.createElement('div');
    stage.id='stage';
    stage.style.position='relative';
    stage.style.width='min(100vw,600px)';
    stage.style.aspectRatio='9/18'; // 세로 길게
    stage.style.margin='72px auto 0';
    stage.style.borderRadius='22px';
    stage.style.overflow='hidden';
    stage.style.background='linear-gradient(180deg,#eefaf3 0%,#eaf6ff 100%)';
    document.body.appendChild(stage);
  }

  // Canvas
  let canvas=document.getElementById('gameCanvas')||stage.querySelector('canvas');
  if(!canvas){
    canvas=document.createElement('canvas');
    canvas.id='gameCanvas';
    canvas.style.position='absolute';
    canvas.style.inset='0';
    canvas.style.width='100%';
    canvas.style.height='100%';
    canvas.style.touchAction='none';
    stage.appendChild(canvas);
  }
  const ctx=canvas.getContext('2d');

  // HUD: 현재 과일, 다음 과일, 점수
  let scoreEl=document.getElementById('score');
  let highEl=document.getElementById('highscore');
  let currentEl=document.getElementById('currentFruit');
  let nextEl=document.getElementById('nextFruit');

  if(!scoreEl||!highEl||!currentEl||!nextEl){
    const hud=document.createElement('div');
    hud.id='suika_hud';
    hud.style.position='fixed';
    hud.style.top='10px';
    hud.style.left='50%';
    hud.style.transform='translateX(-50%)';
    hud.style.background='rgba(0,0,0,0.35)';
    hud.style.color='#fff';
    hud.style.padding='6px 12px';
    hud.style.borderRadius='12px';
    hud.style.zIndex=9999;
    hud.style.display='flex';
    hud.style.gap='12px';
    hud.style.alignItems='center';
    hud.innerHTML=`
      <div>점수: <span id="score">0</span></div>
      <div>최고: <span id="highscore">0</span></div>
      <div>현재: <span id="currentFruit">0</span></div>
      <div>다음: <span id="nextFruit">0</span></div>
    `;
    document.body.appendChild(hud);
    scoreEl=document.getElementById('score');
    highEl=document.getElementById('highscore');
    currentEl=document.getElementById('currentFruit');
    nextEl=document.getElementById('nextFruit');
  }

  // Canvas 크기
  function resizeCanvas(){
    const rect=stage.getBoundingClientRect();
    const dpr=Math.max(1,window.devicePixelRatio||1);
    canvas.width=Math.floor(rect.width*dpr);
    canvas.height=Math.floor(rect.height*dpr);
    canvas.style.width=`${rect.width}px`;
    canvas.style.height=`${rect.height}px`;
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  resizeCanvas();
  window.addEventListener('resize',resizeCanvas);

  // 이미지 및 색상
  const IMG_COUNT=5;
  const IMG_PATHS=Array.from({length:IMG_COUNT},(_,i)=>`images/img${i+1}.png`);
  const COLORS=['#FF0000','#FF6666','#800080','#FFCC33','#FFB347','#FF8C00','#C71585'];

  const iCache={};
  await Promise.all(IMG_PATHS.map(src=>new Promise(res=>{
    const img=new Image();img.onload=()=>{iCache[src]=img;res();};img.onerror=()=>{iCache[src]=null;res();};img.src=src;
  })));

  function buildRadii(){
    const w=stage.clientWidth||Math.min(window.innerWidth,600);
    const minR=Math.max(14,w*0.036);
    const maxR=Math.max(68,w*0.144);
    const radii=Array.from({length:IMG_COUNT},(_,i)=>Math.round(minR+(maxR-minR)*(i/(IMG_COUNT-1))));
    return radii.map(r=>Math.round(r*0.8)); // 0.8배 크기
  }
  let RADII=buildRadii();
  window.addEventListener('resize',()=>{RADII=buildRadii();});

  // Matter.js
  const {Engine,Runner,Bodies,Body,Composite,Events}=Matter;
  let engine=Engine.create();let world=engine.world;
  const runner=Runner.create();Runner.run(runner,engine);

  function addWalls(){
    Composite.allBodies(world).forEach(b=>{if(b.isWall)Composite.remove(world,b);});
    const w=stage.clientWidth,h=stage.clientHeight,t=40;
    const ground=Bodies.rectangle(w/2,h+t/2,w,t,{isStatic:true});
    const left=Bodies.rectangle(-t/2,h/2,t,h,{isStatic:true});
    const right=Bodies.rectangle(w+t/2,h/2,t,h,{isStatic:true});
    const ceil=Bodies.rectangle(w/2,-t,w,t,{isStatic:true});
    [ground,left,right,ceil].forEach(b=>b.isWall=true);
    Composite.add(world,[ground,left,right,ceil]);
  }
  addWalls();
  window.addEventListener('resize',addWalls);

  // 게임 상태
  const photos=new Set();
  let holding=null,gameOver=false,score=0,high=Number(localStorage.getItem('suika_high')||0);
  scoreEl.textContent=score;highEl.textContent=high;
  let currentLevel=randomLevel(),nextLevel=randomLevel();
  currentEl.textContent=currentLevel+1; nextEl.textContent=nextLevel+1;

  function randomLevel(){
    const rnd=Math.random();
    if(rnd<0.25)return 0;
    if(rnd<0.45)return 1;
    if(rnd<0.60)return 2;
    if(rnd<0.75)return 3;
    return 4;
  }

  function gameOverLineY(){return stage.clientHeight*0.15;}

  function createPhoto(x,level=0){
    const r=RADII[Math.max(0,Math.min(level,RADII.length-1))];
    const body=Bodies.circle(x,56,r,{restitution:0.08,frictionAir:0.002,label:'photo'});
    body.level=level;body.radius_px=r;body.isPhoto=true;photos.add(body);Composite.add(world,body);return body;
  }

  function spawnNext(x){
    currentLevel=nextLevel;
    currentEl.textContent=currentLevel+1;
    nextLevel=randomLevel();
    nextEl.textContent=nextLevel+1;
    return createPhoto(x,currentLevel);
  }

  // 병합
  const mergeQueue=[];const mergedFlag=new WeakSet();
  Events.on(engine,'collisionStart',evt=>{
    for(const p of evt.pairs){
      const a=p.bodyA,b=p.bodyB;
      if(!a||!b)continue;if(!a.isPhoto||!b.isPhoto)continue;if(a===b)continue;if(a.level!==b.level)continue;if(mergedFlag.has(a)||mergedFlag.has(b))continue;
      mergedFlag.add(a);mergedFlag.add(b);
      mergeQueue.push([a,b]);
    }
  });

  Events.on(engine,'afterUpdate',()=>{
    if(mergeQueue.length){
      const jobs=mergeQueue.splice(0);
      for(const [a,b]of jobs){
        if(!photos.has(a)||!photos.has(b))continue;
        const lvl=a.level;
        if(lvl>=IMG_COUNT-1)continue;
        const nx=(a.position.x+b.position.x)/2;
        const ny=(a.position.y+b.position.y)/2;
        photos.delete(a);photos.delete(b);
        try{Composite.remove(world,a);Composite.remove(world,b);}catch(e){}
        holding=spawnNext(nx);
        Body.setPosition(holding,{x:nx,y:ny});
        Body.setStatic(holding,true);
        score+=(lvl+1)*10;
        scoreEl.textContent=score;
        if(score>high){high=score;highEl.textContent=high;localStorage.setItem('suika_high',String(high));}
      }
      mergedFlag.clear();
    }

    if(!gameOver){
      const limitY=gameOverLineY();
      for(const b of photos){
        if(b.isStatic)continue;
        const vy=Math.abs(b.velocity.y||0);
        if(vy<0.12){
          if(b.position.y-b.radius_px<limitY){endGame();break;}
        }
      }
    }
  });

  function drawCircleImage(img,x,y,r,angle=0,level=0){
    ctx.save();
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.closePath();ctx.clip();
    if(img){
      const iw=img.width,ih=img.height,ir=iw/ih;
      let dw,dh;if(ir>1){dh=2*r;dw=dh*ir;}else{dw=2*r;dh=dw/ir;}
      ctx.translate(x,y);ctx.rotate(angle*0.25);ctx.drawImage(img,-dw/2,-dh/2,dw,dh);
    }
    ctx.restore();
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.lineWidth=4;ctx.strokeStyle=COLORS[level];ctx.stroke();
  }

  function render(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const w=stage.clientWidth,h=stage.clientHeight;
    const lineY=gameOverLineY();
    ctx.strokeStyle='rgba(255,0,0,0.28)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,lineY);ctx.lineTo(w,lineY);ctx.stroke();
    photos.forEach(b=>{const lvl=b.level;drawCircleImage(iCache[`images/img${lvl+1}.png`],b.position.x,b.position.y,b.radius_px,b.angle||0,lvl);});
    if(holding){const lvl=holding.level;drawCircleImage(iCache[`images/img${lvl+1}.png`],holding.position.x,holding.position.y,holding.radius_px,holding.angle||0,lvl);}
  }

  function getStageXFromEvent(e){const rect=stage.getBoundingClientRect();const clientX=e.touches?e.touches[0].clientX:e.clientX;return Math.max(24,Math.min(rect.width-24,clientX-rect.left));}

  function handlePress(e){e.preventDefault();if(gameOver||holding)return;const x=getStageXFromEvent(e);holding=spawnNext(x);Body.setStatic(holding,true);}
  function handleMove(e){if(!holding)return;e.preventDefault();const x=getStageXFromEvent(e);Body.setPosition(holding,{x:x,y:56});}
  function handleRelease(e){if(!holding)return;e.preventDefault();Body.setStatic(holding,false);holding=null;}

  canvas.addEventListener('touchstart',handlePress,{passive:false});
  canvas.addEventListener('touchmove',handleMove,{passive:false});
  canvas.addEventListener('touchend',handleRelease,{passive:false});
  canvas.addEventListener('mousedown',handlePress);
  window.addEventListener('mousemove',handleMove);
  window.addEventListener('mouseup',handleRelease);

  function endGame(){gameOver=true;setTimeout(()=>{alert('게임 오버! 점수:'+score+'\n새로고침하여 재시작');window.location.reload();},30);}
  function resetGame(){gameOver=false;score=0;scoreEl.textContent='0';photos.forEach(b=>{try{Composite.remove(world,b);}catch(e){}});photos.clear();holding=null;currentLevel=randomLevel();nextLevel=randomLevel();currentEl.textContent=currentLevel+1;nextEl.textContent=nextLevel+1;holding=spawnNext(stage.clientWidth/2);}
  window.addEventListener('keydown',e=>{if(e.key==='r'||e.key==='R')resetGame();});

  holding=spawnNext(stage.clientWidth/2);
  (function loop(){render();requestAnimationFrame(loop);})();
})();
