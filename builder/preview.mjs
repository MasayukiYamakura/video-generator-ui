import {tarotTitle} from './compiler.mjs?v=mbti-sizes-20261022';
import {tarotBrandElements,TAROT_LANDSCAPE_LAYOUT,tarotCardPosition,tarotTitleFontSize,mbtiVerticalIntroRows,layoutTarotBrandElements,tarotBrandFont} from './tarot-brand.mjs?v=mbti-sizes-20261022';
// Position guide only. Actual video is rendered by Python or Remotion.
export function drawPreview(canvas, config, image=null, intro=false, safe=true, title='', presetId='', themeTitle='テーマタイトル') {
  const {width:w,height:h,layout:l}=config;
  const v={...config.video},active=Boolean(config.design),design=config.design||{};
  const visibility=config.scenery?design.scenery_visibility||{}:{};
  for(const [key,flag] of Object.entries({caption:'caption',hook:'hook',tags:'tags',visualizer:'visualizer',theme:'theme',subtitle:'subtitle'})) {
    if(visibility[key]===false){if(key==='hook')v.hook_enabled=false;else {v['intro_'+flag]=false;v['body_'+flag]=false;}}
  }
  if(config.scenery){for(const flag of ['tags','visualizer'])if(visibility[flag]!==true&&(flag==='tags'||v.stock_provider==='pexels')){v['intro_'+flag]=false;v['body_'+flag]=false;}}
  const scale=360/w; canvas.width=360; canvas.height=Math.round(h*scale);
  const c=canvas.getContext('2d'); c.scale(scale,scale);
  const tarot=v.template==='tarot_monthly';
  const rightColumn=v.template==='portrait_brand';
  const pairedLandscape=!active&&v.format==='landscape'&&(tarot||['vertical_horizontal','horizontal_only'].includes(v.output_mode));
  const brand=tarot&&v.format==='landscape'?tarotBrandElements(config.tarotBrand,intro,config.scenery&&!intro):[];
  c.fillStyle=tarot?'#141522':'#242e3d';c.fillRect(0,0,w,h);
  if(tarot) {
    c.fillStyle='#e3cd9c';
    if(v.tarot_renderer==='remotion') {
      const cardLayout=pairedLandscape?TAROT_LANDSCAPE_LAYOUT:{format:'vertical',cardLeft:[200,670],cardTop:[495,1105]};
      const cardWidth=pairedLandscape?220:210,cardHeight=pairedLandscape?365:360;
      c.textAlign='center';
      if(intro&&!pairedLandscape) {
        c.fillStyle='#1c2948';c.fillRect(pairedLandscape?320:430,pairedLandscape?360:1010,220,375);
        c.strokeStyle='#c9aa6d';c.lineWidth=6;c.strokeRect(pairedLandscape?324:434,pairedLandscape?364:1014,212,367);
      } else if(!intro) {
        const centerX=w/2,header=pairedLandscape&&brand.some(e=>e.kind==='theme');
        c.font='32px sans-serif';if(!header)c.fillText(config.tarot ? tarotTitle(config.tarot).replace('\n',' · ') : '対象年月・星座の運勢',centerX,pairedLandscape?65:365);
        c.fillStyle='#c9aa76';c.font='42px sans-serif';c.fillText('恋愛・対人',centerX,pairedLandscape?(header?290:116):427);
        for(let i=0;i<4;i++){
          const {left:x,top:y}=tarotCardPosition(cardLayout,i);
          c.fillStyle='#1c2948';c.fillRect(x,y,cardWidth,cardHeight);
          c.strokeStyle='#c9aa6d';c.lineWidth=5;c.strokeRect(x+3,y+3,cardWidth-6,cardHeight-6);
          if(i<2) {
            c.fillStyle='rgba(4,7,17,.74)';c.fillRect(x,y+cardHeight-52,cardWidth,52);
            c.fillStyle='#fff8e9';c.font='25px sans-serif';c.fillText(i?'カップの3':'星',x+cardWidth/2,y+cardHeight-17);
          }
        }
        c.fillStyle='#fff9ec';c.font=`${pairedLandscape?54:52}px sans-serif`;c.fillText('本編字幕の表示位置',w/2,pairedLandscape?880:995);
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
  if(active&&config.scenery){c.fillStyle='#29394c';c.fillRect(0,0,w,h);}
  if(active&&design.person?.enabled){const p=design.person;c.strokeStyle='#8bd6bd';c.lineWidth=3;c.strokeRect(p.x,p.y,p.width,p.height);}
  if(active&&design.icon?.[intro?'intro':'body']&&visibility.icon!==false){const a=design.icon;c.strokeStyle='#e2cead';c.lineWidth=3;c.strokeRect(a.x,a.y,a.size,a.size);}
  function text(t,x,y,size) {c.fillStyle='white';c.font=`${size}px sans-serif`;c.textAlign='center';c.fillText(t,x,y);}
  if(!tarot&&(v.template==='portrait_brand'||v.format==='landscape')&&(intro?v.intro_tags:v.body_tags)) {
    const x=pairedLandscape?710:l.tag_x,y=pairedLandscape?55:l.tag_y;
    const scale=active?l.tag_scale:1,size=active?l.tag_font_size:40;
    c.fillStyle='#804bb5';c.fillRect(x,y,720*scale,Math.max(92,Math.floor(size*1.7)+4)*scale);
    text('占い   コーチング   引き寄せ',x+360*scale,y+60*scale,size*scale);
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
  if((active||v.format==='landscape')&&!tarot) {
    const showTheme=intro?v.intro_theme:v.body_theme;
    const showSubtitle=intro?v.intro_subtitle:v.body_subtitle;
    if(showTheme) {
      const size=l.theme_font_size;
      c.font=`bold ${size}px sans-serif`;c.textAlign='left';c.textBaseline='middle';
      const label=(themeTitle||'テーマタイトル').replaceAll('[[','').replaceAll(']]','');
      const width=Math.min(w-l.theme_x,Math.max(180,c.measureText(label).width+size));
      const height=size*1.75;
      c.fillStyle='rgba(0,0,0,.85)';c.fillRect(l.theme_x,l.theme_y,width,height);
      c.strokeStyle='#dcdcdc';c.lineWidth=3;c.strokeRect(l.theme_x,l.theme_y,width,height);
      c.fillStyle='white';c.fillText(label,l.theme_x+size*.4,l.theme_y+height/2,Math.max(1,width-size*.8));
    }
    if(showSubtitle) {
      const size=l.subtitle_font_size,label=design.theme?.subtitle??'ハシモトの占いと思想';
      c.font=`bold ${size}px sans-serif`;c.textAlign='left';c.textBaseline='middle';
      const width=Math.min(w-l.subtitle_x,c.measureText(label).width+size*2.5),height=size*1.6;
      c.fillStyle='#b31827';c.beginPath();c.moveTo(l.subtitle_x,l.subtitle_y);c.lineTo(l.subtitle_x+width,l.subtitle_y);
      c.lineTo(l.subtitle_x+width-height*.9,l.subtitle_y+height);c.lineTo(l.subtitle_x,l.subtitle_y+height);c.closePath();c.fill();
      c.fillStyle='white';c.fillText(label,l.subtitle_x+size*.8,l.subtitle_y+height/2,Math.max(1,width-size*2));
    }
  }
  if(intro&&v.hook_enabled) {
    const hookCenterX=tarot&&pairedLandscape?w/2:active?l.hook_center_x:pairedLandscape&&rightColumn?w*.68:w/2,hookCenterY=pairedLandscape?(tarot?540:250):l.hook_center_y;
    if(pairedLandscape||v.hook_orientation==='horizontal') {
      const lines=(title||'タイトルを入力してください').replaceAll('[[','').replaceAll(']]','').split('\n');
      if(tarot&&v.tarot_renderer==='remotion') {
        // Match tarot-remotion/src/tarot.jsx: Intro has a fixed size (at most
        // 140px), 1.25 line height, and is centered 15px above hook_center_y.
        // The Python hook's auto-fit setting does not apply to this renderer.
        const mbtiRows=!pairedLandscape&&config.tarot?.subject_kind==='mbti'?mbtiVerticalIntroRows(lines.join('\n'),{date:l.mbti_date_font_size,type:l.mbti_type_font_size,name:l.mbti_name_font_size}):null;
        const size=tarotTitleFontSize(lines.join('\n'),v.format,l.hook_font_size||130,config.tarot?.subject_kind==='mbti');
        c.font=`900 ${size}px "Noto Serif CJK JP", "Noto Serif CJK", serif`;
        c.textAlign='center';c.textBaseline='middle';c.fillStyle='#fff8e9';
        c.shadowColor='#070a11';c.shadowBlur=27;c.shadowOffsetY=5;
        if(mbtiRows){
          const heights=mbtiRows.map(row=>row.size*1.18),total=heights.reduce((sum,h)=>sum+h,0)+16;
          let y=hookCenterY-total/2;
          mbtiRows.forEach((row,i)=>{c.font=`900 ${row.size}px "Noto Serif CJK JP", "Noto Serif CJK", serif`;c.fillText(row.text,hookCenterX,y+heights[i]/2);y+=heights[i]+8;});
        } else lines.forEach((line,i)=>c.fillText(line,hookCenterX,hookCenterY-(pairedLandscape?0:15)+(i-(lines.length-1)/2)*size*1.25));
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
  if((intro?v.intro_caption:v.body_caption)&&!(tarot&&v.tarot_renderer==='remotion')) text('通常字幕の位置',active?l.caption_center_x:pairedLandscape&&rightColumn?w*.68:w/2,pairedLandscape?h*.68:l.caption_center_y+l.caption_font_size/3,pairedLandscape?48:l.caption_font_size);
  for(const e of layoutTarotBrandElements(brand,c)) {
    if(e.kind==='icon'){c.strokeStyle='#e2cead';c.lineWidth=3;c.strokeRect(e.x,e.y,e.width,e.height);continue;}
    c.fillStyle=e.kind==='theme'?'rgba(4,7,17,.85)':'#9f2435';c.fillRect(e.x,e.y,e.width,e.height);
    if(e.border){c.strokeStyle='#c9aa76';c.lineWidth=e.border;c.strokeRect(e.x+e.border/2,e.y+e.border/2,e.width-e.border,e.height-e.border);}
    c.font=tarotBrandFont(e.size);c.textAlign='left';c.textBaseline='middle';c.fillStyle='#fff9ec';
    c.save();c.beginPath();c.rect(e.x,e.y,e.width,e.height);c.clip();
    e.lines.forEach((line,i)=>c.fillText(line,e.x+e.border+e.paddingX,e.y+e.border+e.paddingY+e.lineHeight*(i+.5)));
    c.restore();
  }
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




