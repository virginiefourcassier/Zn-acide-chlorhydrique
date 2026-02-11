const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const UI = {
  temp: document.getElementById("temp"),
  znsolid: document.getElementById("znsolid"),
  hplus: document.getElementById("hplus"),
  clminus: document.getElementById("clminus"),
  btnSymbols: document.getElementById("btnSymbols"),
  btnPause: document.getElementById("btnPause"),
  btnReset: document.getElementById("btnReset"),
};

let showSymbols = true;
let paused = false;

const R = 18;                // rayon des boules
const DIAM = 2 * R;
const HUD = { x: 18, y: 18, w: 200, h: 125 };

let Hplus = [];
let Clminus = [];
let Zn = [];     // atomes de Zn du solide
let Zn2 = [];    // ions Zn²⁺ en solution (mobiles)
let H2 = [];     // molécules H₂ : 2 boules blanches collées

let lastTs = null;

// ---------- utilitaires ----------
function clamp01(v){ return Math.max(0, Math.min(1, v)); }
function hexToRgb(hex){
  const h = hex.replace("#","").trim();
  const v = parseInt(h.length===3 ? h.split("").map(c=>c+c).join("") : h, 16);
  return { r:(v>>16)&255, g:(v>>8)&255, b:v&255 };
}
function rgbToHex({r,g,b}){
  const to2 = (n)=>("0"+Math.round(n).toString(16)).slice(-2);
  return "#"+to2(r)+to2(g)+to2(b);
}
function mix(c1, c2, t){
  t = clamp01(t);
  return {
    r: c1.r + (c2.r-c1.r)*t,
    g: c1.g + (c2.g-c1.g)*t,
    b: c1.b + (c2.b-c1.b)*t
  };
}

// ---------- dessin “3D” ----------
function drawSphere(x, y, baseHex, label, outlineHex=null){
  const base = hexToRgb(baseHex);
  const white = {r:255,g:255,b:255};
  const black = {r:0,g:0,b:0};

  // ombre portée
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 5;

  // dégradé radial (reflet)
  const grad = ctx.createRadialGradient(x - R*0.35, y - R*0.35, R*0.2, x, y, R);
  grad.addColorStop(0.00, rgbToHex(mix(base, white, 0.75)));
  grad.addColorStop(0.35, rgbToHex(mix(base, white, 0.25)));
  grad.addColorStop(1.00, rgbToHex(mix(base, black, 0.20)));

  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI*2);
  ctx.fillStyle = grad;
  ctx.fill();

  // contour
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 2;
  ctx.strokeStyle = outlineHex ? outlineHex : "rgba(0,0,0,0.12)";
  ctx.stroke();

  // reflet
  ctx.beginPath();
  ctx.arc(x - R*0.35, y - R*0.35, R*0.35, 0, Math.PI*2);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fill();

  ctx.restore();

  if(showSymbols && label){
    ctx.save();
    ctx.fillStyle = (baseHex === "#ffffff") ? "#111" : "#fff";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y);
    ctx.restore();
  }
}

function drawRoundedRect(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

// ---------- modélisation ----------
function initZinc(){
  Zn = [];
  const nZn = Number(UI.znsolid.value);
  // Tas compact : on calcule rows/cols en fonction de nZn
  const cols = Math.max(6, Math.min(12, Math.round(Math.sqrt(nZn) * 1.5)));
  const rows = Math.ceil(nZn / cols);

  const baseY = canvas.height - 60;
  const startX = Math.max(140, Math.floor((canvas.width - (cols*DIAM + R))/2));

  let k = 0;
  for(let r=0; r<rows; r++){
    for(let c=0; c<cols; c++){
      if(k >= nZn) break;
      const x = startX + c*DIAM + (r%2)*R;
      const y = baseY - r*DIAM;
      Zn.push({ x, y, hits: 0 });
      k++;
    }
  }
}

function randomIon(label){
  return {
    x: Math.random() * canvas.width,
    y: Math.random() * (canvas.height - 240),
    vx: (Math.random()-0.5) * 120,  // px/s
    vy: (Math.random()-0.5) * 120,
    label
  };
}

function createIons(){
  Hplus = [];
  Clminus = [];
  Zn2 = [];
  H2 = [];

  const nH = Number(UI.hplus.value);
  const nCl = Number(UI.clminus.value);

  for(let i=0;i<nH;i++) Hplus.push(randomIon("H⁺"));
  for(let i=0;i<nCl;i++) Clminus.push(randomIon("Cl⁻"));
}

function resetSim(){
  initZinc();
  createIons();
  lastTs = null;
}

function toggleSymbols(){
  showSymbols = !showSymbols;
  UI.btnSymbols.textContent = showSymbols ? "Symboles : ON" : "Symboles : OFF";
}

function pauseSim(){
  paused = !paused;
  UI.btnPause.textContent = paused ? "Reprendre" : "Pause";
}

// ---------- dynamique ----------
function stepIons(arr, dt, speedMult){
  for(const ion of arr){
    ion.x += ion.vx * dt * speedMult;
    ion.y += ion.vy * dt * speedMult;

    if(ion.x < R){ ion.x = R; ion.vx *= -1; }
    if(ion.x > canvas.width - R){ ion.x = canvas.width - R; ion.vx *= -1; }
    if(ion.y < R){ ion.y = R; ion.vy *= -1; }
    if(ion.y > canvas.height - 120){ ion.y = canvas.height - 120; ion.vy *= -1; }
  }
}

// Zn2+ mobiles (en solution)
function stepZn2(dt, speedMult){
  for(const ion of Zn2){
    ion.x += ion.vx * dt * speedMult;
    ion.y += ion.vy * dt * speedMult;

    if(ion.x < R){ ion.x = R; ion.vx *= -1; }
    if(ion.x > canvas.width - R){ ion.x = canvas.width - R; ion.vx *= -1; }
    if(ion.y < R){ ion.y = R; ion.vy *= -1; }
    if(ion.y > canvas.height - 140){ ion.y = canvas.height - 140; ion.vy *= -1; }
  }
}

// H2 : deux boules collées qui montent
function stepH2(dt){
  for(let k = H2.length - 1; k >= 0; k--){
    const m = H2[k];
    m.y -= m.vy * dt;
    if(m.y < -80) H2.splice(k, 1);
  }
}

function reactCollisions(dt, temp){
  // collisions efficaces amplifiées
  const pBase = 0.78;
  const p = Math.min(0.98, pBase * (0.65 + 0.20*temp));
  const rHit = R + 8;

  for(let i = Hplus.length - 1; i >= 0; i--){
    const h = Hplus[i];

    for(let j = Zn.length - 1; j >= 0; j--){
      const z = Zn[j];
      const dx = h.x - z.x;
      const dy = h.y - z.y;
      if(dx*dx + dy*dy <= rHit*rHit){
        if(Math.random() < p){
          // consomme 1 H+
          Hplus.splice(i, 1);
          z.hits += 1;

          // 2 H+ -> Zn consommé + Zn2+ + H2
          if(z.hits >= 2){
            Zn.splice(j, 1);

            // Zn2+ mobile en solution (gris plus foncé)
            Zn2.push({
              x: z.x + 2,
              y: z.y - 40,
              vx: (Math.random()-0.5) * 90,
              vy: (Math.random()-0.5) * 90,
              label: "Zn²⁺"
            });

            // H2 : deux sphères blanches collées
            const angle = Math.random() * Math.PI * 2;
            H2.push({
              x: z.x + (Math.random()*10 - 5),
              y: z.y - 20,
              vx: Math.cos(angle) * 8,
              vy: 28 + 18*Math.random()
            });
          }
        }
        break;
      }
    }
  }
}

// ---------- HUD ----------
function drawHUD(){
  ctx.save();
  drawRoundedRect(HUD.x, HUD.y, HUD.w, HUD.h, 14);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.stroke();

  ctx.fillStyle = "#111";
  ctx.font = "bold 18px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const lines = [
    `H⁺ : ${Hplus.length}`,
    `Cl⁻ : ${Clminus.length}`,
    `Zn(s) : ${Zn.length}`,
    `Zn²⁺ : ${Zn2.length}`,
    `H₂ : ${H2.length}`,
  ];
  let yy = HUD.y + 12;
  for(const ln of lines){
    ctx.fillText(ln, HUD.x + 14, yy);
    yy += 20;
  }
  ctx.restore();
}

// ---------- rendu ----------
function render(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // zinc (gris)
  for(const z of Zn){
    drawSphere(z.x, z.y, "#7f7f7f", "Zn");
  }

  // ions H+ (blanc)
  for(const h of Hplus){
    drawSphere(h.x, h.y, "#ffffff", "H⁺", "rgba(0,0,0,0.35)");
  }

  // ions Cl- (vert)
  for(const cl of Clminus){
    drawSphere(cl.x, cl.y, "#1aa34a", "Cl⁻");
  }

  // ions Zn2+ (gris un peu plus foncé)
  for(const zn of Zn2){
    drawSphere(zn.x, zn.y, "#5f5f5f", "Zn²⁺");
  }

  // molécules H2 : deux sphères blanches collées
  for(const m of H2){
    const dx = 0.55 * R; // écart moitié de la collision (collées)
    drawSphere(m.x - dx, m.y, "#ffffff", showSymbols ? "" : "", "rgba(0,0,0,0.35)");
    drawSphere(m.x + dx, m.y, "#ffffff", showSymbols ? "" : "", "rgba(0,0,0,0.35)");
    if(showSymbols){
      ctx.save();
      ctx.fillStyle = "#111";
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("H₂", m.x, m.y);
      ctx.restore();
    }
  }

  drawHUD();

  if(paused){
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = "#111";
    ctx.font = "bold 46px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PAUSE", canvas.width/2, canvas.height/2);
    ctx.restore();
  }
}

// ---------- boucle ----------
function loop(ts){
  if(lastTs === null) lastTs = ts;
  const dt = Math.min(0.033, (ts - lastTs) / 1000);
  lastTs = ts;

  const temp = Number(UI.temp.value);

  // vitesse fortement dépendante de T
  const speedMult = (temp * temp) * 0.25; // temp=2 -> 1 ; temp=5 -> 6.25

  if(!paused){
    stepIons(Hplus, dt, speedMult);
    stepIons(Clminus, dt, speedMult * 0.9);
    stepZn2(dt, speedMult * 0.7);
    reactCollisions(dt, temp);
    stepH2(dt);
  }

  render();
  requestAnimationFrame(loop);
}

// ---------- événements ----------
UI.btnSymbols.addEventListener("click", toggleSymbols);
UI.btnPause.addEventListener("click", pauseSim);
UI.btnReset.addEventListener("click", () => { paused = false; UI.btnPause.textContent = "Pause"; resetSim(); });

// reset à chaque changement de quantités initiales
UI.znsolid.addEventListener("input", () => { resetSim(); });
UI.hplus.addEventListener("input", () => { resetSim(); });
UI.clminus.addEventListener("input", () => { resetSim(); });

// init
resetSim();
requestAnimationFrame(loop);
