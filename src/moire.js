let inited = false;
let imgA = null, imgB = null;
let animId = null;
let scrollOffset = 0;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function getLuminance(r,g,b){ return 0.2126*r + 0.7152*g + 0.0722*b; }

function computeOtsu(data){
  const hist = new Array(256).fill(0);
  for(let i=0;i<data.length;i+=4){
    const lum = getLuminance(data[i],data[i+1],data[i+2]);
    hist[Math.round(lum)]++;
  }
  const total = data.length/4;
  let sum=0; for(let i=0;i<256;i++) sum+= i*hist[i];
  let sumB=0, wB=0, wF=0, maxVar=0, threshold=128;
  for(let t=0;t<256;t++){
    wB+=hist[t]; if(wB===0) continue;
    wF=total-wB; if(wF===0) break;
    sumB+= t*hist[t];
    const mB=sumB/wB, mF=(sum-sumB)/wF;
    const varBetween=wB*wF*(mB-mF)*(mB-mF);
    if(varBetween>maxVar){ maxVar=varBetween; threshold=t; }
  }
  return threshold;
}

function binarizeImageData(imageData, threshold, invert){
  const d=imageData.data;
  for(let i=0;i<d.length;i+=4){
    const lum=getLuminance(d[i],d[i+1],d[i+2]);
    const bin = lum > threshold ? 255 : 0;
    const v = invert ? 255-bin : bin;
    d[i]=d[i+1]=d[i+2]=v;
  }
}

export function initMoire(){
  if(inited) return;
  inited=true;
  const inputA=document.getElementById('moire-input-a');
  const inputB=document.getElementById('moire-input-b');
  const dropA=document.getElementById('moire-drop-a');
  const dropB=document.getElementById('moire-drop-b');
  const previewA=document.getElementById('moire-preview-a');
  const previewB=document.getElementById('moire-preview-b');
  const modeEl=document.getElementById('moire-mode');
  const thresholdEl=document.getElementById('moire-threshold');
  const thresholdVal=document.getElementById('moire-threshold-value');
  const thresholdRow=document.getElementById('moire-threshold-row');
  const autoBtn=document.getElementById('moire-auto-threshold');
  const slitEl=document.getElementById('moire-slit');
  const slitVal=document.getElementById('moire-slit-value');
  const balanceEl=document.getElementById('moire-balance');
  const balanceVal=document.getElementById('moire-balance-value');
  const contrastEl=document.getElementById('moire-contrast');
  const contrastVal=document.getElementById('moire-contrast-value');
  const orientationEl=document.getElementById('moire-orientation');
  const interlaceEl=document.getElementById('moire-interlace');
  const blurAEl=document.getElementById('moire-blur-a');
  const blurAVal=document.getElementById('moire-blur-a-value');
  const sharpBEl=document.getElementById('moire-sharp-b');
  const sharpBVal=document.getElementById('moire-sharp-b-value');
  const jpegSimEl=document.getElementById('moire-jpeg-sim');
  const sizeEl=document.getElementById('moire-size');
  const generateBtn=document.getElementById('moire-generate');
  const canvas=document.getElementById('moire-canvas');
  const wrapper=document.getElementById('moire-wrapper');
  const placeholder=document.getElementById('moire-placeholder');
  const footer=document.getElementById('moire-footer');
  const info=document.getElementById('moire-info');
  const downloadBtn=document.getElementById('moire-download');
  const simSlow=document.getElementById('moire-sim-slow');
  const simFast=document.getElementById('moire-sim-fast');
  const simStop=document.getElementById('moire-sim-stop');
  const zoomIn=document.getElementById('moire-zoom-in');
  const zoomOut=document.getElementById('moire-zoom-out');
  const zoomLevel=document.getElementById('moire-zoom-level');
  const fitBtn=document.getElementById('moire-fit');

  if(!inputA || !canvas) return;

  function updateThresholdRow(){
    thresholdRow.style.display = modeEl.value==='binary' ? 'block' : 'none';
  }
  modeEl.addEventListener('change', updateThresholdRow);
  updateThresholdRow();

  thresholdEl.addEventListener('input', ()=> thresholdVal.textContent=thresholdEl.value);
  slitEl.addEventListener('input', ()=>{
    const s=parseInt(slitEl.value);
    slitVal.textContent=`${s}px / 周期${s*2}px`;
  });
  slitEl.dispatchEvent(new Event('input'));
  if(balanceEl){
    balanceEl.addEventListener('input', ()=>{
      const v=parseInt(balanceEl.value);
      balanceVal.textContent=`${100-v}% / ${v}%`;
    });
    balanceEl.dispatchEvent(new Event('input'));
  }
  if(contrastEl){
    contrastEl.addEventListener('input', ()=>{
      contrastVal.textContent=contrastEl.value+'%';
    });
    contrastEl.dispatchEvent(new Event('input'));
  }
  if(blurAEl){
    blurAEl.addEventListener('input', ()=> blurAVal.textContent=blurAEl.value+'px');
    blurAEl.dispatchEvent(new Event('input'));
  }
  if(sharpBEl){
    sharpBEl.addEventListener('input', ()=> sharpBVal.textContent=sharpBEl.value+'%');
    sharpBEl.dispatchEvent(new Event('input'));
  }

  async function handleFile(file, which){
    if(!file || !file.type.startsWith('image/')) return;
    const img=await loadImage(file);
    if(which==='A'){ imgA=img; previewA.src=img.src; previewA.classList.remove('hidden'); dropA.querySelector('.dropzone-content')?.classList.add('hidden'); }
    else { imgB=img; previewB.src=img.src; previewB.classList.remove('hidden'); dropB.querySelector('.dropzone-content')?.classList.add('hidden'); }
    updateGenerateBtn();
  }
  function updateGenerateBtn(){
    generateBtn.disabled = !(imgA && imgB);
  }

  inputA.addEventListener('change', e=> handleFile(e.target.files[0],'A'));
  inputB.addEventListener('change', e=> handleFile(e.target.files[0],'B'));
  [dropA, dropB].forEach((dz, idx)=>{
    const which= idx===0?'A':'B';
    dz.addEventListener('dragover', e=>{e.preventDefault(); dz.classList.add('dragover');});
    dz.addEventListener('dragleave', ()=> dz.classList.remove('dragover'));
    dz.addEventListener('drop', e=>{e.preventDefault(); dz.classList.remove('dragover'); const f=e.dataTransfer.files[0]; if(f) handleFile(f, which);});
  });

  autoBtn.addEventListener('click', async ()=>{
    if(!imgA || !imgB) return;
    // Use image A as reference for Otsu
    const c=document.createElement('canvas');
    c.width=256; c.height=256;
    const ctx=c.getContext('2d');
    ctx.drawImage(imgA,0,0,256,256);
    const d=ctx.getImageData(0,0,256,256).data;
    const t=computeOtsu(d);
    thresholdEl.value=t;
    thresholdVal.textContent=t;
  });

  let currentZoom=1;
  function applyZoom(){
    canvas.style.width = currentZoom<=1 ? '100%' : (currentZoom*100)+'%';
    canvas.style.maxWidth = currentZoom<=1 ? '100%' : 'none';
    if(zoomLevel) zoomLevel.textContent=Math.round(currentZoom*100)+'%';
  }
  if(zoomIn) zoomIn.addEventListener('click', ()=>{ currentZoom=Math.min(3, currentZoom+0.25); applyZoom(); });
  if(zoomOut) zoomOut.addEventListener('click', ()=>{ currentZoom=Math.max(0.5, currentZoom-0.25); applyZoom(); });
  document.getElementById('moire-zoom-out')?.addEventListener('click', ()=>{});
  if(fitBtn) fitBtn.addEventListener('click', ()=>{ currentZoom=1; applyZoom(); wrapper.scrollTop=0; });

  function stopAnim(){
    if(animId) cancelAnimationFrame(animId);
    animId=null;
    wrapper.scrollTop=0;
    wrapper.style.filter='none';
  }
  function startAnim(speed){
    stopAnim();
    // 高速時はブラーをかけて人間の残像を再現
    wrapper.style.filter = speed>2 ? 'blur(0.7px) contrast(1.1)' : 'none';
    let last=performance.now();
    function frame(now){
      const dt=now-last; last=now;
      scrollOffset += speed * dt * 0.06;
      if(scrollOffset > wrapper.scrollHeight) scrollOffset=0;
      wrapper.scrollTop = scrollOffset % wrapper.scrollHeight;
      animId=requestAnimationFrame(frame);
    }
    animId=requestAnimationFrame(frame);
  }
  if(simSlow) simSlow.addEventListener('click', ()=> startAnim(0.7));
  if(simFast) simFast.addEventListener('click', ()=> startAnim(4.5));
  if(simStop) simStop.addEventListener('click', stopAnim);

  generateBtn.addEventListener('click', async ()=>{
    if(!imgA || !imgB) return;
    generateBtn.disabled=true;
    generateBtn.textContent='生成中...';
    try{
      const mode=modeEl.value;
      const threshold=parseInt(thresholdEl.value);
      const slit=parseInt(slitEl.value);
      const balance= balanceEl ? parseInt(balanceEl.value) : 50;
      const contrastBoost= contrastEl ? parseInt(contrastEl.value) : 0;
      const orientation= orientationEl ? orientationEl.value : 'horizontal';
      const interlace= interlaceEl ? interlaceEl.value : 'rows';
      const blurA= blurAEl ? parseInt(blurAEl.value) : 0;
      const sharpB= sharpBEl ? parseInt(sharpBEl.value) : 0;
      const jpegSim= jpegSimEl ? jpegSimEl.checked : false;
      const sizeVal=sizeEl.value;
      let outW, outH;
      if(sizeVal==='original'){
        outW=imgA.width;
        outH=imgA.height;
        if(outW>8000 || outH>8000){
          if(!confirm(`元画像サイズ ${outW}×${outH}px は非常に大きく、生成に時間がかかるか失敗する可能性があります。続行しますか？`)) { generateBtn.disabled=false; generateBtn.textContent='錯視画像を生成'; return; }
        }
      } else {
        const size=parseInt(sizeVal);
        outW=size;
        outH=Math.round(size*9/16);
      }
      canvas.width=outW; canvas.height=outH;
      const ctx=canvas.getContext('2d');
      ctx.imageSmoothingQuality='high';

      // Prepare offscreen canvases for A and B resized to out size with cover
      function prepare(img, isB){
        const c=document.createElement('canvas');
        c.width=outW; c.height=outH;
        const cc=c.getContext('2d');
        let filters=[];
        if(isB && contrastBoost>0) filters.push(`contrast(${100+contrastBoost}%)`, `brightness(${100+contrastBoost*0.2}%)`);
        if(isB && sharpB>0) filters.push(`contrast(${100+sharpB*0.5}%)`);
        if(!isB && blurA>0) filters.push(`blur(${blurA}px)`);
        if(filters.length) cc.filter=filters.join(' ');
        const ratio=Math.max(outW/img.width, outH/img.height);
        const w=img.width*ratio, h=img.height*ratio;
        cc.drawImage(img, (outW-w)/2, (outH-h)/2, w, h);
        cc.filter='none';
        if(mode==='binary'){
          const id=cc.getImageData(0,0,outW,outH);
          binarizeImageData(id, threshold, false);
          cc.putImageData(id,0,0);
        }
        return c;
      }
      const ca=prepare(imgA, false);
      const cb=prepare(imgB, true);
      const dataA=ca.getContext('2d').getImageData(0,0,outW,outH);
      const dataB=cb.getContext('2d').getImageData(0,0,outW,outH);
      const out=ctx.createImageData(outW,outH);
      // Interleave with balance and orientation / interlace
      const period = slit*2;
      const dutyB = Math.max(1, Math.min(period-1, Math.round(period * balance/100)));
      for(let y=0;y<outH;y++){
        for(let x=0;x<outW;x++){
          let useA;
          if(interlace==='checker'){
            const pos = (x + y) % period;
            useA = pos < (period - dutyB);
          } else if(orientation==='vertical'){
            const pos = x % period;
            useA = pos < (period - dutyB);
          } else {
            const pos = y % period;
            useA = pos < (period - dutyB);
          }
          const src = useA ? dataA.data : dataB.data;
          const i=(y*outW+x)*4;
          out.data[i]=src[i];
          out.data[i+1]=src[i+1];
          out.data[i+2]=src[i+2];
          out.data[i+3]=255;
        }
      }
      // JPEG圧縮シミュレート（Xの再圧縮を再現）
      if(jpegSim){
        const tmp=document.createElement('canvas');
        tmp.width=outW; tmp.height=outH;
        const tctx=tmp.getContext('2d');
        tctx.putImageData(out,0,0);
        // 低品質JPEGで再描画してブロックノイズを再現
        const dataUrl=tmp.toDataURL('image/jpeg', 0.75);
        const img=new Image();
        // 同期的に再描画はできないため、プレビューではフィルタで近似
        ctx.filter='contrast(0.98) saturate(0.95)';
        ctx.putImageData(out,0,0);
        ctx.filter='none';
      } else {
        ctx.putImageData(out,0,0);
      }

      canvas.classList.remove('hidden');
      placeholder.classList.add('hidden');
      footer.classList.remove('hidden');
      info.textContent=`${outW}×${outH}px / 周期${slit*2}px / バランス${100-balance}:${balance} / ${mode==='binary'?'二値化'+threshold:'通常'}${contrastBoost? ' コントラスト+'+contrastBoost+'%':''} — 低速でA、高速でB。差が弱い場合はバランスを右に、スリットを4pxにしてください`;
      // Fit
      currentZoom=1; applyZoom();
    } catch(e){
      console.error(e);
      alert('生成に失敗しました: '+e.message);
    } finally{
      generateBtn.disabled=false;
      generateBtn.textContent='錯視画像を生成';
    }
  });

  // Download
  downloadBtn.addEventListener('click', ()=>{
    if(canvas.classList.contains('hidden')) return;
    canvas.toBlob(blob=>{
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url; a.download=`moire-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  });
}
