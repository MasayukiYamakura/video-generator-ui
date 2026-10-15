const ZODIAC_LABELS={
  '牡羊座':'おひつじ座','牡牛座':'おうし座','双子座':'ふたご座','蟹座':'かに座',
  '獅子座':'しし座','乙女座':'おとめ座','天秤座':'てんびん座','蠍座':'さそり座',
  '射手座':'いて座','山羊座':'やぎ座','水瓶座':'みずがめ座','魚座':'うお座',
};
const replace=text=>Object.entries(ZODIAC_LABELS).reduce((value,[from,to])=>value.replaceAll(from,to),text);
function relabelNode(root){
  if(!root)return;
  if((root.nodeType===Node.TEXT_NODE?root.parentElement:root).closest?.('[data-preserve-zodiac]'))return;
  if(root.nodeType===Node.TEXT_NODE){
    const parent=root.parentElement;
    if(parent?.closest('[data-preserve-zodiac]'))return;
    if(!parent||['SCRIPT','STYLE','TEXTAREA'].includes(parent.tagName))return;
    const next=replace(root.nodeValue||'');if(next!==root.nodeValue)root.nodeValue=next;return;
  }
  if(root.nodeType!==Node.ELEMENT_NODE&&root!==document.body)return;
  for(const option of root.querySelectorAll?.('option')||[]){const next=replace(option.textContent||'');if(next!==option.textContent)option.textContent=next;}
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node;while((node=walker.nextNode()))relabelNode(node);
}
export function mountZodiacDisplay(){
  relabelNode(document.body);
  const observer=new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='characterData')relabelNode(record.target);
      for(const node of record.addedNodes)relabelNode(node);
    }
  });
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  return observer;
}

