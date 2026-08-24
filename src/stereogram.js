let inited=false;
let depthImg=null;
let patternImg=null;

function loadImage(file){
  return new Promise((res,rej)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>res(img);
    img.onerror=rej;
    img.src=url;
  });
}
function getLum(r,g,b){ return 0.2126*r + 0.7152*g + 0.0722*b; }

export function initStereogram(){
  if(inited) return;
  inited=true;
  const input=document.getElementById('stereo-input');
  const drop=document.getElementById('stereo-dropzone');
  const preview=document.getElementById('stereo-preview');
  const textModeBtn=document.getElementById('stereo-mode-text');
  const imageModeBtn=document.getElementById('stereo-mode-image');
  const imageModeDiv=document.getElementById('stereo-image-mode');
  const textModeDiv=document.getElementById('stereo-text-mode');
  const textInput=document.getElementById('stereo-text');
  const fontEl=document.getElementById('stereo-font');
  const textGenBtn=document.getElementById('stereo-text-generate');
  const textCanvas=document.getElementById('stereo-text-canvas');
  const patternEl=document.getElementById('stereo-pattern');
  const patternDrop=document.getElementById('stereo-pattern-dropzone');
  const patternInput=document.getElementById('stereo-pattern-input');
  const patternPreview=document.getElementById('stereo-pattern-preview');
  const colorEl=document.getElementById('stereo-color');
  const depthEl=document.getElementById('stereo-depth');
  const depthVal=document.getElementById('stereo-depth-value');
  const widthEl=document.getElementById('stereo-width');
  const widthVal=document.getElementById('stereo-width-value');
  const generateBtn=document.getElementById('stereo-generate');
  const canvas=document.getElementById('stereogram-canvas');
  const wrapper=document.getElementById('stereo-wrapper');
  const placeholder=document.getElementById('stereo-placeholder');
  const footer=document.getElementById('stereo-footer');
  const downloadBtn=document.getElementById('stereo-download');

  if(!input || !canvas) return;

  let depthCanvas=null;
  let useTextMode=false;

  function updateModeUI(){
    if(useTextMode){
      imageModeDiv.classList.add('hidden');
      textModeDiv.classList.remove('hidden');
      textModeBtn.classList.add('active');
      imageModeBtn.classList.remove('active');
    } else {
      imageModeDiv.classList.remove('hidden');
      textModeDiv.classList.add('hidden');
      imageModeBtn.classList.add('active');
      textModeBtn.classList.remove('active');
    }
  }
  imageModeBtn.addEventListener('click', ()=>{ useTextMode=false; updateModeUI(); updateGenerateBtn(); });
  textModeBtn.addEventListener('click', ()=>{ useTextMode=true; updateModeUI(); updateGenerateBtn(); });
  updateModeUI();

  depthEl.addEventListener('input', ()=> depthVal.textContent=depthEl.value);
  widthEl.addEventListener('input', ()=> widthVal.textContent=widthEl.value+'px');
  depthEl.dispatchEvent(new Event('input'));
  widthEl.dispatchEvent(new Event('input'));

  patternEl.addEventListener('change', ()=>{
    patternDrop.classList.toggle('hidden', patternEl.value!=='custom');
  });
  patternEl.dispatchEvent(new Event('change'));

  async function handleDepthFile(file){
    if(!file || !file.type.startsWith('image/')) return;
    depthImg=await loadImage(file);
    preview.src=depthImg.src;
    preview.classList.remove('hidden');
    drop.querySelector('.dropzone-content')?.classList.add('hidden');
    updateGenerateBtn();
  }
  async function handlePatternFile(file){
    if(!file) return;
    patternImg=await loadImage(file);
    patternPreview.src=patternImg.src;
    patternPreview.classList.remove('hidden');
    patternDrop.querySelector('.dropzone-content')?.classList.add('hidden');
  }
  function updateGenerateBtn(){
    if(useTextMode){
      generateBtn.disabled = !textInput.value.trim();
    } else {
      generateBtn.disabled = !depthImg;
    }
  }
  input.addEventListener('change', e=> handleDepthFile(e.target.files[0]));
  drop.addEventListener('click', e=>{
    if(e.target===input) return;
    if(e.target.closest('label')===drop) return;
    input.click();
  });
  drop.addEventListener('dragover', e=>{e.preventDefault(); drop.classList.add('dragover');});
  drop.addEventListener('dragleave', ()=> drop.classList.remove('dragover'));
  drop.addEventListener('drop', e=>{e.preventDefault(); drop.classList.remove('dragover'); const f=e.dataTransfer.files[0]; if(f) handleDepthFile(f);});
  textInput.addEventListener('input', updateGenerateBtn);
  patternInput.addEventListener('change', e=> handlePatternFile(e.target.files[0]));
  patternDrop.addEventListener('click', e=>{
    if(e.target===patternInput) return;
    if(e.target.closest('label')===patternDrop) return;
    patternInput.click();
  });
  patternDrop.addEventListener('dragover', e=>{e.preventDefault(); patternDrop.classList.add('dragover');});
  patternDrop.addEventListener('dragleave', ()=> patternDrop.classList.remove('dragover'));
  patternDrop.addEventListener('drop', e=>{e.preventDefault(); patternDrop.classList.remove('dragover'); const f=e.dataTransfer.files[0]; if(f) handlePatternFile(f);});

  textGenBtn.addEventListener('click', ()=>{
    const text=textInput.value.trim() || 'MILLION';
    const w=800, h=400;
    textCanvas.width=w; textCanvas.height=h;
    const ctx=textCanvas.getContext('2d');
    ctx.fillStyle='#000';
    ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#fff';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    const fontWeight=fontEl.value;
    ctx.font=`${fontWeight} 120px "Noto Sans JP", sans-serif`;
    // Adjust font size to fit
    let fontSize=120;
    ctx.font=`${fontWeight} ${fontSize}px "Noto Sans JP", sans-serif`;
    while(ctx.measureText(text).width > w-80 && fontSize>30){
      fontSize-=4;
      ctx.font=`${fontWeight} ${fontSize}px "Noto Sans JP", sans-serif`;
    }
    ctx.fillText(text, w/2, h/2);
    // Slight blur for smoother depth
    ctx.filter='blur(2px)';
    ctx.drawImage(textCanvas,0,0);
    ctx.filter='none';
    // Use this canvas as depthImg
    const dataUrl=textCanvas.toDataURL();
    const img=new Image();
    img.onload=()=>{
      depthImg=img;
      preview.src=dataUrl;
      preview.classList.remove('hidden');
      updateGenerateBtn();
    };
    img.src=dataUrl;
  });

  // Zoom
  let zoom=1;
  const zoomIn=document.getElementById('stereo-zoom-in');
  const zoomOut=document.getElementById('stereo-zoom-out');
  const zoomLevel=document.getElementById('stereo-zoom-level');
  function applyZoom(){
    canvas.style.width= zoom<=1 ? '100%' : (zoom*100)+'%';
    canvas.style.maxWidth= zoom<=1 ? '100%' : 'none';
    if(zoomLevel) zoomLevel.textContent=Math.round(zoom*100)+'%';
  }
  if(zoomIn) zoomIn.addEventListener('click', ()=>{ zoom=Math.min(3, zoom+0.25); applyZoom(); });
  if(zoomOut) zoomOut.addEventListener('click', ()=>{ zoom=Math.max(0.5, zoom-0.25); applyZoom(); });

  generateBtn.addEventListener('click', async ()=>{
    if(useTextMode && !textInput.value.trim()) return;
    if(!useTextMode && !depthImg) return;
    generateBtn.disabled=true;
    generateBtn.textContent='生成中...';
    try{
      const outW=1000, outH=600;
      const patternWidth=parseInt(widthEl.value);
      const maxDepth=parseInt(depthEl.value);
      canvas.width=outW; canvas.height=outH;
      const ctx=canvas.getContext('2d');

      // Prepare depth map canvas scaled to out size
      const depthC=document.createElement('canvas');
      depthC.width=outW; depthC.height=outH;
      const dctx=depthC.getContext('2d');
      dctx.fillStyle='#000';
      dctx.fillRect(0,0,outW,outH);
      if(useTextMode){
        // Use textCanvas scaled
        if(textCanvas.width===0){
          // Generate on the fly if not yet
          textGenBtn.click();
          await new Promise(r=>setTimeout(r,100));
        }
        dctx.drawImage(textCanvas,0,0,outW,outH);
      } else {
        // Draw depthImg with cover
        const ratio=Math.max(outW/depthImg.width, outH/depthImg.height);
        const w=depthImg.width*ratio, h=depthImg.height*ratio;
        dctx.drawImage(depthImg, (outW-w)/2, (outH-h)/2, w, h);
      }
      const depthData=dctx.getImageData(0,0,outW,outH).data;

      // 搬送波は必ず無意味幾何学テクスチャに限定（仕様書5.1準拠）
      // 有意味なキャラクター絵をそのまま搬送波にすると腹側路の物体認識が対応問題を阻害する
      const useColor = colorEl && colorEl.checked;
      const patternType=patternEl.value;
      let patternCanvas=document.createElement('canvas');
      patternCanvas.width=patternWidth; patternCanvas.height=outH;
      const pctx=patternCanvas.getContext('2d');
      if(useColor && depthImg && !useTextMode){
        // テクスチャード・ステレオグラム：元画像の色をサンプリングしたドット群を生成
        // 元画像を重ねる透過合成ではなく、ドット自体を元画像の色で生成してからシフトさせる
        pctx.fillStyle='#0a0a0f';
        pctx.fillRect(0,0,patternWidth,outH);
        // depthImg から色をサンプリングしたドットを生成
        const tmpC=document.createElement('canvas');
        tmpC.width=depthImg.width; tmpC.height=depthImg.height;
        const tmpCtx=tmpC.getContext('2d');
        tmpCtx.drawImage(depthImg,0,0,depthImg.width,depthImg.height);
        let tmpData;
        try { tmpData=tmpCtx.getImageData(0,0,depthImg.width,depthImg.height).data; } catch { tmpData=null; }
        for(let i=0;i<2500;i++){
          const x=Math.random()*patternWidth, y=Math.random()*outH;
          let r=200,g=200,b=200;
          if(tmpData){
            const sx=Math.floor(Math.random()*depthImg.width);
            const sy=Math.floor(Math.random()*depthImg.height);
            const idx=(sy*depthImg.width+sx)*4;
            r=tmpData[idx]; g=tmpData[idx+1]; b=tmpData[idx+2];
            // 明るすぎる/暗すぎる色は視差検出を妨げるため少し調整
            const lum=getLum(r,g,b);
            if(lum<30 || lum>225){
              r=Math.random()*80+100; g=r; b=r;
            }
          }
          pctx.fillStyle=`rgb(${r|0},${g|0},${b|0})`;
          pctx.beginPath();
          pctx.arc(x,y, Math.random()*1.2+0.6, 0, Math.PI*2);
          pctx.fill();
        }
      } else if(patternType==='dots'){
        // 高コントラストなランダムドット（黒背景に白ドット）が立体視しやすい — マッチング・プリミティブを明確に
        pctx.fillStyle='#0a0a0f';
        pctx.fillRect(0,0,patternWidth,outH);
        for(let i=0;i<2200;i++){
          const x=Math.random()*patternWidth, y=Math.random()*outH;
          const v=Math.random()>0.5 ? 255 : Math.random()*40;
          if(v===255){
            pctx.fillStyle=`rgb(255,255,255)`;
          } else {
            pctx.fillStyle=`rgb(${v|0},${v|0},${v|0})`;
          }
          pctx.beginPath();
          pctx.arc(x,y, Math.random()*1.3+0.5, 0, Math.PI*2);
          pctx.fill();
        }
        for(let i=0;i<300;i++){
          const x=Math.random()*patternWidth, y=Math.random()*outH;
          pctx.fillStyle=`hsl(${Math.random()*60+200}, 75%, 62%)`;
          pctx.fillRect(x,y,1.8,1.8);
        }
      } else if(patternType==='stripes'){
        for(let x=0;x<patternWidth;x++){
          const v = (x%8<4) ? 230 : 40;
          pctx.fillStyle=`rgb(${v},${v},${v})`;
          pctx.fillRect(x,0,1,outH);
        }
      } else if(patternType==='custom' && patternImg){
        const ratio=Math.max(patternWidth/patternImg.width, outH/patternImg.height);
        const w=patternImg.width*ratio, h=patternImg.height*ratio;
        pctx.drawImage(patternImg, (patternWidth-w)/2, (outH-h)/2, w, h);
      } else {
        // Fallback dots
        pctx.fillStyle='#ddd';
        pctx.fillRect(0,0,patternWidth,outH);
      }
      const patternData=pctx.getImageData(0,0,patternWidth,outH).data;

      // Generate stereogram — 非累積方式で周期を一定に保ち、右側の崩壊を防ぐ
      // 各ピクセルは常に基本周期 T を基準に shift する（累積参照をしない）
      // shift(x,y) = round(D(x,y) * effectiveMaxDepth), px = (x - shift) mod T
      const out=ctx.createImageData(outW,outH);
      const outData=out.data;
      const effectiveMaxDepth = Math.min(maxDepth, Math.floor(patternWidth * 0.45));
      for(let y=0;y<outH;y++){
        for(let x=0;x<outW;x++){
          const depthIdx=(y*outW+x)*4;
          const lum=getLum(depthData[depthIdx], depthData[depthIdx+1], depthData[depthIdx+2]);
          const depth = lum / 255;
          const shift = Math.round(depth * effectiveMaxDepth);
          // 常に基本周期 T を基準にシフト（累積誤差を防ぐ）— 境界は正しく剰余でループ
          let patternX = (x - shift) % patternWidth;
          if(patternX < 0) patternX += patternWidth;
          const pi=(y*patternWidth + patternX)*4;
          const oi=(y*outW + x)*4;
          // カラーブレンドは破棄：搬送波自体が既に色サンプリング済みのため、視差情報をマスキングしない
          outData[oi]=patternData[pi];
          outData[oi+1]=patternData[pi+1];
          outData[oi+2]=patternData[pi+2];
          outData[oi+3]=255;
        }
      }
      ctx.putImageData(out,0,0);

      canvas.classList.remove('hidden');
      placeholder.classList.add('hidden');
      footer.classList.remove('hidden');
      zoom=1; applyZoom();
    } catch(e){
      console.error(e);
      alert('生成に失敗しました: '+e.message);
    } finally{
      generateBtn.disabled=false;
      generateBtn.textContent='ステレオグラムを生成';
    }
  });

  downloadBtn.addEventListener('click', ()=>{
    if(canvas.classList.contains('hidden')) return;
    canvas.toBlob(blob=>{
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url; a.download=`stereogram-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  });
}
