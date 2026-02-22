(() => {
  const $ = (id) => document.getElementById(id);
  const LS = {
    get(k, fb){ try{ const v = localStorage.getItem(k); return v===null ? fb : JSON.parse(v); } catch(_){ return fb; } },
    set(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
  };
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const rand = (a,b)=>Math.random()*(b-a)+a;

  // ===== World size =====
  const WORLD_W = 900, WORLD_H = 600;

  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha:true });

  let viewW=0, viewH=0, scale=1, offsetX=0, offsetY=0;

  function fitCanvas(){
    const stage = canvas.parentElement;
    const w = stage.clientWidth;
    const h = stage.clientHeight;

    canvas.width = Math.floor(w * devicePixelRatio);
    canvas.height = Math.floor(h * devicePixelRatio);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);

    viewW = w; viewH = h;
    scale = Math.min(viewW / WORLD_W, viewH / WORLD_H);
    offsetX = (viewW - WORLD_W*scale)/2;
    offsetY = (viewH - WORLD_H*scale)/2;
  }
  window.addEventListener('resize', fitCanvas);
  fitCanvas();

  function beginWorld(){ ctx.save(); ctx.translate(offsetX, offsetY); ctx.scale(scale, scale); }
  function endWorld(){ ctx.restore(); }

  // ===== Toast =====
  const toastEl = $('toast');
  let toastTimer = 0;
  function toast(msg){
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    toastTimer = 2400;
  }

  // ===== Audio (generated) =====
  let audioCtx=null;
  let soundOn = LS.get('corp_soundOn', true);
  function ensureAudio(){
    if(!audioCtx){
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = AC ? new AC() : null;
    }
    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
  }
  function tone(type='square', f=440, dur=0.06, vol=0.03, slideTo=null){
    if(!soundOn) return;
    ensureAudio(); if(!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if(slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t0); o.stop(t0 + dur);
  }
  const SFX = {
    shoot(){ tone('square', 520, 0.03, 0.02, 720); },
    hit(){ tone('sawtooth', 180, 0.05, 0.03, 90); },
    coin(){ tone('triangle', 980, 0.02, 0.015, 1200); },
    buy(){ tone('square', 740, 0.05, 0.03, 980); },
    levelUp(){ tone('triangle', 720, 0.12, 0.03, 1300); },
    bossSpawn(){ tone('sawtooth', 92, 0.28, 0.04, 55); },
    bossDown(){ tone('triangle', 340, 0.22, 0.04, 920); },
    win(){ tone('triangle', 660, 0.18, 0.04, 1320); },
    lose(){ tone('sawtooth', 140, 0.18, 0.04, 80); },
    block(){ tone('triangle', 900, 0.06, 0.03, 1200); },
    contract(){ tone('triangle', 540, 0.10, 0.04, 980); },
    missile(){ tone('sawtooth', 140, 0.22, 0.05, 60); }
  };
  canvas.addEventListener('pointerdown', ensureAudio);

  // ===== Progress =====
  let totalCoins = Number(LS.get('corp_totalCoins', 0)) || 0;
  let ownedShips = LS.get('corp_ownedShips', [0]);
  let selectedShipIdx = Number(LS.get('corp_selectedShip', 0)) || 0;
  let upgrades = LS.get('corp_upgrades', { rate:0, dmg:0, mag:0, block:0, laser:0 });

  // compat: por si vienes de una versión vieja sin 'laser'
  if(typeof upgrades.laser !== 'number') upgrades.laser = 0;
  let shieldCharges = Number(LS.get('corp_shieldCharges', 0)) || 0;
  let missiles = Number(LS.get('corp_missiles', 0)) || 0;

  let loadouts = LS.get('corp_loadouts', {});
  let ownedParts = LS.get('corp_ownedParts', ['engine_stock','weapon_blaster','hull_light','shield_none']);

  let champSkins = LS.get('corp_champSkins', []); // array colors
  let rank = LS.get('corp_rank', { champs:[], totalWins:0, totalProfit:0 }); // local ranking
  let achievements = LS.get('corp_ach', { champWins:0, missileKOs:0 });

  function saveAll(){
    LS.set('corp_totalCoins', totalCoins);
    LS.set('corp_ownedShips', ownedShips);
    LS.set('corp_selectedShip', selectedShipIdx);
    LS.set('corp_upgrades', upgrades);
    LS.set('corp_shieldCharges', shieldCharges);
    LS.set('corp_missiles', missiles);
    LS.set('corp_soundOn', soundOn);
    LS.set('corp_loadouts', loadouts);
    LS.set('corp_ownedParts', ownedParts);
    LS.set('corp_champSkins', champSkins);
    LS.set('corp_rank', rank);
    LS.set('corp_ach', achievements);
  }

  // ===== Ships (más naves GOD) =====
  const shipConfigs = [
    { name:"Recluta",  color:"#888",      shape:"tri",     b:1, cd:420, spd:5.6, price:0,      hp:3 },
    { name:"Explo",    color:"#00ff77",   shape:"tri",     b:1, cd:330, spd:6.2, price:600,    hp:3 },
    { name:"V-Twin",   color:"#00d6ff",   shape:"twin",    b:2, cd:360, spd:6.4, price:1600,   hp:3 },
    { name:"Cazador",  color:"#4b6bff",   shape:"delta",   b:2, cd:230, spd:7.4, price:4200,   hp:3 },
    { name:"Tridente", color:"#ff00ff",   shape:"trident", b:3, cd:320, spd:7.6, price:8800,   hp:3 },
    { name:"Valkiria", color:"#ff8a00",   shape:"delta",   b:3, cd:200, spd:8.2, price:15500,  hp:4 },
    { name:"Titán",    color:"#ff2b2b",   shape:"hex",     b:4, cd:240, spd:8.4, price:26000,  hp:4 },
    { name:"Nova",     color:"#ffee00",   shape:"hex",     b:4, cd:140, spd:9.2, price:42000,  hp:4 },
    { name:"Fénix",    color:"#ffffff",   shape:"orb",     b:2, cd:120, spd:9.6, price:65000,  hp:4, dmgBase:2 },
    { name:"ZEUS",     color:"#00ffff",   shape:"zeus",    b:6, cd:95,  spd:11.0,price:120000, hp:5, dmgBase:2 },

    // GOD ships
    { name:"RAZORJET", color:"#b4ff00", shape:"twin",   b:5, cd:88, spd:12.4, price:220000, hp:5, dmgBase:2.15 },
    { name:"WIDOW",    color:"#ff3b9d", shape:"delta",  b:7, cd:82, spd:12.0, price:420000, hp:6, dmgBase:2.35 },
    { name:"APEX",     color:"#a07bff", shape:"orb",    b:8, cd:78, spd:13.2, price:650000, hp:7, dmgBase:2.60 },
  ];

  // ===== Parts catalog =====
  const PARTS = {
    engine: [
      { id:'engine_stock', name:'Stock', price:0, spdMul:1.00, dur:100, desc:'Equilibrado.' },
      { id:'engine_ion', name:'Ion', price:2200, spdMul:1.10, dur:110, desc:'+10% velocidad.' },
      { id:'engine_turbo', name:'Turbo', price:6500, spdMul:1.22, dur:95, desc:'+22% vel pero frágil.' },
      { id:'engine_warp', name:'Warp', price:15500, spdMul:1.35, dur:85, desc:'+35% vel, caro.' },
      { id:'engine_corpX', name:'Corp-X', price:38000, spdMul:1.55, dur:120, desc:'+55% vel (élite).' },
      { id:'engine_helios', name:'Helios', price:120000, spdMul:1.82, dur:140, desc:'Motor solar GOD.' },
    ],
    weapon: [
      { id:'weapon_blaster', name:'Blaster', price:0, dmgAdd:0, cdMul:1.00, dur:100, desc:'Básica.' },
      { id:'weapon_gatling', name:'Gatling', price:3200, dmgAdd:-0.15, cdMul:0.78, dur:90, desc:'Dispara rápido.' },
      { id:'weapon_plasma', name:'Plasma', price:7200, dmgAdd:0.55, cdMul:1.05, dur:95, desc:'+daño, un poco más lenta.' },
      { id:'weapon_rail', name:'Rail', price:14000, dmgAdd:1.10, cdMul:1.20, dur:85, desc:'Mucho daño.' },
      { id:'weapon_scatter', name:'Scatter', price:18000, dmgAdd:0.25, cdMul:0.95, dur:80, desc:'Siente “shotgun”.' },
      { id:'weapon_blackops', name:'Black Ops', price:52000, dmgAdd:1.65, cdMul:0.92, dur:120, desc:'Corporativo ilegal.' },
      { id:'weapon_laser', name:'Laser', price:95000, dmgAdd:2.05, cdMul:1.05, dur:105, desc:'Rayo corporativo (GOD).' },
    ],
    hull: [
      { id:'hull_light', name:'Ligero', price:0, hpAdd:0, dur:110, desc:'Más durabilidad.' },
      { id:'hull_reinf', name:'Reforzado', price:5200, hpAdd:1, dur:140, desc:'+1 vida base.' },
      { id:'hull_titan', name:'Titán', price:16000, hpAdd:2, dur:180, desc:'+2 vidas base.' },
      { id:'hull_fortress', name:'Fortress', price:42000, hpAdd:3, dur:230, desc:'Tanque corporativo.' },
      { id:'hull_onyx', name:'Onyx', price:160000, hpAdd:4, dur:280, desc:'Casco negro GOD.' },
    ],
    shield: [
      { id:'shield_none', name:'Sin gen', price:0, blockMul:0.90, dur:90, desc:'Solo consumibles.' },
      { id:'shield_deflector', name:'Deflector', price:4200, blockMul:1.10, dur:120, desc:'+bloqueo.' },
      { id:'shield_aegis', name:'Aegis', price:15500, blockMul:1.25, dur:150, desc:'Bloqueo premium.' },
      { id:'shield_omega', name:'Omega', price:46000, blockMul:1.40, dur:200, desc:'Corporativo top.' },
      { id:'shield_seraph', name:'Seraph', price:140000, blockMul:1.65, dur:240, desc:'Escudo angelical GOD.' },
    ]
  };

  function partById(id){
    for(const k of Object.keys(PARTS)){
      const found = PARTS[k].find(p=>p.id===id);
      if(found) return { ...found, type:k };
    }
    return null;
  }

  function ensureLoadout(shipIdx){
    if(!loadouts[shipIdx]){
      loadouts[shipIdx] = {
        paint: shipConfigs[shipIdx].color,
        engine: { id:'engine_stock', d:PARTS.engine[0].dur },
        weapon: { id:'weapon_blaster', d:PARTS.weapon[0].dur },
        hull:   { id:'hull_light', d:PARTS.hull[0].dur },
        shield: { id:'shield_none', d:PARTS.shield[0].dur }
      };
    } else {
      const L=loadouts[shipIdx];
      if(!L.paint) L.paint = shipConfigs[shipIdx].color;
      for(const t of ['engine','weapon','hull','shield']){
        if(!L[t] || !L[t].id){
          const def = (t==='engine'?'engine_stock':t==='weapon'?'weapon_blaster':t==='hull'?'hull_light':'shield_none');
          const pd = partById(def);
          L[t] = { id:def, d: pd?pd.dur:100 };
        }
        const pd = partById(L[t].id);
        if(pd) L[t].d = clamp(Number(L[t].d)||pd.dur, 0, pd.dur);
      }
    }
    // pintar con skin si existe
    if(champSkins.length && !loadouts[shipIdx].paintLocked){
      // no forzar, solo mantener lo que tenga
    }
    saveAll();
  }

  function isBroken(shipIdx, type){
    ensureLoadout(shipIdx);
    return (loadouts[shipIdx][type].d<=0);
  }

  function isInoperable(shipIdx){
    return isBroken(shipIdx,'engine') || isBroken(shipIdx,'weapon') || isBroken(shipIdx,'hull') || isBroken(shipIdx,'shield');
  }

  function effPaint(shipIdx){ ensureLoadout(shipIdx); return loadouts[shipIdx].paint || shipConfigs[shipIdx].color; }
  function effBaseHP(shipIdx){
    const ship = shipConfigs[shipIdx];
    ensureLoadout(shipIdx);
    const hull = partById(loadouts[shipIdx].hull.id);
    const add = hull ? (hull.hpAdd||0) : 0;
    return ship.hp + add;
  }
  function effSpeed(shipIdx){
    const ship = shipConfigs[shipIdx];
    ensureLoadout(shipIdx);
    const eng = partById(loadouts[shipIdx].engine.id);
    let mul = eng ? (eng.spdMul||1) : 1;
    if(isBroken(shipIdx,'engine')) mul *= 0.65;
    return ship.spd * mul;
  }
  function effCooldown(shipIdx){
    const ship = shipConfigs[shipIdx];
    ensureLoadout(shipIdx);
    const wep = partById(loadouts[shipIdx].weapon.id);
    let mul = wep ? (wep.cdMul||1) : 1;
    mul *= (1 - upgrades.rate*0.05);
    if(isBroken(shipIdx,'weapon')) mul *= 1.60;
    return Math.max(55, ship.cd * mul);
  }
  function effDamage(shipIdx){
    const ship = shipConfigs[shipIdx];
    ensureLoadout(shipIdx);
    const wep = partById(loadouts[shipIdx].weapon.id);
    const base = (ship.dmgBase||1) + upgrades.dmg*0.35 + (wep ? (wep.dmgAdd||0) : 0);
    return Math.max(0.25, isBroken(shipIdx,'weapon') ? base*0.70 : base);
  }
  function effBlockMul(shipIdx){
    ensureLoadout(shipIdx);
    const sh = partById(loadouts[shipIdx].shield.id);
    let mul = sh ? (sh.blockMul||1) : 1;
    if(isBroken(shipIdx,'shield')) mul *= 0.70;
    return mul;
  }

  // ===== UI refs =====
  const elCoins = $('coins'), elScore = $('score'), elLives = $('lives'), elLevel = $('level'), elModeTxt = $('modeTxt'), elShields=$('shields'), elMissiles=$('missiles');
  const menu = $('menu');
  const btnStartDefault = $('btnStartDefault');

  const btnFullscreen = $('btnFullscreen');
  const btnPause = $('btnPause');
  const btnSound = $('btnSound');
  const btnReset = $('btnReset');

  const tabShop = $('tabShop'), tabUpg = $('tabUpg'), tabParts=$('tabParts'), tabRepair=$('tabRepair'), tabRank=$('tabRank');
  const viewShop = $('viewShop'), viewUpg = $('viewUpg'), viewParts=$('viewParts'), viewRepair=$('viewRepair'), viewRank=$('viewRank');

  const shopShipsEl = $('shopShips');
  const shopPartsEl = $('shopParts');

  const buyShield1 = $('buyShield1'), buyShield5 = $('buyShield5'), shieldCountBadge = $('shieldCountBadge');
  const buyMissile1 = $('buyMissile1'), buyMissile3 = $('buyMissile3'), missileCountBadge = $('missileCountBadge');

  const paintColor = $('paintColor'), savePaint = $('savePaint'), paintBadge=$('paintBadge');
  const skinsTxt = $('skinsTxt');
  const partsModeBadge=$('partsModeBadge');
  const partsMotor=$('partsMotor'), partsWeapon=$('partsWeapon'), partsHull=$('partsHull'), partsShield=$('partsShield');

  const durBadge=$('durBadge'), durTxt=$('durTxt'), repair25=$('repair25'), repair100=$('repair100'), repairCostTxt=$('repairCostTxt');

  const contractsTxt=$('contractsTxt'), contractsBadge=$('contractsBadge');

  const rankTxt=$('rankTxt'), rankBadge=$('rankBadge'), achTxt=$('achTxt');

  btnSound.textContent = 'Sonido: ' + (soundOn ? 'ON' : 'OFF');

  function setTab(which){
    const all = [
      [tabShop, viewShop, 'shop'],
      [tabUpg, viewUpg, 'upg'],
      [tabParts, viewParts, 'parts'],
      [tabRepair, viewRepair, 'repair'],
      [tabRank, viewRank, 'rank'],
    ];
    for(const [t,v,k] of all){
      const on = (k===which);
      t.classList.toggle('active', on);
      v.style.display = on ? '' : 'none';
    }
    if(which==='parts'){ renderContractsUI(); renderPartsShop(); renderSkinsUI(); }
    if(which==='repair'){ renderRepairUI(); }
    if(which==='rank'){ renderRankUI(); }
  }
  tabShop.onclick = () => setTab('shop');
  tabUpg.onclick  = () => setTab('upg');
  tabParts.onclick = () => setTab('parts');
  tabRepair.onclick = () => setTab('repair');
  tabRank.onclick = () => setTab('rank');

  btnFullscreen.onclick = async () => {
    try{
      if(!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
      setTimeout(fitCanvas, 60);
    }catch(_){}
  };

  let paused=false;
  btnPause.onclick = () => {
    if(state === 'menu') return;
    paused = !paused;
    btnPause.textContent = paused ? 'Reanudar' : 'Pausar';
  };

  btnSound.onclick = () => {
    soundOn = !soundOn;
    btnSound.textContent = 'Sonido: ' + (soundOn ? 'ON' : 'OFF');
    saveAll(); SFX.buy();
  };

  btnReset.onclick = () => {
    if(!confirm('¿Seguro? Borra monedas, naves, piezas, mejoras, escudos, misiles y ranking.')) return;
    [
      'corp_totalCoins','corp_ownedShips','corp_selectedShip','corp_upgrades',
      'corp_shieldCharges','corp_missiles','corp_soundOn','corp_loadouts','corp_ownedParts',
      'corp_champSkins','corp_rank','corp_ach'
    ].forEach(k=>localStorage.removeItem(k));
    location.reload();
  };

  function buyShields(qty, price){
    if(totalCoins < price) return;
    totalCoins -= price;
    shieldCharges += qty;
    saveAll();
    renderShipsShop(); renderUpgrades(); updateHUD();
    SFX.buy();
  }
  buyShield1.onclick = () => buyShields(1, 250);
  buyShield5.onclick = () => buyShields(5, 1100);

  function buyMissiles(qty, price){
    if(totalCoins < price) return;
    totalCoins -= price;
    missiles += qty;
    saveAll();
    updateHUD();
    renderShipsShop();
    SFX.buy();
    toast(`Misiles: +${qty}`);
  }
  buyMissile1.onclick = () => buyMissiles(1, 50000);
  buyMissile3.onclick = () => buyMissiles(3, 145000);

  // ===== Upgrades =====
  const UMAX = 10;
  const upCost = (base, lvl) => Math.floor(base * Math.pow(1.65, lvl));
  function renderUpgrades(){
    const rateCost = upCost(320, upgrades.rate);
    const dmgCost  = upCost(380, upgrades.dmg);
    const magCost  = upCost(260, upgrades.mag);
    const blkCost  = upCost(480, upgrades.block);
    const lasCost  = upCost(900, upgrades.laser);

    $('uRate').textContent  = `Lv ${upgrades.rate}`;
    $('uDmg').textContent   = `Lv ${upgrades.dmg}`;
    $('uMag').textContent   = `Lv ${upgrades.mag}`;
    $('uBlock').textContent = `Lv ${upgrades.block}`;
    $('uLaser').textContent = `Lv ${upgrades.laser}`;

    const bind = (btnId, key, cost) => {
      const btn = $(btnId);
      const lvl = upgrades[key];
      btn.textContent = (lvl >= UMAX) ? 'MAX' : `Comprar (${cost.toLocaleString()} 💰)`;
      btn.disabled = (lvl >= UMAX) || (totalCoins < cost);
      btn.onclick = () => {
        if(btn.disabled) return;
        totalCoins -= cost;
        upgrades[key] += 1;
        saveAll();
        renderUpgrades(); renderShipsShop(); updateHUD();
        SFX.buy();
      };
    };
    bind('uRateBtn','rate',rateCost);
    bind('uDmgBtn','dmg',dmgCost);
    bind('uMagBtn','mag',magCost);
    bind('uBlockBtn','block',blkCost);
    bind('uLaserBtn','laser',lasCost);

    buyShield1.disabled = totalCoins < 250;
    buyShield5.disabled = totalCoins < 1100;
    buyMissile1.disabled = totalCoins < 50000;
    buyMissile3.disabled = totalCoins < 145000;
  }

  // ===== Ships shop =====
  function renderShipsShop(){
    shopShipsEl.innerHTML = '';
    shipConfigs.forEach((s, i) => {
      const isOwned = ownedShips.includes(i);
      const isSelected = selectedShipIdx === i;

      ensureLoadout(i);

      const card = document.createElement('div');
      card.className = `card2 ${isOwned?'owned':''} ${isSelected?'selected':''}`;

      const priceTxt = i===0 ? 'Gratis' : `${s.price.toLocaleString()} 💰`;
      const rateTxt = Math.round(1000/s.cd);

      const hpEff = effBaseHP(i);
      const spEff = effSpeed(i);

      const inop = isInoperable(i);

      card.innerHTML = `
        <div class="head2">
          <h4>${s.name}</h4>
          <span class="badge" style="border-color:${effPaint(i)}66;color:${effPaint(i)}">
            ${isSelected?'Equipado':(isOwned?'Comprada':'Venta')}
          </span>
        </div>
        <div class="meta">
          <div>🔫 Cañones: <b>${s.b}</b></div>
          <div>⚡ Cadencia base: <b>${rateTxt} r/s</b></div>
          <div>🏎️ Vel (con motor): <b>${spEff.toFixed(1)}</b></div>
          <div>❤️ Vidas (con casco): <b>${hpEff}</b></div>
          <div>💰 Precio: <b>${priceTxt}</b></div>
          <div>🧩 Estado: <b>${inop ? 'INOPERABLE' : 'OK'}</b></div>
        </div>
        <button id="shipBtn_${i}"></button>
      `;

      const btn = card.querySelector(`#shipBtn_${i}`);
      if(isSelected){
        btn.className = 'eq'; btn.textContent = 'Equipado'; btn.disabled = true;
      } else if(isOwned){
        btn.className = 'use'; btn.textContent = 'Usar';
        btn.onclick = () => { selectedShipIdx=i; saveAll(); resetRun(); SFX.buy(); renderShipsShop(); renderPartsShop(); renderRepairUI(); updateHUD(); };
      } else {
        const can = totalCoins >= s.price;
        btn.className = can ? 'buy' : 'disabled';
        btn.textContent = can ? 'Comprar' : 'No alcanza';
        btn.disabled = !can;
        btn.onclick = () => {
          if(totalCoins < s.price) return;
          totalCoins -= s.price;
          ownedShips.push(i);
          ensureLoadout(i);
          saveAll();
          renderShipsShop(); renderUpgrades(); updateHUD();
          SFX.buy(); toast('Nave adquirida.');
        };
      }
      shopShipsEl.appendChild(card);
    });

    buyShield1.disabled = totalCoins < 250;
    buyShield5.disabled = totalCoins < 1100;
    buyMissile1.disabled = totalCoins < 50000;
    buyMissile3.disabled = totalCoins < 145000;
  }

  // ===== Parts UI & shop =====
  let partsMode = 'engine';
  function ownedPart(id){ return ownedParts.includes(id); }

  function renderSkinsUI(){
    const list = champSkins.length ? champSkins.map(c=>c.toUpperCase()).join(', ') : '—';
    skinsTxt.textContent = `Skins: ${list}`;
  }

  function renderPartsShop(){
    ensureLoadout(selectedShipIdx);
    partsModeBadge.textContent = (partsMode==='engine'?'Motor':partsMode==='weapon'?'Arma':partsMode==='hull'?'Casco':'Escudo');

    paintColor.value = effPaint(selectedShipIdx);
    paintBadge.textContent = effPaint(selectedShipIdx);

    shopPartsEl.innerHTML = '';
    const list = PARTS[partsMode];

    for(const p of list){
      const isOwned = ownedPart(p.id) || p.price===0;
      const equippedId = loadouts[selectedShipIdx][partsMode].id;
      const isEquipped = (equippedId===p.id);

      const card = document.createElement('div');
      card.className = `card2 ${isOwned?'owned':''} ${isEquipped?'selected':''}`;

      const statLine = (() => {
        if(partsMode==='engine') return `🏎️ Vel x<b>${p.spdMul.toFixed(2)}</b>`;
        if(partsMode==='weapon') return `⚡ CD x<b>${p.cdMul.toFixed(2)}</b> | 💥 +<b>${p.dmgAdd.toFixed(2)}</b>`;
        if(partsMode==='hull') return `❤️ +<b>${p.hpAdd}</b>`;
        if(partsMode==='shield') return `🛡️ Bloqueo x<b>${p.blockMul.toFixed(2)}</b>`;
        return '';
      })();

      card.innerHTML = `
        <div class="head2">
          <h4>${p.name}</h4>
          <span class="badge">${isEquipped?'Equipado':(isOwned?'Disponible':`${p.price.toLocaleString()} 💰`)}</span>
        </div>
        <div class="meta">
          <div>${statLine}</div>
          <div>🔧 Durabilidad: <b>${p.dur}</b></div>
          <div class="tiny">${p.desc}</div>
        </div>
        <button></button>
      `;

      const btn = card.querySelector('button');

      if(isEquipped){
        btn.className='eq'; btn.textContent='Equipado'; btn.disabled=true;
      } else if(isOwned){
        btn.className='use'; btn.textContent='Equipar';
        btn.onclick = () => {
          const pd = partById(p.id);
          loadouts[selectedShipIdx][partsMode] = { id:p.id, d: pd.dur };
          saveAll();
          resetRun();
          renderPartsShop(); renderShipsShop(); renderRepairUI(); updateHUD();
          SFX.buy(); toast('Pieza equipada.');
        };
      } else {
        const can = totalCoins >= p.price;
        btn.className = can ? 'buy' : 'disabled';
        btn.textContent = can ? `Comprar (${p.price.toLocaleString()} 💰)` : 'No alcanza';
        btn.disabled = !can;
        btn.onclick = () => {
          if(totalCoins < p.price) return;
          totalCoins -= p.price;
          ownedParts.push(p.id);
          saveAll();
          renderPartsShop(); renderShipsShop(); updateHUD();
          SFX.buy(); toast('Pieza comprada.');
        };
      }

      shopPartsEl.appendChild(card);
    }
  }

  partsMotor.onclick = () => { partsMode='engine'; renderPartsShop(); };
  partsWeapon.onclick = () => { partsMode='weapon'; renderPartsShop(); };
  partsHull.onclick   = () => { partsMode='hull'; renderPartsShop(); };
  partsShield.onclick = () => { partsMode='shield'; renderPartsShop(); };

  savePaint.onclick = () => {
    ensureLoadout(selectedShipIdx);
    loadouts[selectedShipIdx].paint = paintColor.value;
    saveAll();
    renderPartsShop(); renderShipsShop();
    SFX.buy(); toast('Color guardado.');
  };

  // ===== Repair UI (GOD: más caro) =====
  function durabilityPct(shipIdx, type){
    ensureLoadout(shipIdx);
    const id = loadouts[shipIdx][type].id;
    const pd = partById(id);
    if(!pd) return 100;
    return Math.round((loadouts[shipIdx][type].d / pd.dur)*100);
  }

  function calcRepairCost(shipIdx, pct){
    // GOD: sube fuerte costo (especialmente piezas caras) + “mano de obra” + escala por nave cara
    const types=['engine','weapon','hull','shield'];
    let missing=0, value=0, tier=0;
    for(const t of types){
      const L=loadouts[shipIdx][t];
      const pd=partById(L.id);
      if(!pd) continue;
      const miss = pd.dur - L.d;
      if(miss<=0) continue;
      missing += miss;
      value += (pd.price*0.22 + 80); // era 0.12 + 40
      tier += pd.price;
    }
    const shipPrice = shipConfigs[shipIdx].price || 0;
    const tierMul = 1 + Math.min(1.4, (tier + shipPrice) / 260000); // 1..2.4
    const base = Math.floor((missing * 4.9) + value + 220);
    return Math.max(220, Math.floor(base * pct * tierMul));
  }

  function applyRepair(shipIdx, pct){
    ensureLoadout(shipIdx);
    const cost = calcRepairCost(shipIdx, pct);
    if(totalCoins < cost) return false;

    totalCoins -= cost;
    const types=['engine','weapon','hull','shield'];
    for(const t of types){
      const L=loadouts[shipIdx][t];
      const pd=partById(L.id);
      if(!pd) continue;
      const miss = pd.dur - L.d;
      if(miss<=0) continue;
      L.d += Math.ceil(miss * pct);
      L.d = clamp(L.d, 0, pd.dur);
    }
    saveAll();
    resetRun();
    renderRepairUI(); renderShipsShop(); updateHUD();
    SFX.buy(); toast(pct>=1 ? 'Reparación completa.' : 'Reparación parcial.');
    return true;
  }

  function renderRepairUI(){
    ensureLoadout(selectedShipIdx);
    const types=['engine','weapon','hull','shield'];
    const labels={engine:'Motor',weapon:'Arma',hull:'Casco',shield:'Escudo'};
    const lines=[];
    for(const t of types){
      const id = loadouts[selectedShipIdx][t].id;
      const pd = partById(id);
      const pct = durabilityPct(selectedShipIdx,t);
      const status = (pct<=0) ? 'ROTO (INOPERABLE)' : (pct<35?'CRÍTICO':(pct<70?'DAÑADO':'OK'));
      lines.push(`• ${labels[t]}: ${pd?pd.name:id} — ${pct}% (${status})`);
    }
    durTxt.textContent = lines.join('\n');
    durTxt.style.whiteSpace='pre-line';
    durBadge.textContent = `Nave: ${shipConfigs[selectedShipIdx].name}`;

    const c25 = calcRepairCost(selectedShipIdx, 0.25);
    const c100 = calcRepairCost(selectedShipIdx, 1.0);
    repairCostTxt.textContent = `Costo: 25% = ${c25.toLocaleString()} 💰 | 100% = ${c100.toLocaleString()} 💰`;

    repair25.disabled = totalCoins < c25;
    repair100.disabled = totalCoins < c100;

    repair25.onclick = () => applyRepair(selectedShipIdx, 0.25);
    repair100.onclick = () => applyRepair(selectedShipIdx, 1.0);
  }

  // ===== Contracts (solo campaña) =====
  let contracts=[];
  let contractClock=0;

  function newContracts(){
    const a = [
      { id:'kill', txt:(n)=>`Elimina ${n} enemigos`, goal: ()=>Math.floor(rand(18,30)+level*2), prog:0, kind:'kill', reward:()=>Math.floor(900 + level*250) },
      { id:'coins', txt:(n)=>`Recolecta ${n} monedas`, goal: ()=>Math.floor(rand(80,120)+level*8), prog:0, kind:'coins', reward:()=>Math.floor(1100 + level*280) },
      { id:'boss', txt:()=>`Derrota 1 Boss`, goal: ()=>1, prog:0, kind:'boss', reward:()=>Math.floor(1800 + level*420) },
      { id:'survive', txt:(n)=>`Sobrevive ${n}s`, goal: ()=>Math.floor(rand(25,40)), prog:0, kind:'survive', reward:()=>Math.floor(1200 + level*300) },
    ];
    contracts=[];
    const pick = () => a[Math.floor(Math.random()*a.length)];
    while(contracts.length<3){
      const c=pick();
      if(contracts.some(x=>x.kind===c.kind)) continue;
      const g=c.goal();
      contracts.push({
        kind:c.kind, goal:g, prog:0, done:false,
        reward:c.reward(),
        label: c.txt(g)
      });
    }
  }

  function renderContractsUI(){
    const done = contracts.filter(c=>c.done).length;
    contractsBadge.textContent = `${done}/3`;
    if(mode!=='campaign'){ contractsTxt.textContent = 'En torneo no hay contratos.'; return; }
    if(!contracts.length){ contractsTxt.textContent = 'Inicia una partida para generar contratos.'; return; }
    const lines = contracts.map(c => `• ${c.done?'✅':'⬜'} ${c.label} (${Math.floor(c.prog)}/${c.goal}) +${c.reward}💰`);
    contractsTxt.textContent = lines.join('\n');
    contractsTxt.style.whiteSpace='pre-line';
  }

  function completeContract(c){
    c.done=true;
    totalCoins += c.reward;
    saveAll();
    SFX.contract();
    toast(`Contrato completado: +${c.reward.toLocaleString()} 💰`);
    renderContractsUI();
    updateHUD();
  }

  function tickSurvive(dt){
    const c = contracts.find(x=>x.kind==='survive' && !x.done);
    if(!c) return;
    c.prog += dt/1000;
    if(c.prog >= c.goal){
      c.prog = c.goal;
      completeContract(c);
    }
  }

  // ===== Ranking UI =====
  function renderRankUI(){
    const champs = (rank?.champs || []).slice(0,6);
    rankBadge.textContent = `${(rank?.totalWins||0)}W / +${Math.floor(rank?.totalProfit||0).toLocaleString()}💰`;

    const lines = champs.length
      ? champs.map((c,i)=>`${i+1}. ${c.name} — ${c.wins}W — +${Math.floor(c.profit).toLocaleString()}💰`).join('\n')
      : 'Aún no hay campeones. Gana un torneo 😈';

    rankTxt.textContent = lines;
    rankTxt.style.whiteSpace = 'pre-line';

    achTxt.textContent =
      `• Campeonatos: ${achievements.champWins}\n`+
      `• Missile KOs: ${achievements.missileKOs}\n`+
      `• Skins desbloqueadas: ${champSkins.length}`;
    achTxt.style.whiteSpace='pre-line';
  }

  // ===== Game core =====
  let state='menu';     // menu | playing | gameover
  let mode='campaign';  // campaign | tournament
  const bullets=[], enemies=[], particles=[], coins=[], stars=[], missilesFx=[], debris=[];
  const keys={};

  // ===== Mobile touch controls =====
  const touchUI = $('touchControls');
  const joyBase = $('joyBase');
  const joyKnob = $('joyKnob');
  const btnFire = $('btnFire');
  const btnMissile = $('btnMissile');
  const btnPauseTouch = $('btnPauseTouch');

  const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  let joyActive = false;
  let joyCenter = { x:0, y:0 };
  let joyVec = { x:0, y:0 };

  function setJoyKnob(nx, ny){
    const r = 46; // max knob travel
    const x = clamp(nx, -1, 1) * r;
    const y = clamp(ny, -1, 1) * r;
    joyKnob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }

  function joyToKeys(){
    // reset movement keys
    keys['ArrowLeft']=false; keys['ArrowRight']=false; keys['ArrowUp']=false; keys['ArrowDown']=false;
    const dx = joyVec.x, dy = joyVec.y;
    const dead = 0.18;
    if(dx < -dead) keys['ArrowLeft']=true;
    if(dx >  dead) keys['ArrowRight']=true;
    if(dy < -dead) keys['ArrowUp']=true;
    if(dy >  dead) keys['ArrowDown']=true;
  }

  if(isCoarse && touchUI){
    // joystick
    joyBase.addEventListener('pointerdown', (e)=>{
      joyActive = true;
      joyBase.setPointerCapture(e.pointerId);
      const r = joyBase.getBoundingClientRect();
      joyCenter = { x: r.left + r.width/2, y: r.top + r.height/2 };
      joyVec = { x:0, y:0 };
      setJoyKnob(0,0);
      joyToKeys();
      ensureAudio();
    });

    joyBase.addEventListener('pointermove', (e)=>{
      if(!joyActive) return;
      const dx = (e.clientX - joyCenter.x);
      const dy = (e.clientY - joyCenter.y);
      const max = 54;
      joyVec = { x: clamp(dx/max, -1, 1), y: clamp(dy/max, -1, 1) };
      setJoyKnob(joyVec.x, joyVec.y);
      joyToKeys();
    });

    function joyEnd(){
      joyActive=false;
      joyVec={x:0,y:0};
      setJoyKnob(0,0);
      joyToKeys();
    }
    joyBase.addEventListener('pointerup', joyEnd);
    joyBase.addEventListener('pointercancel', joyEnd);

    // fire hold
    const setFire = (on)=>{ keys['Space']=on; };
    btnFire.addEventListener('pointerdown', (e)=>{ e.preventDefault(); ensureAudio(); setFire(true); btnFire.setPointerCapture(e.pointerId); });
    btnFire.addEventListener('pointerup', ()=>setFire(false));
    btnFire.addEventListener('pointercancel', ()=>setFire(false));
    btnFire.addEventListener('pointerleave', ()=>setFire(false));

    // missile tap
    btnMissile.addEventListener('click', ()=>{ keys['KeyM']=true; setTimeout(()=>keys['KeyM']=false, 60); });

    // pause
    btnPauseTouch.addEventListener('click', ()=>{
      if(state==='menu') return;
      paused = !paused;
      btnPause.textContent = paused ? 'Reanudar' : 'Pausar';
    });
  }


  document.addEventListener('keydown', (e)=>{
    keys[e.code]=true;

    if(e.code==='KeyP' && state!=='menu'){ paused=!paused; btnPause.textContent = paused?'Reanudar':'Pausar'; }
    if(e.code==='Enter' && state==='gameover'){ resetRun(); state='playing'; }

    // TEST coins
    if(e.code === 'NumpadMultiply'){
      const add = 10000;
      totalCoins += add;
      saveAll();
      renderShipsShop(); renderUpgrades(); renderPartsShop(); renderRepairUI(); updateHUD();
      toast(`TEST: +${add.toLocaleString()} 💰`);
      SFX.buy();
    } else if(e.key === '*'){
      const addStr = prompt('TEST: ¿Cuántas monedas quieres agregar?', '10000');
      const add = Math.max(0, parseInt(addStr||'10000',10)||10000);
      totalCoins += add;
      saveAll();
      renderShipsShop(); renderUpgrades(); renderPartsShop(); renderRepairUI(); updateHUD();
      toast(`TEST: +${add.toLocaleString()} 💰`);
      SFX.buy();
    }

    if(e.code==='Space') e.preventDefault();
  }, {passive:false});
  document.addEventListener('keyup', (e)=> keys[e.code]=false);

  let score=0, level=1, lastT=performance.now();
  let spawnTimer=0;

  // Boss (campaña)
  let boss=null, bossActive=false, bossNextAt=650, bossGraceTimer=0, bossKills=0;

  // Torneo
  const TOURN_MIN = 10000;
  const TROPHY_BONUS = 10000;
  let tour=null;
  let duel=null;
  let roundOver=0;

  // crowd in tournament
  let crowd = { count: 0, hype: 0 };

  // starfield
  function initStars(){
    stars.length=0;
    for(let i=0;i<120;i++){
      stars.push({ x:Math.random()*WORLD_W, y:Math.random()*WORLD_H, r:Math.random()*1.5+.2, s:Math.random()*1.0+.2, a:Math.random()*0.7+.2 });
    }
  }
  initStars();

  // GOD explosion + debris
  function createExplosion(x,y,color, power=1){
    const n = Math.floor(18*power);
    for(let i=0;i<n;i++){
      particles.push({ x,y, vx:(Math.random()-0.5)*10*power, vy:(Math.random()-0.5)*10*power, life:1, color, size:rand(1.6,3.8)*power });
    }
    // debris fragments (piezas volando)
    const dn = Math.floor(7*power);
    for(let i=0;i<dn;i++){
      debris.push({
        x,y, vx:(Math.random()-0.5)*8*power, vy:(Math.random()-0.7)*9*power,
        r: rand(2.5,5.5)*power, rot:rand(0,6.28), vr:rand(-0.18,0.18),
        life: 1.2, g: 0.22*power, color
      });
    }
  }

  function dropCoins(x,y,amount){
    for(let i=0;i<amount;i++){
      coins.push({ x,y, vx:(Math.random()-0.5)*3, vy:rand(-2.6,-1.2), g:rand(0.08,0.14), r:rand(3.2,5.2), value:1, life:9000 });
    }
  }
  function rectHit(ax,ay,aw,ah,bx,by,bw,bh){ return ax<bx+bw && ax+aw>bx && ay<by+bh && ay+ah>by; }

  function spendShieldIfAny(){
    if(shieldCharges>0){
      shieldCharges--; saveAll(); updateHUD(); SFX.block();
      return true;
    }
    return false;
  }

  // Damage by parts
  function damageRandomPart(shipIdx, amount=1){
    ensureLoadout(shipIdx);
    const L=loadouts[shipIdx];
    const bag = [
      ['hull',  0.40],
      ['weapon',0.23],
      ['engine',0.22],
      ['shield',0.15],
    ];
    let r=Math.random(), pick='hull';
    for(const [k,w] of bag){
      r-=w;
      if(r<=0){ pick=k; break; }
    }
    const pd=partById(L[pick].id);
    if(!pd) return;

    L[pick].d = clamp(L[pick].d - amount, 0, pd.dur);
    if(L[pick].d===0){
      toast(`Pieza rota: ${pick==='hull'?'CASCO':pick==='weapon'?'ARMA':pick==='engine'?'MOTOR':'ESCUDO'}\nNAVE INOPERABLE`);
    }
    saveAll();
    renderRepairUI();
  }

  // Boss system (campaña)
  function bossStatsForLevel(lv){
    const baseHp = 165 + (lv-1)*55;
    const hp = baseHp + Math.floor(bossKills*15);
    const reward = 2500 + (lv-1)*1200 + Math.floor(bossKills*180);
    const shootCd = clamp(540 - (lv-1)*20, 270, 540);
    const vx = clamp(2.3 + (lv-1)*0.08, 2.3, 4.8);
    return { hp, reward, shootCd, vx };
  }
  function spawnBoss(){
    bossActive=true;
    const st = bossStatsForLevel(level);
    boss = { x: WORLD_W/2-85, y: 45, w: 170, h: 86, hp: st.hp, maxHp: st.hp, vx: st.vx, shootCd: st.shootCd, lastShot:0, reward: st.reward };
    bossGraceTimer = 0;
    SFX.bossSpawn();
    toast('⚠️ BOSS CORPORATIVO ENTRANDO');
  }
  function bossShoot(t){
    if(!boss) return;
    if(t - boss.lastShot < boss.shootCd) return;
    boss.lastShot = t;

    const shots = 3 + Math.min(4, Math.floor(level/3));
    const cx = boss.x + boss.w/2;
    for(let i=0;i<shots;i++){
      const angle = (i-(shots-1)/2)*0.22;
      enemies.push({ kind:'boss_bullet', x:cx, y:boss.y+boss.h, w:6, h:14, vx:angle*7, vy:6.4 + level*0.11, color:'#ff7a00', dmg:1 });
    }
    tone('square', 220, 0.05, 0.03, 140);
  }
  function scheduleNextBoss(){
    bossGraceTimer = 11000;
    bossNextAt = score + (780 + (level-1)*260);
  }

  // Enemies (campaña) — GOD: más variedad
  function spawnEnemy(){
    if(state!=='playing' || paused) return;
    if(mode!=='campaign') return;
    if(bossActive) return;

    const roll=Math.random();
    let type={ kind:'normal', color:'#ff4d4d', hp:1, spd:1.9, size:22, coins:2, score:22, shoots:false, weave:false };
    if(roll>0.76) type={ kind:'fast', color:'#ffee00', hp:1, spd:3.3, size:18, coins:3, score:28, shoots:false, weave:true };
    if(roll>0.88) type={ kind:'tank', color:'#aa00ff', hp:3, spd:1.25, size:34, coins:6, score:50, shoots:false, weave:false };
    if(roll>0.94) type={ kind:'shooter', color:'#00c8ff', hp:2, spd:1.65, size:26, coins:6, score:60, shoots:true, weave:true };
    if(roll>0.972)type={ kind:'elite',color:'#00f2ff',hp:6, spd:1.9, size:30, coins:12,score:95, shoots:true, weave:true };

    const hpBoost=Math.floor((level-1)/3);
    const spBoost=(level-1)*0.06;

    enemies.push({
      kind:type.kind, x:rand(10, WORLD_W-50), y:-40,
      w:type.size, h:type.size,
      hp:type.hp+hpBoost, maxHp:type.hp+hpBoost,
      color:type.color, speedY:type.spd+spBoost,
      intel: clamp(0.015 + (level-1)*0.003, 0.015, 0.055),
      coins: type.coins + Math.floor((level-1)/2),
      score: type.score,
      shoots:type.shoots,
      weave:type.weave,
      wdir: Math.random()<0.5?-1:1,
      wphase: rand(0,6.28),
      shotCd: clamp(1200 - (level-1)*45, 520, 1200),
      lastShot: 0
    });
  }

  // Player
  let players=[];
  function makePlayer(){
    const baseColor = effPaint(selectedShipIdx);
    const hp = effBaseHP(selectedShipIdx);
    return { id:1, x: WORLD_W/2-15, y: WORLD_H-80, w:30, h:30, color:baseColor, lives: hp, alive:true, lastShot:0, blockCd:0, lastMissile:0 };
  }
  function shipDmgBase(){ return effDamage(selectedShipIdx); }

  function shootFromPlayer(p, t){
    const ship=shipConfigs[selectedShipIdx];
    const cd = effCooldown(selectedShipIdx);
    if(t - p.lastShot < cd) return;
    p.lastShot=t;

    ensureLoadout(selectedShipIdx);
    const wepId = loadouts[selectedShipIdx].weapon.id;
    const laserLv = upgrades.laser||0;
    const isLaserWeapon = (wepId === 'weapon_laser');
    const bulletSpd = 10.5 + (isLaserWeapon?1.4:0) + laserLv*0.35;
    const bulletDmg = shipDmgBase() + (isLaserWeapon?0.35:0) + laserLv*0.18;

    const count=ship.b;
    const spread=0.16 + (count>=4?0.02:0);
    for(let i=0;i<count;i++){
      const angle=(i-(count-1)/2)*spread;
      bullets.push({
        owner:1,
        x:p.x + p.w/2 - 2,
        y:p.y,
        vx: angle*(9.6 + laserLv*0.25),
        vy: -bulletSpd,
        color: isLaserWeapon ? '#00f2ff' : p.color,
        kind: (isLaserWeapon || laserLv>0) ? 'laser' : 'bullet',
        dmg: bulletDmg
      });
    }
    SFX.shoot();
  }

  // GOD missile
  function fireMissile(p, t){
    if(missiles<=0) return;
    if(t - p.lastMissile < 1200) return; // cooldown
    p.lastMissile = t;
    missiles--;
    saveAll(); updateHUD();
    missilesFx.push({
      x:p.x+p.w/2, y:p.y,
      vx:0, vy:-11.5,
      r:5.5,
      life: 2200,
      dmg: 14 + upgrades.dmg*1.8, // brutal
      trail: []
    });
    SFX.missile();
    toast('🚀 MISIL LANZADO');
  }

  function takeHitPlayer(p, heavy=false){
    if(!p.alive) return;

    damageRandomPart(selectedShipIdx, heavy ? 3 : 1);

    // INOPERABLE lock: si se rompe algo, el daño sigue pero luego bloqueamos reinicio
    const chance = upgrades.block * 0.06 * effBlockMul(selectedShipIdx);
    if(p.blockCd<=0 && chance>0 && Math.random()<chance){
      p.blockCd=3500;
      createExplosion(p.x+p.w/2, p.y+p.h/2, '#00f2ff', 1.0);
      SFX.block();
      return;
    }
    const shieldOk = !isBroken(selectedShipIdx,'shield') || Math.random() < 0.85;
    if(shieldOk && spendShieldIfAny()){
      createExplosion(p.x+p.w/2, p.y+p.h/2, '#00f2ff', 1.0);
      return;
    }

    const hullBroken = isBroken(selectedShipIdx,'hull');
    p.lives -= (hullBroken ? 2 : 1);
    SFX.hit();

    if(p.lives<=0){
      p.alive=false;
      createExplosion(p.x+p.w/2, p.y+p.h/2, '#ffffff', 1.25);
      if(mode==='campaign'){
        state='gameover'; SFX.lose();
        totalCoins += Math.floor(score*0.45);
        saveAll();
      } else if(mode==='tournament'){
        state='playing';
        roundOver = 1200;
        toast('PERDISTE EL MATCH 😵');
        SFX.lose();
      }
    }
  }

  // Tournament AI opponent (más humana)
  function aiProfile(power){
    // power 1.0..2.4 aprox. (más difícil, más “humana”)
    const shipIdx =
      power >= 2.2 ? 12 :
      power >= 2.0 ? 11 :
      power >= 1.8 ? 10 :
      power >= 1.65 ? 8 :
      power >= 1.45 ? 6 :
      power >= 1.25 ? 4 : 2;

    return {
      power,
      shipIdx,
      hp: Math.floor(9 + power*7),
      dmg: 1.05 + power*0.72,
      cd: clamp(500 - power*110, 155, 520),
      spd: clamp(4.8 + power*1.25, 4.8, 8.8),
      name: power>=2.2?'ZEUS-PRIME':(power>=1.8?'NOVA-CORP':'CORP-'+Math.floor(power*100))
    };
  }

  function spawnTournamentOpponent(profile){
    const ship = shipConfigs[clamp(profile.shipIdx||0,0,shipConfigs.length-1)];
    duel = {
      power: profile.power,
      shipIdx: clamp(profile.shipIdx||0,0,shipConfigs.length-1),
      barrels: ship.b,
      name: profile.name,
      hp: profile.hp,
      maxHp: profile.hp,
      dmg: profile.dmg,
      cd: profile.cd,
      spd: profile.spd,
      last: 0,
      x: WORLD_W/2-15,
      y: 110,
      w: 30,
      h: 30,
      color: ship.color || '#ff00ff',
      dir: (Math.random()<0.5?-1:1),
      zig: rand(0.007, 0.016),
      // human-like
      aimDrift: rand(-0.12, 0.12),
      mistakeT: 0,
      burst: 0,
      dodgeT: 0
    };
  }

  function aiShootAtPlayer(t){
    if(!duel || !players[0]?.alive) return;

    // “errores humanos” a veces: pausa o drift
    if(duel.mistakeT > 0){
      duel.mistakeT -= 16;
      return;
    }
    if(Math.random() < 0.0025){ duel.mistakeT = rand(180, 520); }

    // cooldown base
    const cd = duel.cd * (duel.burst>0 ? 0.72 : 1.0);
    if(t - duel.last < cd) return;
    duel.last = t;

    // ráfagas
    if(duel.burst <= 0 && Math.random() < 0.18) duel.burst = Math.floor(rand(2, 5));
    if(duel.burst > 0) duel.burst--;

    const count = clamp(Math.floor((duel.barrels||1) * (duel.power>=2.2?1.1:duel.power>=1.8?1.0:0.85)), 1, 6);
    for(let i=0;i<count;i++){
      const angle = (i-(count-1)/2)*0.22 + duel.aimDrift + rand(-0.03,0.03);
      enemies.push({
        kind:'ai_bullet',
        x: duel.x + duel.w/2,
        y: duel.y + duel.h,
        w: 6, h: 14,
        vx: angle*7.4,
        vy: 7.9,
        color:'#ff4dff',
        dmg: duel.dmg
      });
    }

    // drift cambia con el tiempo
    if(Math.random()<0.08) duel.aimDrift = clamp(duel.aimDrift + rand(-0.06,0.06), -0.22, 0.22);

    tone('square', 240, 0.05, 0.025, 160);
  }

  // ===== HUD =====
  function modeLabel(){
    if(state === 'menu') return 'MENÚ';
    if(mode === 'campaign') return 'CAMPAÑA';
    if(mode === 'tournament') return 'TORNEO';
    return '—';
  }

  function updateHUD(){
    elCoins.textContent = Math.floor(totalCoins).toLocaleString();
    elScore.textContent = Math.floor(score).toLocaleString();
    elLevel.textContent = level;
    elModeTxt.textContent = modeLabel();
    elShields.textContent = shieldCharges;
    shieldCountBadge.textContent = shieldCharges;
    elMissiles.textContent = missiles;
    missileCountBadge.textContent = missiles;
    elLives.textContent = players[0] ? players[0].lives : 0;

    // disable buys
    buyShield1.disabled = totalCoins < 250;
    buyShield5.disabled = totalCoins < 1100;
    buyMissile1.disabled = totalCoins < 50000;
    buyMissile3.disabled = totalCoins < 145000;
  }

  // ===== Tournament flow (visual) =====
  function shuffle(arr){
    for(let i=arr.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]]=[arr[j],arr[i]];
    }
    return arr;
  }

  function startTournament(){
    ensureAudio();
    mode='tournament';
    state='playing';
    menu.style.display='none';
    paused=false; btnPause.textContent='Pausar';
    setTab('shop');

    // INOPERABLE lock
    if(isInoperable(selectedShipIdx)){
      toast('NAVE INOPERABLE.\nRepara piezas al 1% mínimo.');
      state='menu'; menu.style.display=''; mode='campaign';
      updateHUD();
      return;
    }

    // entrada/apuesta
    const maxBet = Math.floor(totalCoins);
    if(maxBet < TOURN_MIN){
      toast(`Necesitas mínimo ${TOURN_MIN.toLocaleString()} 💰 para entrar al torneo.`);
      state='menu'; menu.style.display=''; mode='campaign';
      updateHUD();
      return;
    }

    const betStr = prompt(`TORNEO\n\n¿Cuánto apuestas?\nMínimo ${TOURN_MIN.toLocaleString()} 💰\nMáximo ${maxBet.toLocaleString()} 💰`, String(TOURN_MIN));
    let bet = parseInt(betStr||String(TOURN_MIN),10);
    bet = clamp(isFinite(bet)?bet:TOURN_MIN, TOURN_MIN, maxBet);

    if(totalCoins < bet){
      toast('No te alcanza esa apuesta.');
      state='menu'; menu.style.display=''; mode='campaign';
      updateHUD();
      return;
    }

    // los otros "apuestan" también
    const aiBets = [];
    for(let i=0;i<7;i++){
      const mult = rand(0.7, 1.6);
      aiBets.push(Math.floor(bet * mult));
    }
    const pool = bet + aiBets.reduce((a,b)=>a+b,0);

    totalCoins -= bet;
    saveAll();

    const aiPowers = shuffle([1.15,1.30,1.45,1.65,1.85,2.10,2.35]);
    const roster = [
      { id:'YOU', name:'TÚ', isPlayer:true, power:1.0, bet },
      ...aiPowers.map((p,idx)=>({ id:'AI'+idx, name: aiProfile(p).name, isPlayer:false, power:p, bet: aiBets[idx] }))
    ];

    const idxs = shuffle([0,1,2,3,4,5,6,7]);
    const bracket = [
      [idxs[0],idxs[1]],
      [idxs[2],idxs[3]],
      [idxs[4],idxs[5]],
      [idxs[6],idxs[7]],
    ];

    crowd.count = Math.floor(rand(1200, 6500));
    crowd.hype = 0.35;

    tour = {
      roster,
      phase:'qf',
      bracket,
      winners:[],
      matchIdx:0,
      pool,
      userBet: bet,
      log: [
        `Entrada (tú): ${bet.toLocaleString()}💰`,
        `Pool total: ${pool.toLocaleString()}💰`,
        `Trofeo: +${TROPHY_BONUS.toLocaleString()}💰`,
        `Público: ${crowd.count.toLocaleString()}`,
      ],
      currentPair:null,
      awaitingDuel:false,
      champion:null,
      startCoins: bet
    };

    resetRun();
    toast(`Torneo iniciado.\nPool: ${pool.toLocaleString()} 💰`);
    SFX.win();
  }

  function beginNextMatch(){
    if(!tour) return;

    const needed = (tour.phase==='qf'?4 : tour.phase==='sf'?2 : tour.phase==='f'?1 : 0);
    if(tour.winners.length === needed){
      if(tour.phase==='qf'){
        const w = tour.winners.slice();
        tour.winners = [];
        tour.phase='sf';
        tour.matchIdx=0;
        tour.bracket = [[w[0],w[1]],[w[2],w[3]]];
        tour.log.push('— SEMIFINALES —');
      } else if(tour.phase==='sf'){
        const w = tour.winners.slice();
        tour.winners=[];
        tour.phase='f';
        tour.matchIdx=0;
        tour.bracket = [[w[0],w[1]]];
        tour.log.push('— FINAL —');
      } else if(tour.phase==='f'){
        const champIdx = tour.winners[0];
        const champ = tour.roster[champIdx];
        tour.champion = champ;
        tour.log.push(`🏆 Campeón: ${champ.name}`);

        if(champ.isPlayer){
          const payout = tour.pool + TROPHY_BONUS;
          totalCoins += payout;

          // Ranking + skins
          achievements.champWins++;
          const profit = payout - tour.userBet;
          achievements.missileKOs += 0; // se incrementa al usar misil KO
          rank.totalWins = (rank.totalWins||0) + 1;
          rank.totalProfit = (rank.totalProfit||0) + profit;
          // store champs list
          const entry = rank.champs.find(x=>x.name==='TÚ');
          if(entry){ entry.wins++; entry.profit += profit; }
          else{ rank.champs.push({ name:'TÚ', wins:1, profit }); }
          rank.champs.sort((a,b)=>b.wins-a.wins || b.profit-a.profit);
          // unlock skin
          const newSkin = ['#00ffff','#ffd700','#ff00ff','#00ff77','#ff8a00','#a07bff'][Math.floor(Math.random()*6)];
          if(!champSkins.includes(newSkin)) champSkins.push(newSkin);

          saveAll();
          toast(`¡CAMPEÓN! +${payout.toLocaleString()} 💰\nSkin desbloqueada: ${newSkin.toUpperCase()}`);
          SFX.bossDown();
        } else {
          toast(`Ganó ${champ.name}. Intenta de nuevo 😈`);
          SFX.lose();
          saveAll();
        }
        state='gameover';
        return;
      }
    }

    const pair = tour.bracket[tour.matchIdx];
    if(!pair){
      state='gameover';
      return;
    }
    tour.currentPair = pair;

    const A = tour.roster[pair[0]];
    const B = tour.roster[pair[1]];

    tour.log.push(`▶ Match: ${A.name} vs ${B.name}`);
    tour.awaitingDuel = (A.isPlayer || B.isPlayer);

    // AI vs AI: resolución rápida + hype
    if(!tour.awaitingDuel){
      const win = (A.power*rand(0.9,1.2) > B.power*rand(0.9,1.2)) ? pair[0] : pair[1];
      const loser = (win===pair[0]) ? pair[1] : pair[0];
      tour.log.push(`✅ Gana: ${tour.roster[win].name} (sobre ${tour.roster[loser].name})`);
      tour.winners.push(win);
      tour.matchIdx += 1;
      tour.currentPair = null;
      tour.awaitingDuel = false;
      crowd.hype = clamp(crowd.hype + rand(0.03,0.08), 0.25, 1.0);
      return;
    }

    // duel
    const enemy = A.isPlayer ? B : A;
    const prof = aiProfile(enemy.power);
    prof.name = enemy.name;
    spawnTournamentOpponent({ ...prof, power: enemy.power });

    // reset player
    players = [makePlayer()];
    players[0].x = WORLD_W/2-15;
    players[0].y = WORLD_H-90;
    players[0].lives = effBaseHP(selectedShipIdx);
    players[0].alive = true;

    bullets.length=0; enemies.length=0; particles.length=0; coins.length=0; missilesFx.length=0; debris.length=0;
    boss=null; bossActive=false;
    score = 0; level = 1;
    roundOver = 0;

    toast(`${A.name} vs ${B.name}\n¡A pelear!`);
  }

  function finishMatch(playerWon, viaMissile=false){
    if(!tour || !tour.currentPair) return;

    const [aIdx,bIdx] = tour.currentPair;
    const A = tour.roster[aIdx];
    const B = tour.roster[bIdx];

    const winnerIdx = playerWon ? (A.isPlayer ? aIdx : bIdx) : (A.isPlayer ? bIdx : aIdx);
    const loserIdx  = (winnerIdx===aIdx) ? bIdx : aIdx;

    const winner = tour.roster[winnerIdx];
    const loser  = tour.roster[loserIdx];

    tour.log.push(`✅ Gana: ${winner.name} (sobre ${loser.name})`);
    if(viaMissile) tour.log.push(`🚀 KO por MISIL`);

    // logros
    if(playerWon && viaMissile){
      achievements.missileKOs++;
    }

    // si el jugador pierde, paga “premio menor” (excepto si pierde a la primera)
    const playerWasInMatch = (A.isPlayer || B.isPlayer);
    if(playerWasInMatch && !playerWon){
      const phase = tour.phase; // qf / sf / f
      // NO premio si cae en cuartos (primera)
      let consolation = 0;
      if(phase==='sf'){
        consolation = Math.floor(tour.userBet*0.25 + tour.pool*0.05);
      } else if(phase==='f'){
        consolation = Math.floor(tour.userBet*0.60 + tour.pool*0.10);
      }
      if(consolation>0){
        totalCoins += consolation;
        tour.log.push(`💵 Premio menor: +${consolation.toLocaleString()}💰`);
        SFX.coin();
      } else {
        tour.log.push(`❌ Sin premio (caíste a la primera)`);
      }
      saveAll();
    }

    tour.winners.push(winnerIdx);

    tour.matchIdx += 1;
    tour.currentPair = null;
    tour.awaitingDuel = false;

    duel = null;
    bullets.length=0; enemies.length=0;
    createExplosion(WORLD_W/2, WORLD_H/2, '#ff00ff', 1.5);

    crowd.hype = clamp(crowd.hype + (playerWon?0.12:0.08), 0.25, 1.0);

    roundOver = 900;

    if(playerWasInMatch){
      if(playerWon) SFX.win();
      else SFX.lose();
    } else {
      SFX.win();
    }
  }

  // ===== Reset/Start =====
  function resetRun(){
    bullets.length=0; enemies.length=0; coins.length=0; particles.length=0; missilesFx.length=0; debris.length=0;
    score=0; level=1; paused=false; btnPause.textContent='Pausar';
    boss=null; bossActive=false; spawnTimer=0;

    bossGraceTimer=0;
    bossNextAt=650;
    bossKills=0;

    roundOver=0;

    if(mode==='campaign'){
      contracts=[];
      newContracts();
      renderContractsUI();
      players=[makePlayer()];
    } else {
      contracts=[];
      renderContractsUI();
      players=[makePlayer()];
      duel=null;
    }

    updateHUD();
    renderRepairUI();
  }

  function startGame(m){
    ensureAudio();

    // auto pantalla completa en celular (solo con gesto de usuario)
    try{
      const mobile = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if(mobile && !document.fullscreenElement){
        document.documentElement.requestFullscreen?.();
      }
    }catch(_){}

    // INOPERABLE lock (campaña también)
    if(isInoperable(selectedShipIdx)){
      toast('NAVE INOPERABLE.\nRepara piezas al 1% mínimo.');
      setTab('repair');
      return;
    }

    mode=m; state='playing'; menu.style.display='none';
    setTab('shop');
    resetRun();
    renderShipsShop(); renderUpgrades(); updateHUD();
    SFX.win();
  }

  // ===== Menu binds =====
  btnStartDefault.onclick = () => startGame('campaign');

  document.querySelectorAll('.mode').forEach(el=>{
    el.onclick = () => {
      const m = el.getAttribute('data-mode');
      if(m==='campaign') startGame('campaign');
      if(m==='tournament') startTournament();
    };
  });

  // ===== Controls =====
  const Controls = { left:'ArrowLeft', right:'ArrowRight', up:'ArrowUp', down:'ArrowDown', shoot:'Space', missile:'KeyM' };

  // ===== Draw ship shapes =====
  function drawShipShape(shape, x, y, color){
    ctx.save();
    ctx.shadowBlur = 14;
    ctx.shadowColor = color;
    ctx.fillStyle = color;

    if(shape==='tri'){
      ctx.beginPath();
      ctx.moveTo(x+15, y);
      ctx.lineTo(x, y+30);
      ctx.lineTo(x+30, y+30);
      ctx.closePath();
      ctx.fill();
    } else if(shape==='delta'){
      ctx.beginPath();
      ctx.moveTo(x+15, y);
      ctx.lineTo(x, y+30);
      ctx.lineTo(x+15, y+20);
      ctx.lineTo(x+30, y+30);
      ctx.closePath();
      ctx.fill();
    } else if(shape==='twin'){
      ctx.fillRect(x+4, y+6, 8, 22);
      ctx.fillRect(x+18, y+6, 8, 22);
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(x+15,y);
      ctx.lineTo(x,y+30);
      ctx.lineTo(x+30,y+30);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if(shape==='trident'){
      ctx.beginPath();
      ctx.moveTo(x+15, y);
      ctx.lineTo(x, y+30);
      ctx.lineTo(x+30, y+30);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(x+13, y-6, 4, 10);
      ctx.fillRect(x+5, y+4, 4, 10);
      ctx.fillRect(x+21, y+4, 4, 10);
    } else if(shape==='hex'){
      ctx.beginPath();
      const cx=x+15, cy=y+15, r=15;
      for(let i=0;i<6;i++){
        const a=(Math.PI/3)*i - Math.PI/6;
        const px=cx + Math.cos(a)*r;
        const py=cy + Math.sin(a)*r;
        if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath(); ctx.fill();
    } else if(shape==='orb'){
      ctx.beginPath(); ctx.arc(x+15,y+15,15,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=0.25; ctx.fillStyle="#000";
      ctx.beginPath(); ctx.arc(x+11,y+11,7,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=1;
    } else if(shape==='zeus'){
      ctx.beginPath(); ctx.arc(x+15,y+15,15,0,Math.PI*2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, y+10); ctx.lineTo(x+8, y-4); ctx.lineTo(x+15, y+8);
      ctx.lineTo(x+22, y-4); ctx.lineTo(x+30, y+10); ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // ===== Main Update =====
  function update(dt, t){
    if(toastTimer>0){
      toastTimer -= dt;
      if(toastTimer<=0) toastEl.style.display='none';
    }
    if(state!=='playing' || paused) return;

    // tournament transitions
    if(mode==='tournament' && roundOver>0){
      const was = roundOver;
      roundOver -= dt;
      if(roundOver<=0){
        // si el duelo era del jugador y murió, registrar la derrota (antes de avanzar bracket)
        if(tour && tour.currentPair && tour.awaitingDuel && !players[0]?.alive){
          finishMatch(false);
        }
        if(tour){
          beginNextMatch();
        }
      }
    }

    // blocks cooldown
    for(const p of players){ if(p.blockCd>0) p.blockCd -= dt; }

    // movement/shoot
    const p = players[0];
    if(p && p.alive){
      const sp = effSpeed(selectedShipIdx);
      if(keys[Controls.left]) p.x -= sp;
      if(keys[Controls.right]) p.x += sp;
      if(keys[Controls.up]) p.y -= sp;
      if(keys[Controls.down]) p.y += sp;
      p.x = clamp(p.x, 0, WORLD_W - p.w);
      p.y = clamp(p.y, 0, WORLD_H - p.h);

      if(keys[Controls.shoot]) shootFromPlayer(p, t);

      // missile
      if(keys[Controls.missile]){
        keys[Controls.missile] = false; // tap once
        fireMissile(p, t);
      }
    }

    // Tournament duel AI movement
    if(mode==='tournament' && tour){
      if(!tour.currentPair && roundOver<=0){
        beginNextMatch();
      }

      if(duel && p && p.alive){
        // dodge if player shooting a lot (human-like)
        duel.dodgeT -= dt;
        if(duel.dodgeT<=0 && Math.random()<0.02 + duel.power*0.01){
          duel.dodgeT = rand(320, 680);
          duel.dir *= -1;
        }

        duel.x += duel.dir * duel.spd;
        duel.x += Math.sin(t*duel.zig)*1.8;
        if(duel.x < 20){ duel.x=20; duel.dir=+1; }
        if(duel.x > WORLD_W-50){ duel.x=WORLD_W-50; duel.dir=-1; }

        duel.y += Math.sin(t*0.0028)*0.35;
        duel.y = clamp(duel.y, 60, 190);

        aiShootAtPlayer(t);
      }
    }

    // Campaign progression
    if(mode==='campaign'){
      tickSurvive(dt);

      const newLevel = 1 + Math.floor(score / 900);
      if(newLevel!==level){ level=newLevel; SFX.levelUp(); }

      if(bossGraceTimer>0) bossGraceTimer -= dt;
      if(!bossActive && bossGraceTimer<=0 && score >= bossNextAt) spawnBoss();

      spawnTimer += dt;
      const spawnEvery = clamp(930 - (level-1)*62, 260, 930);
      while(spawnTimer >= spawnEvery){
        spawnTimer -= spawnEvery;
        spawnEnemy();
      }

      if(bossActive && boss){
        boss.x += boss.vx;
        if(boss.x < 10 || boss.x + boss.w > WORLD_W-10) boss.vx *= -1;
        bossShoot(t);
      }
    }

    // bullets
    for(let i=bullets.length-1;i>=0;i--){
      const b=bullets[i];
      b.x += b.vx; b.y += b.vy;
      if(b.kind==='laser' && Math.random()<0.65){
        particles.push({ x:b.x, y:b.y+8, vx:rand(-0.2,0.2), vy:rand(0.6,1.6), life:rand(120,240), color:'#00f2ff', s:1.2 });
      }
      if(b.y < -30 || b.x < -30 || b.x > WORLD_W+30) bullets.splice(i,1);
    }

    // missiles
    for(let i=missilesFx.length-1;i>=0;i--){
      const m=missilesFx[i];
      m.trail.push([m.x,m.y]);
      if(m.trail.length>18) m.trail.shift();
      m.x += m.vx; m.y += m.vy;
      m.life -= dt;

      // hit boss
      if(mode==='campaign' && bossActive && boss && rectHit(boss.x,boss.y,boss.w,boss.h, m.x-6,m.y-10, 12, 18)){
        boss.hp -= m.dmg;
        createExplosion(m.x,m.y,'#ff00ff',2.2);
        missilesFx.splice(i,1);
      }

      // hit tournament opponent
      if(mode==='tournament' && duel && rectHit(duel.x,duel.y,duel.w,duel.h, m.x-6,m.y-10, 12, 18)){
        duel.hp -= m.dmg;
        createExplosion(m.x,m.y,'#ff00ff',2.4);
        missilesFx.splice(i,1);
        if(duel && duel.hp<=0){
          duel = null;
          finishMatch(true, true);
        }
        continue;
      }

      // hit enemies
      for(let ei=enemies.length-1; ei>=0; ei--){
        const en=enemies[ei];
        if(en.kind==='boss_bullet' || en.kind==='ai_bullet') continue;
        if(rectHit(en.x,en.y,en.w,en.h, m.x-6,m.y-10, 12, 18)){
          en.hp -= m.dmg;
          createExplosion(m.x,m.y,'#ff00ff',2.0);
          missilesFx.splice(i,1);
          if(en.hp<=0){
            createExplosion(en.x+en.w/2,en.y+en.h/2,en.color,1.2);
            score += Math.floor(en.score*1.2);
            dropCoins(en.x+en.w/2, en.y+en.h/2, en.coins+4);
            enemies.splice(ei,1);
          }
          break;
        }
      }

      if(m.life<=0 || m.y<-60) missilesFx.splice(i,1);
    }

    // particles
    for(let i=particles.length-1;i>=0;i--){
      const pr=particles[i];
      pr.x += pr.vx; pr.y += pr.vy;
      pr.life -= 0.02*(dt/16.67);
      pr.vx *= 0.985; pr.vy *= 0.985;
      if(pr.life<=0) particles.splice(i,1);
    }

    // debris
    for(let i=debris.length-1;i>=0;i--){
      const d=debris[i];
      d.vy += d.g;
      d.x += d.vx; d.y += d.vy;
      d.rot += d.vr;
      d.life -= 0.02*(dt/16.67);
      d.vx *= 0.99; d.vy *= 0.99;
      if(d.life<=0 || d.y>WORLD_H+80) debris.splice(i,1);
    }

    // coins + magnet + collect
    if(mode==='campaign'){
      const magRadius = 70 + upgrades.mag*22;
      for(let i=coins.length-1;i>=0;i--){
        const c=coins[i];
        c.vy += c.g; c.x += c.vx; c.y += c.vy;

        const pl = players[0];
        const dx=(pl.x+pl.w/2)-c.x, dy=(pl.y+pl.h/2)-c.y;
        const dist=Math.hypot(dx,dy);

        if(dist < magRadius){
          const d=Math.max(1,dist);
          const pull=(1 - d/magRadius)*(0.18 + upgrades.mag*0.03);
          c.vx += dx/d*pull; c.vy += dy/d*pull;
        }

        if(dist < 18){
          totalCoins += c.value;
          const cc = contracts.find(x=>x.kind==='coins' && !x.done);
          if(cc){
            cc.prog += 1;
            if(cc.prog >= cc.goal){ cc.prog = cc.goal; completeContract(cc); }
            renderContractsUI();
          }
          coins.splice(i,1);
          SFX.coin();
          continue;
        }

        c.life -= dt;
        if(c.life<=0 || c.y > WORLD_H+60) coins.splice(i,1);
      }
    }

    // enemies update + collisions
    for(let i=enemies.length-1;i>=0;i--){
      const en=enemies[i];

      if(en.kind==='boss_bullet' || en.kind==='ai_bullet'){
        en.x += en.vx; en.y += en.vy;
        if(en.y > WORLD_H+30 || en.x<-40 || en.x>WORLD_W+40){ enemies.splice(i,1); continue; }
        const pl=players[0];
        if(pl?.alive && rectHit(pl.x,pl.y,pl.w,pl.h, en.x,en.y,en.w,en.h)){
          enemies.splice(i,1);
          takeHitPlayer(pl,false);
        }
        continue;
      }

      if(mode!=='campaign') continue;

      const target = players[0];

      // weaving + smarter tracking
      if(en.weave){
        en.wphase += dt*0.004;
        en.x += Math.sin(en.wphase)*2.2*en.wdir;
      }
      if(target) en.x += ((target.x - en.x) * en.intel);

      en.y += en.speedY;

      // shooters shoot
      if(en.shoots && target?.alive){
        if(t - en.lastShot > en.shotCd){
          en.lastShot = t;
          const dx = (target.x+target.w/2) - (en.x+en.w/2);
          const ang = clamp(dx/120, -0.35, 0.35);
          enemies.push({ kind:'boss_bullet', x:en.x+en.w/2, y:en.y+en.h, w:6, h:14, vx:ang*6.2, vy:6.2, color:'#ff7a00', dmg:1 });
          tone('square', 190, 0.03, 0.02, 120);
        }
      }

      if(en.y > WORLD_H+30){
        enemies.splice(i,1);
        if(target?.alive) takeHitPlayer(target,true);
        continue;
      }

      if(target?.alive && rectHit(en.x,en.y,en.w,en.h, target.x,target.y,target.w,target.h)){
        enemies.splice(i,1);
        createExplosion(target.x+target.w/2, target.y+target.h/2, '#fff', 1.0);
        takeHitPlayer(target,true);
      }

      for(let bi=bullets.length-1; bi>=0; bi--){
        const b=bullets[bi];
        if(rectHit(en.x,en.y,en.w,en.h, b.x,b.y, 4, 12)){
          en.hp -= b.dmg;
          bullets.splice(bi,1);
          if(en.hp<=0){
            createExplosion(en.x+en.w/2, en.y+en.h/2, en.color, 1.0);
            score += Math.floor(en.score);
            dropCoins(en.x+en.w/2, en.y+en.h/2, en.coins);

            const ck = contracts.find(x=>x.kind==='kill' && !x.done);
            if(ck){
              ck.prog += 1;
              if(ck.prog >= ck.goal){ ck.prog = ck.goal; completeContract(ck); }
              renderContractsUI();
            }

            enemies.splice(i,1);
            break;
          }
        }
      }
    }

    // boss hit
    if(mode==='campaign' && bossActive && boss){
      for(let bi=bullets.length-1; bi>=0; bi--){
        const b=bullets[bi];
        if(rectHit(boss.x,boss.y,boss.w,boss.h, b.x,b.y, 4, 12)){
          boss.hp -= b.dmg;
          bullets.splice(bi,1);
          tone('triangle', 240, 0.02, 0.02, 200);
          if(boss.hp<=0){
            bossActive=false;
            bossKills += 1;

            const reward=boss.reward;
            totalCoins += reward;
            score += 520;
            saveAll();
            SFX.bossDown();

            createExplosion(boss.x+boss.w/2, boss.y+boss.h/2, '#00f2ff', 1.6);
            dropCoins(boss.x+boss.w/2, boss.y+boss.h/2, 90);

            const cb = contracts.find(x=>x.kind==='boss' && !x.done);
            if(cb){
              cb.prog = 1;
              completeContract(cb);
            }

            boss=null;
            scheduleNextBoss();
            toast(`Boss destruido: +${reward.toLocaleString()} 💰`);
            SFX.levelUp();
            break;
          }
        }
      }
    }

    // Tournament: hit opponent
    if(mode==='tournament' && duel){
      for(let bi=bullets.length-1; bi>=0; bi--){
        const b=bullets[bi];
        if(rectHit(duel.x, duel.y, duel.w, duel.h, b.x, b.y, 4, 12)){
          duel.hp -= b.dmg;
          bullets.splice(bi,1);
          tone('triangle', 420, 0.02, 0.02, 520);

          // hype
          crowd.hype = clamp(crowd.hype + 0.01, 0.25, 1.0);

          if(duel.hp<=0){
            createExplosion(duel.x+duel.w/2, duel.y+duel.h/2, '#ff00ff', 1.6);
            duel = null;
            finishMatch(true);
            break;
          }
        }
      }

      // opponent ramming
      const pl = players[0];
      if(duel && pl?.alive && rectHit(duel.x,duel.y,duel.w,duel.h, pl.x,pl.y,pl.w,pl.h)){
        createExplosion(pl.x+pl.w/2, pl.y+pl.h/2, '#fff', 1.0);
        takeHitPlayer(pl,true);
      }
    }

    // Tournament: if player dead end match
    if(mode==='tournament' && tour && tour.currentPair && players[0] && !players[0].alive){
      if(roundOver<=0){
        finishMatch(false);
      }
    }

    updateHUD();
  }

  function overlayText(title, sub){
    beginWorld();
    ctx.fillStyle='rgba(0,0,0,.72)';
    ctx.fillRect(0,0,WORLD_W,WORLD_H);
    ctx.textAlign='center';
    ctx.fillStyle='#fff';
    ctx.font='1000 44px system-ui';
    ctx.fillText(title, WORLD_W/2, WORLD_H/2 - 18);
    ctx.font='800 16px system-ui';
    ctx.fillStyle='rgba(255,255,255,.85)';
    ctx.fillText(sub, WORLD_W/2, WORLD_H/2 + 18);
    ctx.textAlign='left';
    endWorld();
  }

  function drawArena(){
    // arena stands (simple but efectivo)
    ctx.save();
    ctx.globalAlpha = 0.15 + crowd.hype*0.10;
    ctx.fillStyle = '#ffffff';
    // top stands
    ctx.fillRect(0,0,WORLD_W,36);
    // side stands
    ctx.fillRect(0,0,18,WORLD_H);
    ctx.fillRect(WORLD_W-18,0,18,WORLD_H);

    // crowd dots
    ctx.globalAlpha = 0.25 + crowd.hype*0.20;
    for(let i=0;i<120;i++){
      const x = rand(20,WORLD_W-20);
      const y = rand(6,32);
      ctx.fillRect(x,y,1.5,1.5);
    }
    ctx.restore();
  }

  function draw(){
    ctx.clearRect(0,0,viewW,viewH);
    beginWorld();

    for(const s of stars){
      s.y += s.s;
      if(s.y > WORLD_H){ s.y=-10; s.x=Math.random()*WORLD_W; }
      ctx.globalAlpha = s.a;
      ctx.fillStyle='#fff';
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    if(mode==='tournament' && tour){
      drawArena();
    }

    for(const pr of particles){
      ctx.globalAlpha = pr.life;
      ctx.fillStyle = pr.color;
      ctx.fillRect(pr.x,pr.y,pr.size,pr.size);
    }
    ctx.globalAlpha = 1;

    // debris
    for(const d of debris){
      ctx.save();
      ctx.globalAlpha = clamp(d.life,0,1);
      ctx.translate(d.x,d.y);
      ctx.rotate(d.rot);
      ctx.fillStyle = d.color;
      ctx.fillRect(-d.r/2,-d.r/2,d.r,d.r*0.7);
      ctx.restore();
    }

    for(const c of coins){
      ctx.fillStyle='rgba(255,215,0,.95)';
      ctx.beginPath(); ctx.arc(c.x,c.y,c.r,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.arc(c.x-1,c.y-1,c.r*0.45,0,Math.PI*2); ctx.fill();
    }

    // missiles render
    for(const m of missilesFx){
      // trail
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for(let i=0;i<m.trail.length;i++){
        const [tx,ty] = m.trail[i];
        if(i===0) ctx.moveTo(tx,ty);
        else ctx.lineTo(tx,ty);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#ff00ff';
      ctx.fillStyle = '#ffb3ff';
      ctx.beginPath(); ctx.arc(m.x,m.y,m.r,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#ff00ff';
      ctx.fillRect(m.x-2,m.y+6,4,10);
      ctx.restore();
    }

    // players
    for(const p of players){
      if(!p.alive) continue;
      const ship=shipConfigs[selectedShipIdx];
      drawShipShape(ship.shape, p.x, p.y, p.color);

      if(upgrades.block>0 && p.blockCd<=0){
        ctx.globalAlpha=0.25;
        ctx.strokeStyle='#00f2ff'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(p.x+p.w/2, p.y+p.h/2, 22, 0, Math.PI*2); ctx.stroke();
        ctx.globalAlpha=1;
      }
    }

    // tournament enemy ship
    if(mode==='tournament' && duel){
      ctx.save();
      ctx.shadowBlur = 16;
      ctx.shadowColor = duel.color;
      ctx.fillStyle = duel.color;
      ctx.fillRect(duel.x, duel.y, duel.w, duel.h);
      ctx.restore();

      const pct = clamp(duel.hp/duel.maxHp,0,1);
      ctx.fillStyle='rgba(255,255,255,.18)';
      ctx.fillRect(14, 16, 260, 10);
      ctx.fillStyle='rgba(255,0,255,.60)';
      ctx.fillRect(14, 16, 260*pct, 10);
      ctx.fillStyle='rgba(255,255,255,.85)';
      ctx.font='900 12px system-ui';
      ctx.fillText(`OPONENTE: ${Math.ceil(duel.hp)}/${duel.maxHp}`, 14, 40);
    }

    // bullets
    for(const b of bullets){ ctx.fillStyle=b.color; ctx.fillRect(b.x,b.y,4,12); }

    // enemies + bullets
    for(const en of enemies){
      ctx.fillStyle=en.color;
      ctx.fillRect(en.x,en.y,en.w,en.h);
      if(en.maxHp>1){
        const pct=clamp(en.hp/en.maxHp,0,1);
        ctx.fillStyle='rgba(255,255,255,.85)';
        ctx.fillRect(en.x,en.y-8,en.w*pct,3);
      }
    }

    // boss
    if(mode==='campaign' && bossActive && boss){
      ctx.save();
      ctx.shadowBlur=22; ctx.shadowColor='#00f2ff';
      ctx.fillStyle='rgba(0,242,255,.18)';
      ctx.fillRect(boss.x-4,boss.y-4,boss.w+8,boss.h+8);
      ctx.restore();

      ctx.fillStyle='#1a1f3a';
      ctx.fillRect(boss.x,boss.y,boss.w,boss.h);
      ctx.fillStyle='#ff2b2b';
      ctx.fillRect(boss.x+34,boss.y+26,16,10);
      ctx.fillRect(boss.x+boss.w-50,boss.y+26,16,10);

      const pct=clamp(boss.hp/boss.maxHp,0,1);
      ctx.fillStyle='rgba(255,255,255,.2)';
      ctx.fillRect(20, 16, WORLD_W-40, 10);
      ctx.fillStyle='rgba(0,242,255,.55)';
      ctx.fillRect(20, 16, (WORLD_W-40)*pct, 10);
      ctx.fillStyle='rgba(255,255,255,.85)';
      ctx.font='900 12px system-ui';
      ctx.textAlign='center';
      ctx.fillText(`BOSS HP: ${Math.ceil(boss.hp)}/${boss.maxHp} | RECOMPENSA: ${boss.reward} 💰`, WORLD_W/2, 42);
      ctx.textAlign='left';
    }

    // tournament overlay: bracket + pool + crowd
    if(mode==='tournament' && tour){
      ctx.fillStyle='rgba(255,255,255,.88)';
      ctx.font='900 14px system-ui';
      ctx.fillText(`TORNEO — ${tour.phase.toUpperCase()} | Pool: ${tour.pool.toLocaleString()}💰 | Trofeo: +${TROPHY_BONUS.toLocaleString()}💰`, 14, 64);
      ctx.font='800 12px system-ui';
      ctx.fillStyle='rgba(255,255,255,.75)';
      ctx.fillText(`Público: ${crowd.count.toLocaleString()} | Hype: ${(crowd.hype*100|0)}%`, 14, 82);

      // bracket
      ctx.font='900 12px system-ui';
      const y0 = 104;
      const lines = [];
      const nameOf = (idx)=>tour.roster[idx].name + (tour.roster[idx].isPlayer?' (TÚ)':'');
      lines.push('BRACKET:');
      tour.bracket.forEach((pair, i)=>{
        const mark = (i===tour.matchIdx && tour.currentPair)?'▶':' ';
        lines.push(`${mark} ${nameOf(pair[0])} vs ${nameOf(pair[1])}`);
      });

      ctx.fillStyle='rgba(255,255,255,.75)';
      lines.slice(0,6).forEach((ln,i)=> ctx.fillText(ln, 14, y0 + i*16));

      // log
      const logs = tour.log.slice(-8);
      const logY = WORLD_H - 120;
      ctx.fillStyle='rgba(255,255,255,.75)';
      ctx.fillText('LOG:', 14, logY);
      ctx.font='800 12px system-ui';
      logs.forEach((ln,i)=> ctx.fillText(ln, 14, logY + 18 + i*14));
    }

    endWorld();

    if(paused && state==='playing') overlayText('PAUSA', 'Presiona P o Reanudar');

    if(state==='gameover'){
      if(mode==='tournament' && tour){
        overlayText('TORNEO TERMINADO', 'ENTER para reintentar (campaña) o recarga para menú');
      } else {
        overlayText('MISIÓN FALLIDA', `ENTER para reintentar | Monedas: ${Math.floor(totalCoins).toLocaleString()}`);
      }
    }
  }

  function frame(t){
    const dt=Math.min(40, t-lastT);
    lastT=t;
    update(dt, t);
    draw();
    requestAnimationFrame(frame);
  }

  // ===== Initial UI =====
  function modeInit(){
    state='menu';
    menu.style.display='';
    mode='campaign';
  }

  modeInit();
  renderShipsShop();
  renderUpgrades();
  renderPartsShop();
  renderRepairUI();
  renderContractsUI();
  renderSkinsUI();
  renderRankUI();
  updateHUD();
  requestAnimationFrame(frame);
})();