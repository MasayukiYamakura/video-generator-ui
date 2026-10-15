import {mountBuilder} from './builder/ui.mjs?v=json-quotes-20261014';
import {mountDirectAi} from './ai-direct.mjs?v=gemini-structured-20261015';
window.videoConfigurator=mountBuilder(()=>window.videoStudioApi);
mountDirectAi();
