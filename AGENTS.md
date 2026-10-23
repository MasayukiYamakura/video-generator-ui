# 公開UIの編集について

このディレクトリの編集元は非公開の[video-generator](https://github.com/MasayukiYamakura/video-generator)内の`tools/pages-ui/`です。
生成側の[AGENTS.md](https://github.com/MasayukiYamakura/video-generator/blob/main/AGENTS.md)と[文書索引](https://github.com/MasayukiYamakura/video-generator/blob/main/docs/INDEX.md)を読んでから変更してください。
公開リポジトリへ直接加えた修正は同期時に戻るため、恒久的な修正は生成側で行います。
反映には生成側の許可リストと書出しスクリプトを使います。素材・設定JSON・トークン・開発依存を公開しません。

## ダンス専用画面の例外

公開サイトの`dance/`配下だけは、非公開`chibi-dance-generator`の`tools/dance-ui/`が編集元です。この公開処理でdance/を削除・上書きしません。V-Generator本体の制作・投稿データは共有しません。
