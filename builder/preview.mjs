// Position guide only. Actual video is rendered by Python or Remotion.
export function drawPreview(canvas, config, image=null, intro=false, safe=true, title='') {
  const {width:w,height:h,video:v,layout:l}=config;
  const scale=360/w; canvas.width=360; canvas.height=Math.round(h*scale);
  const c=canvas.getContext('2d'); c.scale(scale,scale);
  const tarot=v.template==='tarot_monthly';
  c.fillStyle=tarot?'#141522':'#242e3d';c.fillRect(0,0,w,h);
  if(tarot) {
    c.fillStyle='#e3cd9c';
    if(v.tarot_renderer==='remotion') {
      c.textAlign='center';
      if(intro) {
        c.fillStyle='#1c2948';c.fillRect(430,1010,220,375);
        c.strokeStyle='#c9aa6d';c.lineWidth=6;c.strokeRect(434,1014,212,367);
      } else {
        c.font='32px sans-serif';c.fillText('2026年 10月 · 射手座',w/2,365);
        c.fillStyle='#c9aa76';c.font='42px sans-serif';c.fillText('恋愛・対人',w/2,427);
        for(let i=0;i<4;i++){
          const x=i%2?670:200,y=i<2?495:1105;
          c.fillStyle='#1c2948';c.fillRect(x,y,210,360);
          c.strokeStyle='#c9aa6d';c.lineWidth=5;c.strokeRect(x+3,y+3,204,354);
          if(i<2) {
            c.fillStyle='rgba(4,7,17,.74)';c.fillRect(x,y+308,210,52);
            c.fillStyle='#fff8e9';c.font='25px sans-serif';c.fillText(i?'カップの3':'星',x+105,y+343);
          }
        }
        c.fillStyle='#fff9ec';c.font='52px sans-serif';c.fillText('本編字幕の表示位置',w/2,995);
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
  if(!tarot&&image&&v.background_mode!=='stock') {
    const zoom=Math.max(w/image.width,h/image.height), iw=image.width*zoom,ih=image.height*zoom;
    c.drawImage(image,(w-iw)/2,(h-ih)/2,iw,ih);
    c.fillStyle='rgba(0,0,0,0.2)';c.fillRect(0,0,w,h);
  }
  function text(t,x,y,size) {c.fillStyle='white';c.font=`${size}px sans-serif`;c.textAlign='center';c.fillText(t,x,y);}
  if(v.template==='portrait_brand'&&(intro?v.intro_tags:v.body_tags)) {
    c.fillStyle='#804bb5';c.fillRect(l.tag_x,l.tag_y,720,92);
    text('占い   コーチング   引き寄せ',l.tag_x+360,l.tag_y+60,40);
  }
  if(intro?v.intro_visualizer:v.body_visualizer) {
    const width=w*l.visualizer_width_ratio;
    c.fillStyle='#a5e9ff';
    for(let i=0;i<40;i++) {
      const height=Math.max(10,(1-Math.abs(i-19.5)/20)*w*0.08);
      c.fillRect(l.visualizer_x-width/2+i*width/40,l.visualizer_y-height/2,width/60,height);
    }
  }
  if(intro&&v.hook_enabled) {
    if(v.hook_orientation==='horizontal') {
      const lines=(title||'タイトルを入力してください').replaceAll('[[','').replaceAll(']]','').split('\n');
      const bandWidth=w*l.hook_band_width_ratio, limit=Math.min(bandWidth,w*l.hook_max_width_ratio);
      let size=l.hook_font_size;
      const height=()=>lines.length*size*1.3+2*l.hook_band_padding_y;
      function fits(){c.font=`900 ${size}px serif`;return Math.max(...lines.map(line=>c.measureText(line).width))+size*0.15<=limit&&height()<=2*Math.min(l.hook_center_y,h-l.hook_center_y);}
      if(l.hook_font_size_mode==='auto')while(size>1&&!fits())size--;
      if(v.hook_band_enabled) {c.globalAlpha=l.hook_band_opacity;c.fillStyle=l.hook_band_color;c.fillRect((w-bandWidth)/2,l.hook_center_y-height()/2,bandWidth,height());c.globalAlpha=1;}
      c.font=`900 ${size}px serif`;c.textAlign='center';c.textBaseline='middle';
      lines.forEach((line,i)=>{const y=l.hook_center_y+(i-(lines.length-1)/2)*size*1.3;c.strokeStyle='black';c.lineWidth=6;c.strokeText(line,w/2,y);c.fillStyle='white';c.fillText(line,w/2,y);});
      if(l.hook_font_size_mode==='fixed'&&!fits()){c.fillStyle='#ffad99';c.font='32px sans-serif';c.fillText('固定サイズが表示領域を超えています',w/2,l.hook_center_y+height()/2+45);}
    } else {
      c.fillStyle='white';c.font=`${l.hook_font_size}px serif`;c.textAlign='center';
      [...(title||'タイトル').replaceAll('[[','').replaceAll(']]','').replaceAll('\n','')].forEach((t,i)=>c.fillText(t,w*(1-l.hook_margin_x)-l.hook_font_size/2,l.hook_top+(i+1)*l.hook_font_size));
    }
  }
  if((intro?v.intro_caption:v.body_caption)&&!(tarot&&v.tarot_renderer==='remotion')) text('通常字幕の位置',w/2,l.caption_center_y+l.caption_font_size/3,l.caption_font_size);
  if(safe&&v.format==='vertical') {
    c.fillStyle='rgba(255,130,110,0.27)';c.fillRect(0,0,w,h*l.safe_top);c.fillRect(w*(1-l.safe_right),0,w*l.safe_right,h);c.fillRect(0,h*(1-l.safe_bottom),w,h*l.safe_bottom);
    c.strokeStyle='#ffad99';c.lineWidth=3;c.setLineDash([12,10]);c.beginPath();c.moveTo(0,h*l.safe_top);c.lineTo(w,h*l.safe_top);c.moveTo(w*(1-l.safe_right),0);c.lineTo(w*(1-l.safe_right),h);c.moveTo(0,h*(1-l.safe_bottom));c.lineTo(w,h*(1-l.safe_bottom));c.stroke();
  }
  c.setLineDash([12,10]);c.strokeStyle='#6de5ff';c.lineWidth=2/scale;
  c.beginPath();c.moveTo(w/2,0);c.lineTo(w/2,h);c.moveTo(0,h/2);c.lineTo(w,h/2);c.stroke();c.setLineDash([]);
}

