// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * シナリオテストの設定。
 *
 * ゲームは静的ファイルなので、テスト実行時にローカルサーバを立てて配信する。
 * Python は開発環境に既にあるものを使い、依存を増やさない。
 */
module.exports = defineConfig({
  testDir: '.',
  // 1ファイル内は直列に実行する。テストごとに openGame() でページを開き直して
  // いるのでゲームの状態は共有していないが、同じファイルのテストは盤面の
  // 作り方を共有しており、並べ替えの影響までは読み切れていない
  fullyParallel: false,
  // ファイル単位では並列に走らせる。ファイルは7つあるが4を超えても縮まない
  // （実測: 直列 214秒 → 4並列 117秒 → 7並列 111秒）。
  // ゲームの時計は requestAnimationFrame に乗っているため、CPU を取り合うと
  // 1件ずつが遅くなり（4並列で 1.8 倍）、台数を増やすほど目減りが効いてくる。
  // 一時的に変えたいときは --workers=N で上書きする
  workers: 4,
  // 落ちたときに原因が追えるよう、失敗時だけ痕跡を残す
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8765',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // リポジトリのルートを配信する（tests/ の1つ上）
    command: 'python3 -m http.server 8765 --bind 127.0.0.1 --directory ..',
    url: 'http://127.0.0.1:8765/index.html',
    reuseExistingServer: true,
    timeout: 30 * 1000,
  },
});
