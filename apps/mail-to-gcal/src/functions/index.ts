// Cloud Functions エントリーポイント
// package.json の main フィールドからこのファイルを参照し、両関数を 1 ファイルから登録する。
// ローカル実行時は Node.js 22 native の `--env-file=.env` フラグで環境変数を注入する。
import './processEmail.js';
import './renewWatch.js';
