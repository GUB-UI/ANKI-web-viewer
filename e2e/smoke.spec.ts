import { expect, test } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const apkg = path.join(__dirname, 'fixtures/sample.apkg')
const modernApkg = path.join(__dirname, 'fixtures/sample-modern.apkg')

test.describe('Kioku MVP smoke', () => {
  test('import → study → custom → settings', async ({ page }) => {
    await page.goto('./')
    await expect(page.getByText('Kioku')).toBeVisible()
    await expect(page.getByText('デッキがありません')).toBeVisible()

    await page.getByRole('link', { name: 'インポート' }).click()
    await expect(page.getByRole('heading', { name: 'Import' })).toBeVisible()

    await page.locator('input[type="file"]').setInputFiles(apkg)
    await expect(page.getByText('Import完了')).toBeVisible({ timeout: 30000 })
    await page.getByRole('button', { name: 'デッキを見る' }).click()

    await expect(page.getByText('英語')).toBeVisible()
    await expect(page.getByText('Default')).toHaveCount(0)

    // Parent deck menu → study (includes all descendants)
    await page.getByRole('button', { name: 'メニュー' }).first().click()
    await page.getByRole('button', { name: '学習開始' }).click()

    await expect(page.getByRole('button', { name: '答えを見る' })).toBeVisible()
    await page.getByRole('button', { name: '答えを見る' }).click()
    await expect(page.locator('.rating-btn')).toHaveText([
      /Hard/,
      /Again/,
      /Good/,
      /Easy/,
    ])
    const dueBefore = await page.locator('.rating-btn.good small').textContent()
    expect(dueBefore).toBeTruthy()
    await page.getByRole('button', { name: /Good/ }).click()
    await expect(
      page
        .getByRole('button', { name: '答えを見る' })
        .or(page.getByRole('heading', { name: '完了' })),
    ).toBeVisible()

    await page.getByRole('link', { name: '戻る' }).click()
    await expect(page.getByText('英語')).toBeVisible()
    await expect(page.getByRole('heading', { name: '今日の単語' })).toBeVisible()
    await expect(page.getByRole('button', { name: '.md をダウンロード' })).toBeVisible()
    await expect(page.getByText('今日 · 勉強時間')).toBeVisible()

    await page.getByRole('button', { name: 'メニュー' }).first().click()
    await page.getByRole('button', { name: 'カスタム学習' }).click()
    await expect(page.getByRole('heading', { name: 'カスタム学習' })).toBeVisible()
    // sample fixture has one Again in revlog for card in Section1 under 英語
    await expect(page.getByText(/対象/)).toBeVisible()
    const failedLabel = page.locator('p', { hasText: '対象' })
    await expect(failedLabel).toContainText(/[1-9]/)

    await page.getByRole('button', { name: '復習する' }).click()
    await expect(page.getByRole('heading', { name: '補強復習' })).toBeVisible()
    await page.getByRole('button', { name: '答えを見る' }).click()
    await page.getByRole('button', { name: /Good/ }).click()
    await expect(page.getByRole('heading', { name: '完了' })).toBeVisible()
    await expect(
      page.getByText('補強復習はスケジュールを変更していません。'),
    ).toBeVisible()

    await page.getByRole('link', { name: 'デッキへ戻る' }).click()
    await page.getByRole('link', { name: '設定' }).click()
    await expect(page.getByRole('heading', { name: '設定' })).toBeVisible()
    await expect(page.getByLabel('カードの音量')).toBeVisible()
    await expect(page.getByRole('button', { name: 'バックアップを書き出す' })).toBeVisible()
  })

  test('imports the real collection.anki21b from a modern package', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('link', { name: 'インポート' }).click()
    await page.locator('input[type="file"]').setInputFiles(modernApkg)
    await expect(page.getByText('Import完了')).toBeVisible({ timeout: 30000 })
    await expect(page.getByText('6', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'デッキを見る' }).click()
    await expect(page.getByText('英語')).toBeVisible()
    await expect(page.getByText(/newer version of Anki/i)).toHaveCount(0)
    await expect(page.getByText('Default')).toHaveCount(0)
  })

  test('reloads and imports a deck with the network offline', async ({
    page,
    context,
  }) => {
    await page.goto('./')
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await page.reload()
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByText('Kioku')).toBeVisible()
    await page.getByRole('link', { name: 'インポート' }).click()
    await page.locator('input[type="file"]').setInputFiles(apkg)
    await expect(page.getByText('Import完了')).toBeVisible({ timeout: 30000 })
  })

  test('auto-flips after the configured countdown', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('link', { name: 'インポート' }).click()
    await page.locator('input[type="file"]').setInputFiles(apkg)
    await expect(page.getByText('Import完了')).toBeVisible({ timeout: 30000 })
    await page.getByRole('button', { name: 'デッキを見る' }).click()

    await page.getByRole('link', { name: '設定' }).click()
    const autoFlipRow = page
      .locator('.row-between')
      .filter({ hasText: '自動で答えを表示' })
    await autoFlipRow.locator('select').selectOption('on')
    await page.locator('#auto-flip-seconds').fill('1')
    await page.getByRole('link', { name: '戻る' }).click()

    await page.getByRole('button', { name: 'メニュー' }).first().click()
    await page.getByRole('button', { name: '学習開始' }).click()
    await expect(page.locator('.auto-flip-countdown')).toBeVisible()
    await expect(page.locator('.rating-dock')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('.rating-btn').first()).toBeDisabled()
    await expect(page.locator('.rating-btn').first()).toBeEnabled({ timeout: 1500 })
  })

  test('stats page counts a review in Today', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('link', { name: '統計' }).click()
    await expect(page.getByRole('heading', { name: '統計' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '今日' })).toBeVisible()

    await page.getByRole('link', { name: '戻る' }).click()
    await page.getByRole('link', { name: 'インポート' }).click()
    await page.locator('input[type="file"]').setInputFiles(apkg)
    await expect(page.getByText('Import完了')).toBeVisible({ timeout: 30000 })
    await page.getByRole('button', { name: 'デッキを見る' }).click()

    await page.getByRole('button', { name: 'メニュー' }).first().click()
    await page.getByRole('button', { name: '学習開始' }).click()
    await page.getByRole('button', { name: '答えを見る' }).click()
    await page.getByRole('button', { name: /Good/ }).click()
    await expect(
      page
        .getByRole('button', { name: '答えを見る' })
        .or(page.getByRole('heading', { name: '完了' })),
    ).toBeVisible()

    await page.getByRole('link', { name: '戻る' }).click()
    await page.getByRole('link', { name: '統計' }).click()
    await expect(page.getByText(/[1-9]\s*回/)).toBeVisible()
  })
})
