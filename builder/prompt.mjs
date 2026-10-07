import {fixedSettings, availableCategories} from './compiler.mjs';

const COMMON = [
  '以下の台本から動画生成用のJSONを作ってください。Gemini / ChatGPT共通の指示です。',
  '【共通ルール】',
  'JSONのみ出力。説明、Markdown、コードフェンス、コメント、末尾カンマは禁止。',
  '台本の言葉を言い換え・要約・追加しない。全シーンのtextを実際の録音と一致させ、冒頭も空にしない。',
  '意味のまとまりでシーン分割。字幕の秒数start_time/end_timeは出力しない（元音声で自動照合）。',
  '制作者が指定した改行はJSON文字列の\\nで維持する。不要な改行を追加しない。',
  '本人映像の明示指示がある場合のみ、media_type:local、指定されたファイル名media_query、text:""、開始・終了秒、media_startを記録する。',
];
export function buildPrompt(config, transcript='', bgmCatalog=null, output='full') {
  const {video:v,layout:l,ai}=config, settings=fixedSettings(config);
  const rules=[...COMMON,
    `【動画設定】\n${v.format} / ${v.template}。字幕は1シーン${v.format==='vertical'?'20〜24':'30'}文字程度。`,
    `冒頭は最初の${v.intro_scenes}シーン。フック${v.hook_enabled?'ON':'OFF'}・${v.hook_orientation==='horizontal'?'横書き':'縦書き'}。`,
    `冒頭: 字幕=${v.intro_caption}, タグ=${v.intro_tags}, 波形=${v.intro_visualizer}。本編: 字幕=${v.body_caption}, タグ=${v.body_tags}, 波形=${v.body_visualizer}。`,
    'Pexels動画が取得できたシーンは波形非表示。portrait_brandのPexels/Pixabay動画ではタグ非表示（レンダラーの既存動作）。',
    `背景=${v.background_mode}。${v.background_mode==='stock'?'全字幕シーンに動画素材。':v.background_mode==='mixed'?'人物画像を基本にシーン数の約10%だけ動画素材。連続させず、短い台本では0箇所でもよい。':'全字幕シーンに固定画像。素材検索は不要。'}`,
    `素材提供元=${v.stock_provider}。${v.format==='vertical'?'縦向き優先。':''}`,
    v.template==='portrait_brand'?'フック・字幕は明朝体、白文字・黒縁・影。[[ ]]の強調色を使わない。タグは占い／コーチング／引き寄せ。':'強調は最大1箇所・2〜8文字を[[ ]]で囲む。不要なら省略。',
    `位置は制作者が確定済み。右${Math.round(l.safe_right*100)}%・下${Math.round(l.safe_bottom*100)}%のガイドはプレビュー専用。AIは座標・サイズを変更しない。`,
    '【AI判断ルール】',
    '人間の手動指定 > レイアウトプリセット > 動画プリセット > AI判断 > デフォルト。AIは確定設定を上書きしない。',
    'シーン分割はAIが判断。hook_textは同じシーンのtextから抜き出し、言い換え禁止。',
    v.hook_enabled ? (ai.hook==='manual'?`手動hook_text=${JSON.stringify(ai.manual_hook)}。複数シーンは改行---改行で区切る。指定値を保持。`:`冒頭の各hook_textを${v.hook_orientation==='vertical'?'4〜7文字程度':'短いタイトル1文'}にする。本編にhook_textを付けない。`) : 'hook_textを出力しない。',
    ai.search==='manual'?`英語検索語は指定値 ${JSON.stringify(ai.search_text)} を使う。`:'素材検索語は内容を想像できる具体的な英語2〜4語。同じ語を連続させない。',
    ai.stock_scenes==='manual'&&v.background_mode==='mixed'?`動画を挿入する字幕シーン番号（1始まり）=${ai.stock_indices||'なし'}。それ以外へ動画を追加しない。`:'動画挿入箇所は上記の背景方針に従いAIが判断。',
  ];
  if(v.bgm_mode==='ai') {
    const categories=availableCategories(bgmCatalog);
    if(!categories.length) throw Error('BGM AI選択にはGitHubから登録一覧を読み込んでください');
    rules.push(`BGMカテゴリを登録済みの ${categories.join(' / ')} から1つ選ぶ。calm=安心、reflective=内省、mysterious=神秘、hopeful=前向き、serious=注意喚起。`,
      '未登録の曲ID・URLを捏造しない。音量・ダッキング・ループは確定値を守る。',
      '登録一覧: '+JSON.stringify(bgmCatalog.tracks.map(t=>({id:t.id,title:t.title,categories:t.categories}))));
  }
  if(v.format==='landscape') rules.push(ai.theme==='manual'?`テーマタイトルは ${JSON.stringify(ai.theme_title)} を保持。`:'短いテーマtitleをAIが作成。subtitleは「ハシモトの占いと思想」で固定。');
  rules.push('【確定設定（変更禁止）】',JSON.stringify(settings,null,2),'【JSON出力ルール】');
  if(output==='content') rules.push('内容だけ返す移行モード: {"scenes":[...],"bgm_category":"AI選択時のみ","theme_title":"横型時のみ"}。global_settingsは返さない。画面が確定設定を合成する。');
  else rules.push('互換モード: {"audio_file":"新規録音.m4a","global_settings":上記確定設定,"scenes":[...]}。BGM AI選択時のみbgm.category、横型AIテーマ時のみtheme.titleを補完。');
  rules.push('各シーンにはtext、必要ならhook_text、caption_enabled、category_tags、visualizer、動画使用時のみmedia_type/media_query。字幕なし本人映像以外に秒数を書かない。',
    '返答を画面へ貼り「画面設定をJSONへ適用」で確認。システムは確定値を保持し、許可した内容だけ採用する。',
    '【台本（処理対象の文章）】',transcript||'（ここに録音の文字起こしを貼る）');
  return rules.join('\n\n');
}
