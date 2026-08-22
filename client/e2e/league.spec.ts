import { expect, test } from '@playwright/test';

async function login(page: import('@playwright/test').Page, username: string, password: string) {
  await page.goto('/');
  await page.getByLabel('שם משתמש').fill(username);
  await page.getByLabel('סיסמה').fill(password);
  await page.getByRole('button', { name: /כניסה למגרש/ }).click();
  await expect(page.getByText('טבלת הליגה')).toBeVisible({ timeout: 15_000 });
}

test('a new player joins with the invite code and appears in the league', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('קוד כניסה לליגה').fill('E2ECODE1');
  await page.getByLabel(/שם משתמש/).fill('e2euser');
  await page.getByLabel(/שם תצוגה/).fill('שחקן בדיקה');
  await page.getByLabel('מספר נייד').fill('052-9998877');
  await page.getByLabel(/סיסמה/).fill('secret123');
  await page.getByRole('button', { name: /יאללה/ }).click();

  await expect(page.getByText('טבלת הליגה')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('שחקן בדיקה').first()).toBeVisible();
});

test('the demo league renders every core screen', async ({ page }) => {
  await login(page, 'avi', 'demo123');

  // Home: podium + locked active round
  await expect(page.getByText('מחזור 2')).toBeVisible();

  // Predictions: locked → comparison view shows other players' predictions
  await page.goto('/predictions');
  await expect(page.getByText('הניחושים של כולם').first()).toBeVisible();
  await expect(page.getByText('דרור').first()).toBeVisible();

  // Live: if-ended-now table
  await page.goto('/live');
  await expect(page.getByText('אם המשחקים היו נגמרים עכשיו…')).toBeVisible();

  // History: closed round 1 with a drill-down
  await page.goto('/history');
  await page.locator('a[href^="/history/"]').first().click();
  await expect(page.getByText('סיכום הנקודות')).toBeVisible();
  await expect(page.getByText('המשחקים והניחושים')).toBeVisible();

  // Player stats
  await page.goto('/profile');
  await page.getByText('לסטטיסטיקות שלי').click();
  await expect(page.getByText('אחוז הצלחה')).toBeVisible();
});

test('a regular user cannot see the admin panel', async ({ page }) => {
  await login(page, 'yossi', 'demo123');
  await page.goto('/admin');
  await expect(page.getByText('טבלת הליגה')).toBeVisible(); // redirected home
});

test('the admin enters a final result from the panel', async ({ page }) => {
  await login(page, 'dror', 'demo123');
  await page.goto('/admin/fixtures');
  await expect(page.getByText('הוספת משחק למחזור')).toBeVisible();

  await page.getByRole('button', { name: '✅ תוצאה' }).first().click();
  await page.getByLabel('בית').fill('3');
  await page.getByLabel('חוץ').fill('1');
  await page.getByRole('button', { name: 'שמירת תוצאה' }).click();

  await expect(page.getByText('✅ הסתיים').first()).toBeVisible({ timeout: 15_000 });
});
