import {fixedSettings, availableCategories} from './compiler.mjs?v=hook-ratio-20261009';

const COMMON = [
  '以下の台本から動画生成用のJSONを作ってください。Gemini / ChatGPT共通の指示です。',
  '【共通ルール】',
  'ナレーション原稿が読み上げ内容の唯一のマスター。意味のまとまりごとにsceneへ分割する。原稿内容は変更・要約・言い換えしない。字幕装飾[[ ]]のみ必要に応じ追加可能。speech_textは原則出力しない。字幕と読み上げを意図的に変える明示指示がある場合だけspeech_textを使う。',
  'JSONのみ出力。説明、Markdown、コードフェンス、コメント、末尾カンマは禁止。',
  '台本の言葉を言い換え・要約・追加しない。全シーンのtextを順番につなげると元のナレーション原稿と同じ内容になるようにし、冒頭も空にしない。',
  '意味のまとまりでシーン分割。字幕の秒数start_time/end_timeは出力しない（選択したナレーション音声で自動照合）。',
  '制作者が指定した改行は、JSON文字列内で改行エスケープ \\n として維持する。JSONを解析すると実際の改行になるようにし、バックスラッシュを二重にして文字として表示させない。',
  'textは録音照合・通常字幕用、hook_textは冒頭タイトルの表示用。タイトルの改行指定をtextだけに入れてはいけない。必ず表示対象のhook_textに入れる。指定された行数・各行の文言・改行位置を保持し、1行への連結・別位置への改行・短縮・装飾の追加をしない。',
  '本人映像の明示指示がある場合のみ、media_type:local、指定されたファイル名media_query、text:""、開始・終了秒、media_startを記録する。',
];
export function buildPrompt(config, transcript='', bgmCatalog=null, output='full') {
  const {video:v,layout:l,ai}=config, settings=fixedSettings(config);
  const rules=[...COMMON,
    `【動画設定】\n${v.format} / ${v.template}。字幕は1シーン${v.format==='vertical'?'20〜24':'30'}文字程度。`,
    `冒頭は最初の${v.intro_scenes}シーン。フック${v.hook_enabled?'ON':'OFF'}・${v.hook_orientation==='horizontal'?'横書き':'縦書き'}。`,
    `冒頭: 字幕=${v.intro_caption}, タグ=${v.intro_tags}, 波形=${v.intro_visualizer}。本編: 字幕=${v.body_caption}, タグ=${v.body_tags}, 波形=${v.body_visualizer}。`,
    'Pexels動画が取得できたシーンは波形非表示。portrait_brandのPexels/Pixabay動画ではタグ非表示（レンダラーの既存動作）。',
    `背景=${v.background_mode}。${v.background_mode==='stock'?'全字幕シーンに動画素材。':v.background_mode==='mixed'?(ai.stock_scenes==='manual'?'人物画像を基本に手動指定のシーンだけ動画素材。':`人物画像を基本に全シーン数の約${ai.stock_percent}%を動画素材にする。目標シーン数は全シーン数×${ai.stock_percent}/100を四捨五入する。0%は動画なし、100%は全編動画。割合を優先し、可能な範囲で動画シーンを分散させる。`):'全字幕シーンに固定画像。素材検索は不要。'}`,
    `素材提供元=${v.stock_provider}。${v.format==='vertical'?'縦向き優先。':''}`,
    v.template==='portrait_brand'?'フック・字幕は明朝体、白文字・黒縁・影。[[ ]]の強調色を使わない。タグは占い／コーチング／引き寄せ。':'強調は最大1箇所・2〜8文字を[[ ]]で囲む。不要なら省略。',
    `位置は制作者が確定済み。右${Math.round(l.safe_right*100)}%・下${Math.round(l.safe_bottom*100)}%のガイドはプレビュー専用。AIは座標・サイズを変更しない。`,
    '【AI判断ルール】',
    '人間の手動指定 > レイアウトプリセット > 動画プリセット > AI判断 > デフォルト。AIは確定設定を上書きしない。',
    'シーン分割はAIが判断。ただし指定済みの冒頭タイトルを1つのフックシーン内に保持し、タイトルの改行を別シーンへの分割として扱わない。',
    v.hook_enabled ? (ai.hook==='manual'?`手動hook_text（最優先）=${JSON.stringify(ai.manual_hook)}。複数フックシーンは改行---改行で区切る。各タイトル内部の改行はそのまま保持する。textからの抜き出しルール・文字数目安より手動指定を優先し、録音用textは手動タイトルで置き換えない。`:`タイトルの文言・改行が指定されていればhook_textに完全一致で反映する。指定がない場合だけ、同じシーンのtextから言い換えずに抜き出して${v.hook_orientation==='vertical'?'4〜7文字程度':'短いタイトル1文'}にする。本編にhook_textを付けない。`) : 'hook_textを出力しない。',
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
  else if(v.voice_mode==='tts') rules.push('互換モード: {"global_settings":上記確定設定,"scenes":[...]}。audio_fileは不要。BGM AI選択時のみbgm.category、横型AIテーマ時のみtheme.titleを補完。');
  else rules.push('互換モード: {"audio_file":"新規録音.m4a","global_settings":上記確定設定,"scenes":[...]}。BGM AI選択時のみbgm.category、横型AIテーマ時のみtheme.titleを補完。');
  rules.push('各シーンにはtext、必要ならhook_text、caption_enabled、category_tags、visualizer、動画使用時のみmedia_type/media_query。字幕なし本人映像以外に秒数を書かない。',
    '出力前に確認: 指定タイトルの各行をhook_textの改行で再現できるか。textだけに改行がありhook_textが1行になっていたら修正する。手動タイトルはJSON解析後の文字列が指定値と一致すること。BGMの有効無効・曲・音量・ダッキングを確定設定から変更しない。',
    '返答を画面へ貼り「画面設定をJSONへ適用」で確認。システムは確定値を保持し、許可した内容だけ採用する。',
    '【ナレーション原稿（処理対象の文章）】',transcript||'（ここにナレーション原稿を貼る）');
  return rules.join('\n\n');
}


