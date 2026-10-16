import {mountBuilder} from './builder/ui.mjs?v=maintenance-20261016';
import {mountDirectAi} from './ai-direct.mjs?v=gemini-structured-20261015';
import {mountZodiacDisplay} from './zodiac-display.mjs?v=maintenance-20261016';
window.videoConfigurator=mountBuilder(()=>window.videoStudioApi);
mountDirectAi();
mountZodiacDisplay();

