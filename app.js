const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let Hplus = [];
let Clminus = [];
let Zn = [];
let Zn2 = [];
let H2 = [];

let showSymbols = true;
let paused = false;

function initZinc(){
    Zn=[];
    let baseY = canvas.height - 40;
    for(let i=0;i<20;i++){
        Zn.push({
            x: 200 + (i%10)*35,
            y: baseY - Math.floor(i/10)*35
        });
    }
}

function createIons(){
    Hplus=[];
    Clminus=[];
    let nH = document.getElementById("hplus").value;
    let nCl = document.getElementById("clminus").value;

    for(let i=0;i<nH;i++){
        Hplus.push(randomIon("H+"));
    }
    for(let i=0;i<nCl;i++){
        Clminus.push(randomIon("Cl-"));
    }
}

function randomIon(type){
    return {
        x: Math.random()*canvas.width,
        y: Math.random()*(canvas.height-200),
        vx:(Math.random()-0.5)*2,
        vy:(Math.random()-0.5)*2,
        type:type
    }
}

function drawCircle(x,y,color,label){
    ctx.beginPath();
    ctx.arc(x,y,12,0,2*Math.PI);
    ctx.fillStyle=color;
    ctx.fill();
    if(showSymbols){
        ctx.fillStyle="white";
        ctx.font="10px Arial";
        ctx.textAlign="center";
        ctx.fillText(label,x,y+3);
    }
}

function update(){
    if(paused) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);

    let tempFactor = document.getElementById("temp").value;

    Zn.forEach(z=>{
        drawCircle(z.x,z.y,"gray","Zn");
    });

    for(let i=Hplus.length-1;i>=0;i--){
        let h = Hplus[i];
        h.x += h.vx * tempFactor;
        h.y += h.vy * tempFactor;

        if(h.x<0||h.x>canvas.width) h.vx*=-1;
        if(h.y<0||h.y>canvas.height-100) h.vy*=-1;

        Zn.forEach(z=>{
            let dx=h.x-z.x;
            let dy=h.y-z.y;
            if(Math.sqrt(dx*dx+dy*dy)<20){
                if(Math.random()<0.05*tempFactor){
                    Hplus.splice(i,1);
                    Zn2.push({x:z.x+20,y:z.y-30});
                    if(Math.random()<0.5){
                        H2.push({x:z.x,y:z.y-50});
                    }
                }
            }
        });

        drawCircle(h.x,h.y,"red","H+");
    }

    Clminus.forEach(cl=>{
        cl.x += cl.vx;
        cl.y += cl.vy;
        if(cl.x<0||cl.x>canvas.width) cl.vx*=-1;
        if(cl.y<0||cl.y>canvas.height-100) cl.vy*=-1;
        drawCircle(cl.x,cl.y,"green","Cl-");
    });

    Zn2.forEach(zn=>{
        drawCircle(zn.x,zn.y,"blue","Zn2+");
    });

    H2.forEach(h2=>{
        h2.y -=1;
        drawCircle(h2.x,h2.y,"orange","H2");
    });

    ctx.fillStyle="black";
    ctx.fillText("H+ : "+Hplus.length,20,20);
    ctx.fillText("Cl- : "+Clminus.length,20,40);
    ctx.fillText("Zn2+ : "+Zn2.length,20,60);
    ctx.fillText("H2 : "+H2.length,20,80);

    requestAnimationFrame(update);
}

function toggleSymbols(){ showSymbols=!showSymbols; }
function pauseSim(){ paused=!paused; }
function resetSim(){
    Zn2=[];
    H2=[];
    initZinc();
    createIons();
}

initZinc();
createIons();
update();
