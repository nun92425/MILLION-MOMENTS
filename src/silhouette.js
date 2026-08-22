let inited=false;
let srcImg=null;

function getLum(r,g,b){ return 0.2126*r + 0.7152*g + 0.0722*b; }
function computeOtsu(data){
  const hist=new Array(256).fill(0);
  for(let i=0;i<data.length;i+=4) hist[Math.round(getLum(data[i],data[i+1],data[i+2]))]++;
  const total=data.length/4;
  let sum=0; for(let i=0;i<256;i++) sum+=i*hist[i];
  let sumB=0,wB=0,maxVar=0,thr=128;
  for(let t=0;t<256;t++){
    wB+=hist[t]; if(!wB) continue;
    const wF=total-wB; if(!wF) break;
    sumB+=t*hist[t];
    const mB=sumB/wB, mF=(sum-sumB)/wF;
    const varB=wB*wF*(mB-mF)*(mB-mF);
    if(varB>maxVar){maxVar=varB; thr=t;}
  }
  return thr;
}
function loadImage(file){
  return new Promise((res,rej)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>res(img);
    img.onerror=rej;
    img.src=url;
  });
}
export function initSilhouette(){
  if(inited) return;
  inited=true;
  const input=document.getElementById('sil-input');
  const drop=document.getElementById('sil-dropzone');
  const preview=document.getElementById('sil-preview');
  const threshEl=document.getElementById('sil-threshold');
  const threshVal=document.getElementById('sil-threshold-value');
  const autoBtn=document.getElementById('sil-auto');
  const invertBtn=document.getElementById('sil-invert');
  const keyColorEl=document.getElementById('sil-key-color');
  const tolEl=document.getElementById('sil-tolerance');
  const tolVal=document.getElementById('sil-tolerance-value');
  const useKeyEl=document.getElementById('sil-use-key');
  const generateBtn=document.getElementById('sil-generate');
  const canvas=document.getElementById('silhouette-canvas');
  const wrapper=document.getElementById('sil-wrapper');
  const placeholder=document.getElementById('sil-placeholder');
  const footer=document.getElementById('sil-footer');
  const downloadBtn=document.getElementById('sil-download');
  const downloadWhiteBtn=document.getElementById('sil-download-white');

  if(!input || !canvas) return;
  let inverted=false;
  let srcCanvas=null, srcCtx=null, srcData=null;

  threshEl.addEventListener('input', ()=>{
    threshVal.textContent=threshEl.value;
    if(srcImg) render();
  });
  tolEl.addEventListener('input', ()=> tolVal.textContent=tolEl.value);
  tolEl.dispatchEvent(new Event('input'));
  useKeyEl.addEventListener('change', ()=> { if(srcImg) render(); });
  keyColorEl.addEventListener('input', ()=> { if(useKeyEl.checked && srcImg) render(); });

  invertBtn.addEventListener('click', ()=>{
    inverted=!inverted;
    invertBtn.textContent = inverted ? '反転中' : '反転';
    if(srcImg) render();
  });
  autoBtn.addEventListener('click', ()=>{
    if(!srcData) return;
    const t=computeOtsu(srcData.data);
    threshEl.value=t;
    threshVal.textContent=t;
    render();
  });

  async function handleFile(file){
    if(!file || !file.type.startsWith('image/')) return;
    srcImg=await loadImage(file);
    preview.src=srcImg.src;
    preview.classList.remove('hidden');
    drop.querySelector('.dropzone-content')?.classList.add('hidden');
    // Prepare source canvas at max 800 for preview/threshold calc
    const maxSide=1200;
    const scale=Math.min(1, maxSide/Math.max(srcImg.width, srcImg.height));
    const w=Math.round(srcImg.width*scale), h=Math.round(srcImg.height*scale);
    srcCanvas=document.createElement('canvas');
    srcCanvas.width=w; srcCanvas.height=h;
    srcCtx=srcCanvas.getContext('2d');
    srcCtx.drawImage(srcImg,0,0,w,h);
    srcData=srcCtx.getImageData(0,0,w,h);
    // Auto Otsu
    const t=computeOtsu(srcData.data);
    threshEl.value=t;
    threshVal.textContent=t;
    generateBtn.disabled=false;
    render();
  }
  input.addEventListener('change', e=> handleFile(e.target.files[0]));
  drop.addEventListener('dragover', e=>{e.preventDefault(); drop.classList.add('dragover');});
  drop.addEventListener('dragleave', ()=> drop.classList.remove('dragover'));
  drop.addEventListener('drop', e=>{e.preventDefault(); drop.classList.remove('dragover'); const f=e.dataTransfer.files[0]; if(f) handleFile(f);});

  function hexToRgb(hex){
    const v=parseInt(hex.slice(1),16);
    return {r:(v>>16)&255, g:(v>>8)&255, b:v&255};
  }
  function colorDist(r1,g1,b1,r2,g2,b2){
    return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
  }
  function render(){
    if(!srcCanvas || !srcData) return;
    const w=srcCanvas.width, h=srcCanvas.height;
    canvas.width=w; canvas.height=h;
    const ctx=canvas.getContext('2d');
    const threshold=parseInt(threshEl.value);
    const useKey=useKeyEl.checked;
    const keyRgb=hexToRgb(keyColorEl.value);
    const tol=parseInt(tolEl.value);
    const src=srcData.data;
    const out=ctx.createImageData(w,h);
    const d=out.data;
    for(let i=0;i<src.length;i+=4){
      const r=src[i], g=src[i+1], b=src[i+2];
      let isTransparent=false;
      if(useKey){
        const dist=colorDist(r,g,b,keyRgb.r,keyRgb.g,keyRgb.b);
        if(dist < tol) isTransparent=true;
      }
      if(!isTransparent){
        const lum=getLum(r,g,b);
        let isBlack = lum < threshold;
        if(inverted) isBlack=!isBlack;
        if(isBlack){
          d[i]=0; d[i+1]=0; d[i+2]=0; d[i+3]=255;
        } else {
          d[i]=0; d[i+1]=0; d[i+2]=0; d[i+3]=0;
        }
      } else {
        d[i]=0; d[i+1]=0; d[i+2]=0; d[i+3]=0;
      }
    }
    ctx.putImageData(out,0,0);
    canvas.classList.remove('hidden');
    placeholder.classList.add('hidden');
    footer.classList.remove('hidden');
  }

  generateBtn.addEventListener('click', render);

  // Zoom
  let zoom=1;
  const zoomIn=document.getElementById('sil-zoom-in');
  const zoomOut=document.getElementById('sil-zoom-out');
  const zoomLevel=document.getElementById('sil-zoom-level');
  function applyZoom(){
    canvas.style.width= zoom<=1 ? '100%' : (zoom*100)+'%';
    canvas.style.maxWidth= zoom<=1 ? '100%' : 'none';
    if(zoomLevel) zoomLevel.textContent=Math.round(zoom*100)+'%';
  }
  if(zoomIn) zoomIn.addEventListener('click', ()=>{ zoom=Math.min(3, zoom+0.25); applyZoom(); });
  if(zoomOut) zoomOut.addEventListener('click', ()=>{ zoom=Math.max(0.5, zoom-0.25); applyZoom(); });

  function download(withWhite){
    if(canvas.classList.contains('hidden')) return;
    if(!withWhite){
      canvas.toBlob(blob=>{
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');
        a.href=url; a.download=`silhouette-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    } else {
      const c=document.createElement('canvas');
      c.width=canvas.width; c.height=canvas.height;
      const ctx=c.getContext('2d');
      ctx.fillStyle='#ffffff';
      ctx.fillRect(0,0,c.width,c.height);
      ctx.drawImage(canvas,0,0);
      c.toBlob(blob=>{
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');
        a.href=url; a.download=`silhouette-white-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    }
  }
  downloadBtn.addEventListener('click', ()=> download(false));
  downloadWhiteBtn.addEventListener('click', ()=> download(true));
}
