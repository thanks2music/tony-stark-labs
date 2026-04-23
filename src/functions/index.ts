import "dotenv/config";

// Cloud Functions エントリーポイント
// package.json の main フィールドからこのファイルを参照し、
// 両関数を1ファイルから登録する
import "./processEmail.js";
import "./renewWatch.js";
