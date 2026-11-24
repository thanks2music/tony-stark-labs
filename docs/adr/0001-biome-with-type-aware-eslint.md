# Biome と、型情報を使うルールだけの ESLint を併用する

format と一般的な lint は Biome に任せ、ESLint は typescript-eslint の `recommendedTypeCheckedOnly`（型情報を使うルールだけ）に絞る。Biome は速く設定も 1 つで済むが、型情報を使うルールは typescript-eslint よりかなり少なく、代表的な `noFloatingPromises` でも typescript-eslint の約 75% しか検出できない（[Biome v2](https://biomejs.dev/blog/biome-v2/)）。Workers では `ctx.waitUntil` の付け忘れのような floating promise を見逃せないため、型情報を使うルールは ESLint に残した。この 2 段の構成は、typescript-eslint が native-speed の linter と併用する方法として案内している「dual linting」と同じ（[FAQ](https://typescript-eslint.io/troubleshooting/faqs/general/#how-does-typescript-eslint-compare-to-native-speed-linters)）。

## Considered Options

- **Biome だけ**: 型情報を使うルールが足りない（上記）
- **ESLint + Prettier（従来）**: 動くが、ツールが 2 つで設定も 2 系統あり、format と一般的な lint が遅い。Biome 2.6 から Markdown と YAML も format できるので、Prettier を残す理由がなくなった

## Consequences

- 2 つのツールのルールが重ならないよう、ESLint 側に型情報を使わないルールを足さない。型情報を使わないルールは Biome の設定（`biome.json`）で有効にする
- コミット前のフック（lint-staged）と CI は、両方を実行する（`bun run check` が Biome、`bun run lint` が ESLint）
