import {mountBuilder} from './builder/ui.mjs?v=tarot-motion-cta-20261015';
import {mountDirectAi} from './ai-direct.mjs?v=gemini-structured-20261015';
import {mountZodiacDisplay} from './zodiac-display.mjs?v=social-title-preserve-20261015';
window.videoConfigurator=mountBuilder(()=>window.videoStudioApi);
mountDirectAi();
mountZodiacDisplay();

