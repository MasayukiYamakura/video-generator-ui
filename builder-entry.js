import {mountBuilder} from './builder/ui.mjs?v=tarot-display-20261021';
import {mountDirectAi} from './ai-direct.mjs?v=tarot-display-20261021';
import {mountZodiacDisplay} from './zodiac-display.mjs?v=visual-20261016';
window.videoConfigurator=mountBuilder(()=>window.videoStudioApi);
mountDirectAi();
mountZodiacDisplay();






