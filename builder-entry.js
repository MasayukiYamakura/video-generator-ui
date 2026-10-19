import {mountBuilder} from './builder/ui.mjs?v=mbti-20261019';
import {mountDirectAi} from './ai-direct.mjs?v=mbti-20261019';
import {mountZodiacDisplay} from './zodiac-display.mjs?v=visual-20261016';
window.videoConfigurator=mountBuilder(()=>window.videoStudioApi);
mountDirectAi();
mountZodiacDisplay();



