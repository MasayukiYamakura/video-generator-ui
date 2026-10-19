import {mountBuilder} from './builder/ui.mjs?v=presentation-contract-20261019';
import {mountDirectAi} from './ai-direct.mjs?v=single-social-20261016';
import {mountZodiacDisplay} from './zodiac-display.mjs?v=visual-20261016';
window.videoConfigurator=mountBuilder(()=>window.videoStudioApi);
mountDirectAi();
mountZodiacDisplay();



