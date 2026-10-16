// Display families are independent of the IDs retained for old saved settings.
export function visiblePreset(id) {
  if(['tiktok_vertical_hook','tiktok_anonymous'].includes(id))return 'tiktok_standard';
  if(['tarot_monthly','tarot_monthly_batch'].includes(id))return 'tarot_monthly_remotion';
  return id;
}
export const isBatch = video => video.template==='tarot_monthly' && video.tarot_mode==='batch';
export const isTikTok = video => video.format==='vertical' && ['standard','portrait_brand'].includes(video.template);
