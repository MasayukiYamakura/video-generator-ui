import {mountBuilder} from './builder/ui.mjs?v=tarot-brand-20261019';
import {mountDirectAi} from './ai-direct.mjs?v=single-social-20261016';
import {mountZodiacDisplay} from './zodiac-display.mjs?v=visual-20261016';
window.videoConfigurator=mountBuilder(()=>window.videoStudioApi);
mountDirectAi();
mountZodiacDisplay();



