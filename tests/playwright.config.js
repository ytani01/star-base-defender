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
  // ゲームの状態を共有するため、1ファイル内は直列に実行する
  fullyParallel: false,
  workers: 1,
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
