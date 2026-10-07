// Position guide only. MoviePy's Noto fonts, glyph fitting and audio motion
// remain authoritative; no guide data is sent to the video renderer.
export function drawPreview(canvas, config, image=null, intro=false, safe=true) {
  const {width:w,height:h,video:v,layout:l}=config;
  const scale=360/w; canvas.width=360; canvas.height=Math.round(h*scale);
  const c=canvas.getContext('2d'); c.scale(scale,scale);
  c.fillStyle='#242e3d';c.fillRect(0,0,w,h);
  if(image&&v.background_mode!=='stock') {
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
      if(v.hook_band_enabled) {c.fillStyle=`rgba(0,0,0,${l.hook_band_opacity})`;c.fillRect(0,l.hook_center_y-l.hook_font_size,w,l.hook_font_size*2);}
      text('冒頭フック',w/2,l.hook_center_y+l.hook_font_size/3,l.hook_font_size);
    } else {
      c.fillStyle='white';c.font=`${l.hook_font_size}px serif`;c.textAlign='center';
      [...'冒頭フック'].forEach((t,i)=>c.fillText(t,w*(1-l.hook_margin_x)-l.hook_font_size/2,l.hook_top+(i+1)*l.hook_font_size));
    }
  }
  if(intro?v.intro_caption:v.body_caption) text('通常字幕の位置',w/2,l.caption_center_y+l.caption_font_size/3,l.caption_font_size);
  if(safe&&v.format==='vertical') {
    c.fillStyle='rgba(255,130,110,0.27)';c.fillRect(w*(1-l.safe_right),0,w*l.safe_right,h);c.fillRect(0,h*(1-l.safe_bottom),w,h*l.safe_bottom);
    c.strokeStyle='#ffad99';c.lineWidth=3;c.setLineDash([12,10]);c.beginPath();c.moveTo(w*(1-l.safe_right),0);c.lineTo(w*(1-l.safe_right),h);c.moveTo(0,h*(1-l.safe_bottom));c.lineTo(w,h*(1-l.safe_bottom));c.stroke();
  }
}
