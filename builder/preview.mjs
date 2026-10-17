import {tarotTitle} from './compiler.mjs?v=maintenance-20261016';
// Position guide only. Actual video is rendered by Python or Remotion.
export function drawPreview(canvas, config, image=null, intro=false, safe=true, title='', presetId='') {
  const {width:w,height:h,video:v,layout:l}=config;
  const scale=360/w; canvas.width=360; canvas.height=Math.round(h*scale);
  const c=canvas.getContext('2d'); c.scale(scale,scale);
  const tarot=v.template==='tarot_monthly';
  const rightColumn=v.template==='portrait_brand';
  const pairedLandscape=v.format==='landscape'&&['vertical_horizontal','horizontal_only'].includes(v.output_mode);
  c.fillStyle=tarot?'#141522':'#242e3d';c.fillRect(0,0,w,h);
  if(tarot) {
    c.fillStyle='#e3cd9c';
    if(v.tarot_renderer==='remotion') {
      const cardLeft=pairedLandscape?[105,390]:[200,670],cardTop=pairedLandscape?[165,555]:[495,1105];
      const cardWidth=pairedLandscape?220:210,cardHeight=pairedLandscape?365:360;
      c.textAlign='center';
      if(intro) {
        c.fillStyle='#1c2948';c.fillRect(pairedLandscape?320:430,pairedLandscape?360:1010,220,375);
        c.strokeStyle='#c9aa6d';c.lineWidth=6;c.strokeRect(pairedLandscape?324:434,pairedLandscape?364:1014,212,367);
      } else {
        const centerX=pairedLandscape?w*.5:w/2;
        c.font='32px sans-serif';c.fillText(config.tarot ? tarotTitle(config.tarot).replace('\n',' · ') : '対象年月・星座の運勢',centerX,pairedLandscape?65:365);
        c.fillStyle='#c9aa76';c.font='42px sans-serif';c.fillText('恋愛・対人',centerX,pairedLandscape?116:427);
        for(let i=0;i<4;i++){
          const x=cardLeft[i%2],y=cardTop[Math.floor(i/2)];
          c.fillStyle='#1c2948';c.fillRect(x,y,cardWidth,cardHeight);
          c.strokeStyle='#c9aa6d';c.lineWidth=5;c.strokeRect(x+3,y+3,cardWidth-6,cardHeight-6);
          if(i<2) {
            c.fillStyle='rgba(4,7,17,.74)';c.fillRect(x,y+cardHeight-52,cardWidth,52);
            c.fillStyle='#fff8e9';c.font='25px sans-serif';c.fillText(i?'カップの3':'星',x+cardWidth/2,y+cardHeight-17);
          }
        }
        c.fillStyle='#fff9ec';c.font=`${pairedLandscape?54:52}px sans-serif`;c.fillText('本編字幕の表示位置',pairedLandscape?1305:w/2,pairedLandscape?545:995);
        if(pairedLandscape)for(let i=0;i<4;i++){c.fillStyle=i<2?'#1c2948':'#312c3a';c.fillRect(95+i*76,940,48,80);c.strokeStyle=i===1?'#e2cead':'#c9aa6d';c.strokeRect(98+i*76,943,42,74);}
      }
    } else {
      c.font='52px serif';c.textAlign='center';c.fillText('月間星座タロット',w/2,160);
      for(let i=0;i<4;i++){
        const x=120+i*220;
        c.fillStyle='#1c2948';c.fillRect(x,420,170,290);
        c.strokeStyle='#c9aa6d';c.lineWidth=6;c.strokeRect(x+4,424,162,282);
      }
    }
  }
  if(!tarot&&image&&v.background_mode!=='stock'&&pairedLandscape&&v.template==='portrait_brand') {
    const zoom=Math.max(w/image.width,h/image.height),iw=image.width*zoom,ih=image.height*zoom;
    c.drawImage(image,(w-iw)/2,(h-ih)/2,iw,ih);c.fillStyle='rgba(0,0,0,.7)';c.fillRect(0,0,w,h);
    const fit=Math.min(600/image.width,h*.90/image.height),pw=image.width*fit,ph=image.height*fit;
    c.drawImage(image,36,(h-ph)/2,pw,ph);
  } else if(!tarot&&image&&v.background_mode!=='stock') {
    const zoom=Math.max(w/image.width,h/image.height), iw=image.width*zoom,ih=image.height*zoom;
    c.drawImage(image,(w-iw)/2,(h-ih)/2,iw,ih);
    c.fillStyle='rgba(0,0,0,0.2)';c.fillRect(0,0,w,h);
  }
  function text(t,x,y,size) {c.fillStyle='white';c.font=`${size}px sans-serif`;c.textAlign='center';c.fillText(t,x,y);}
  if(v.template==='portrait_brand'&&(intro?v.intro_tags:v.body_tags)) {
    const x=pairedLandscape?710:l.tag_x,y=pairedLandscape?55:l.tag_y;
    c.fillStyle='#804bb5';c.fillRect(x,y,720,92);
    text('占い   コーチング   引き寄せ',x+360,y+60,40);
  }
  if(intro?v.intro_visualizer:v.body_visualizer) {
    const centerX=pairedLandscape?w*.68:l.visualizer_x,centerY=pairedLandscape?h*.83:l.visualizer_y;
    const width=w*l.visualizer_width_ratio;
    c.fillStyle='#a5e9ff';
    for(let i=0;i<40;i++) {
      const height=Math.max(10,(1-Math.abs(i-19.5)/20)*w*0.08);
      c.fillRect(centerX-width/2+i*width/40,centerY-height/2,width/60,height);
    }
  }
  if(intro&&v.hook_enabled) {
    const hookCenterX=pairedLandscape&&rightColumn?w*.68:w/2,hookCenterY=pairedLandscape?(tarot?150:250):l.hook_center_y;
    if(pairedLandscape||v.hook_orientation==='horizontal') {
      const lines=(title||'タイトルを入力してください').replaceAll('[[','').replaceAll(']]','').split('\n');
      if(tarot&&v.tarot_renderer==='remotion') {
        // Match tarot-remotion/src/tarot.jsx: Intro has a fixed size (at most
        // 140px), 1.25 line height, and is centered 15px above hook_center_y.
        // The Python hook's auto-fit setting does not apply to this renderer.
        const size=Math.min(l.hook_font_size||130,pairedLandscape?78:140);
        c.font=`900 ${size}px "Noto Serif CJK JP", "Noto Serif CJK", serif`;
        c.textAlign='center';c.textBaseline='middle';c.fillStyle='#fff8e9';
        c.shadowColor='#070a11';c.shadowBlur=27;c.shadowOffsetY=5;
        lines.forEach((line,i)=>c.fillText(line,hookCenterX,hookCenterY-(pairedLandscape?0:15)+(i-(lines.length-1)/2)*size*1.25));
        c.shadowColor='transparent';c.shadowBlur=0;c.shadowOffsetY=0;
      } else {
      const bandWidth=w*(pairedLandscape ? Math.min(l.hook_band_width_ratio,rightColumn?0.54:0.84) : l.hook_band_width_ratio), limit=Math.min(bandWidth,w*(pairedLandscape ? (rightColumn?0.54:0.84) : l.hook_max_width_ratio));
      let size=pairedLandscape?(rightColumn?62:72):l.hook_font_size;
      const height=()=>lines.length*size*1.3+2*l.hook_band_padding_y;
      function fits(){c.font=`900 ${size}px serif`;return Math.max(...lines.map(line=>c.measureText(line).width))+size*0.15<=limit&&height()<=2*Math.min(hookCenterY,h-hookCenterY);}
      if(l.hook_font_size_mode==='auto'||pairedLandscape)while(size>1&&!fits())size--;
      if(v.hook_band_enabled) {c.globalAlpha=l.hook_band_opacity;c.fillStyle=l.hook_band_color;c.fillRect(hookCenterX-bandWidth/2,hookCenterY-height()/2,bandWidth,height());c.globalAlpha=1;}
      c.font=`900 ${size}px serif`;c.textAlign='center';c.textBaseline='middle';
      lines.forEach((line,i)=>{const y=hookCenterY+(i-(lines.length-1)/2)*size*1.3;c.strokeStyle='black';c.lineWidth=6;c.strokeText(line,hookCenterX,y);c.fillStyle='white';c.fillText(line,hookCenterX,y);});
      if(l.hook_font_size_mode==='fixed'&&!fits()){c.fillStyle='#ffad99';c.font='32px sans-serif';c.fillText('固定サイズが表示領域を超えています',w/2,l.hook_center_y+height()/2+45);}
      }
    } else {
      c.fillStyle='white';c.font=`${l.hook_font_size}px serif`;c.textAlign='center';
      [...(title||'タイトル').replaceAll('[[','').replaceAll(']]','').replaceAll('\n','')].forEach((t,i)=>c.fillText(t,w*(1-l.hook_margin_x)-l.hook_font_size/2,l.hook_top+(i+1)*l.hook_font_size));
    }
  }
  if((intro?v.intro_caption:v.body_caption)&&!(tarot&&v.tarot_renderer==='remotion')) text('通常字幕の位置',pairedLandscape&&rightColumn?w*.68:w/2,pairedLandscape?h*.68:l.caption_center_y+l.caption_font_size/3,pairedLandscape?48:l.caption_font_size);
  if(safe&&v.format==='vertical') {
    c.fillStyle='rgba(255,130,110,0.27)';c.fillRect(0,0,w,h*l.safe_top);c.fillRect(w*(1-l.safe_right),0,w*l.safe_right,h);c.fillRect(0,h*(1-l.safe_bottom),w,h*l.safe_bottom);
    c.strokeStyle='#ffad99';c.lineWidth=3;c.setLineDash([12,10]);c.beginPath();c.moveTo(0,h*l.safe_top);c.lineTo(w,h*l.safe_top);c.moveTo(w*(1-l.safe_right),0);c.lineTo(w*(1-l.safe_right),h);c.moveTo(0,h*(1-l.safe_bottom));c.lineTo(w,h*(1-l.safe_bottom));c.stroke();
  }
  if(safe&&v.format==='landscape') {
    c.strokeStyle='#ffad99';c.lineWidth=3;c.setLineDash([12,10]);c.strokeRect(w*.05,h*.05,w*.9,h*.9);c.setLineDash([]);
  }
  if(safe&&intro&&v.format==='vertical'&&
      ((tarot&&v.tarot_renderer==='remotion')||presetId==='tiktok_standard')) {
    // Keep the symmetric title guide separate from the red TikTok UI guide.
    c.strokeStyle='#ffe073';c.lineWidth=4;c.setLineDash([16,10]);
    c.beginPath();c.moveTo(w*.1,0);c.lineTo(w*.1,h);
    c.moveTo(w*.9,0);c.lineTo(w*.9,h);c.stroke();c.setLineDash([]);
    c.fillStyle='#ffe073';c.font='bold 30px sans-serif';c.textAlign='center';c.textBaseline='top';
    c.fillText('タイトル用・左右10%',w/2,34);
  }
  c.setLineDash([12,10]);c.strokeStyle='#6de5ff';c.lineWidth=2/scale;
  c.beginPath();c.moveTo(w/2,0);c.lineTo(w/2,h);c.moveTo(0,h/2);c.lineTo(w,h/2);c.stroke();c.setLineDash([]);
}

