export function el(tag,text) {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
export function options(select,items,current) {select.replaceChildren();for(const [value,label] of items){const o=el('option',label);o.value=value;select.append(o);}if(current!==undefined)select.value=current;}
export function field(root,key,label,items,type='checkbox') {
  const wrapper=el('label',label), input=el(items?'select':'input');input.id='pb_'+key;
  if(items) options(input,items);else input.type=type;
  if(type==='checkbox'&&!items)wrapper.className='check';
  wrapper.append(input);root.append(wrapper);return input;
}
