const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const UI = {
  temp: document.getElementById("temp"),
  hplus: document.getElementById("hplus"),
  clminus: document.getElementById("clminus"),
  btnSymbols: document.getElementById("btnSymbols"),
  btnPause: document.getElementById("btnPause"),
  btnReset: document.getElementById("btnReset"),
};

let showSymbols = true;
let paused = false;

const R = 18;                // rayon des boules (grossies)
const DIAM = 2 * R;
const HUD = { x: 18, y: 18, w: 190, h: 120 };

let Hplus = [];
let Clminus = [];
let Zn = [];     // atomes de Zn du solide
let Zn2 = [];    // ions Zn²⁺ en solution
let H2 = [];     // bulles H₂

let lastTs = null;

// ---------- utilitaires couleur ----------
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

  // ombre portée douce
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 5;

  // dégradé radial (reflet en haut-gauche)
  const grad = ctx.createRadialGradient(x - R*0.35, y - R*0.35, R*0.2, x, y, R);
  grad.addColorStop(0.00, rgbToHex(mix(base, white, 0.75)));
  grad.addColorStop(0.35, rgbToHex(mix(base, white, 0.25)));
  grad.addColorStop(1.00, rgbToHex(mix(base, black, 0.20)));

  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI*2);
  ctx.fillStyle = grad;
  ctx.fill();

  // contour (utile sur boules blanches)
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 2;
  ctx.strokeStyle = outlineHex ? outlineHex : "rgba(0,0,0,0.12)";
  ctx.stroke();

  // reflet (petit highlight)
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
  // Tas compact collé : maillage serré (pas = diamètre)
  const rows = 6;
  const cols = 10;
  const baseY = canvas.height - 60;
  const startX = 220;

  for(let r=0; r<rows; r++){
    for(let c=0; c<cols; c++){
      // décalage type “empilement” pour compacité
      const x = startX + c*DIAM + (r%2)*R;
      const y = baseY - r*DIAM;
      Zn.push({ x, y, hits: 0 }); // hits = nombre de collisions efficaces H+ accumulées
    }
  }
}

function randomIon(label){
  return {
    x: Math.random() * canvas.width,
    y: Math.random() * (canvas.height - 230),
    vx: (Math.random()-0.5) * 120,  // px/s (base)
    vy: (Math.random()-0.5) * 120,
    label
  };
}

function createIons(){
  Hplus = [];
  Clminus = [];
  const nH = Number(UI.hplus.value);
  const nCl = Number(UI.clminus.value);

  for(let i=0;i<nH;i++) Hplus.push(randomIon("H⁺"));
  for(let i=0;i<nCl;i++) Clminus.push(randomIon("Cl⁻"));
}

function resetSim(){
  Zn2 = [];
  H2 = [];
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

// ---------- cinétique / collisions ----------
function stepIons(arr, dt, speedMult){
  for(const ion of arr){
    ion.x += ion.vx * dt * speedMult;
    ion.y += ion.vy * dt * speedMult;

    // rebonds
    if(ion.x < R){ ion.x = R; ion.vx *= -1; }
    if(ion.x > canvas.width - R){ ion.x = canvas.width - R; ion.vx *= -1; }
    if(ion.y < R){ ion.y = R; ion.vy *= -1; }
    if(ion.y > canvas.height - 120){ ion.y = canvas.height - 120; ion.vy *= -1; }
  }
}

function reactCollisions(dt, temp){
  // probabilité de collision efficace amplifiée
  // objectif : consommation du réactif limitant en < 2 min (par défaut)
  const pBase = 0.75;                    // base élevée (passe vite)
  const p = Math.min(0.98, pBase * (0.65 + 0.20*temp));  // augmente avec T

  // rayon d'interaction
  const rHit = R + 8;

  // Pour accélérer, on teste seulement une fraction des couples via boucle H+ puis Zn
  for(let i = Hplus.length - 1; i >= 0; i--){
    const h = Hplus[i];

    // test collision avec Zn (tas au bas)
    for(let j = Zn.length - 1; j >= 0; j--){
      const z = Zn[j];
      const dx = h.x - z.x;
      const dy = h.y - z.y;
      if(dx*dx + dy*dy <= rHit*rHit){
        // collision détectée : collision efficace avec proba p
        if(Math.random() < p){
          // on consomme le H+ "efficace"
          Hplus.splice(i, 1);
          z.hits += 1;

          // au bout de 2 H+ efficaces : Zn consommé -> Zn²⁺ + H₂
          if(z.hits >= 2){
            // Zn(s) consommé
            Zn.splice(j, 1);

            // Zn²⁺ en solution (décalé vers le haut)
            Zn2.push({ x: z.x + 2, y: z.y - 2 });

            // bulle H₂ qui monte
            H2.push({ x: z.x - 5 + (Math.random()*10), y: z.y - 20, vy: 25 + 15*Math.random() });
          }
        }
        // une seule interaction par H+ et par frame
        break;
      }
    }
  }

  // montée des bulles H2
  for(let k = H2.length - 1; k >= 0; k--){
    const b = H2[k];
    b.y -= b.vy * dt;
    if(b.y < -50) H2.splice(k, 1);
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

  // ions Zn2+ (bleu)
  for(const zn of Zn2){
    drawSphere(zn.x, zn.y, "#1f6feb", "Zn²⁺");
  }

  // bulles H2 (orange)
  for(const b of H2){
    drawSphere(b.x, b.y, "#f59e0b", "H₂");
  }

  drawHUD();

  // voile "PAUSE" (optionnel)
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
  const dt = Math.min(0.033, (ts - lastTs) / 1000); // cap 33 ms
  lastTs = ts;

  const temp = Number(UI.temp.value);

  // effet T accentué sur la vitesse : vitesse ~ temp^2
  const speedMult = (temp * temp) * 0.25; // temp=2 -> 1 ; temp=5 -> 6.25

  if(!paused){
    stepIons(Hplus, dt, speedMult);
    stepIons(Clminus, dt, speedMult * 0.9);
    reactCollisions(dt, temp);
  }

  render();
  requestAnimationFrame(loop);
}

// ---------- événements ----------
UI.btnSymbols.addEventListener("click", toggleSymbols);
UI.btnPause.addEventListener("click", pauseSim);
UI.btnReset.addEventListener("click", () => { paused = false; UI.btnPause.textContent = "Pause"; resetSim(); });

UI.hplus.addEventListener("input", () => { resetSim(); });
UI.clminus.addEventListener("input", () => { resetSim(); });

// init
resetSim();
requestAnimationFrame(loop);
