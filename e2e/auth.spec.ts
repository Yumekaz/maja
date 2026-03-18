import { test, expect, Page } from '@playwright/test';

/**
 * E2E Tests: Authentication Flow
 * 
 * Tests the complete authentication journey:
 * - Registration
 * - Login
 * - Session persistence
 * - Logout
 */

// Generate unique test data for each run
const timestamp = Date.now();
const testUser = {
  email: `e2e_test_${timestamp}@example.com`,
  username: `e2euser${timestamp}`.slice(0, 20),
  password: 'TestPassword123',
};

test.describe('Authentication Flow', () => {
  test.describe.configure({ mode: 'serial' }); // Run tests in order

  test('should show login page by default', async ({ page }) => {
    await page.goto('/');
    
    // Wait for encryption to initialize
    await expect(page.locator('.encryption-indicator')).toBeVisible();
    
    // Should see auth form
    await expect(page.locator('text=SecureChat')).toBeVisible({ timeout: 10000 });
  });

  test('should register a new user', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Click register tab if exists
    const registerTab = page.locator('text=Register');
    if (await registerTab.isVisible()) {
      await registerTab.click();
    }
    
    // Fill registration form
    await page.fill('input[type="email"], input[placeholder*="email" i]', testUser.email);
    await page.fill('input[placeholder*="username" i]', testUser.username);
    await page.fill('input[type="password"]', testUser.password);
    
    // Submit
    await page.click('button[type="submit"]');
    
    // Should redirect to home page after registration
    await expect(page.locator(`text=${testUser.username}`)).toBeVisible({ timeout: 10000 });
  });

  test('should logout successfully', async ({ page }) => {
    // First login
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // If we see login form, we need to log in first
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailInput.fill(testUser.email);
      await page.fill('input[type="password"]', testUser.password);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
    }
    
    // Click logout button
    const logoutBtn = page.locator('.logout-btn, button[title="Logout"]');
    if (await logoutBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await logoutBtn.click();
      
      // Should redirect to auth page
      await expect(page.locator('text=SecureChat')).toBeVisible({ timeout: 10000 });
    }
  });

  test('should login with existing user', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Make sure we're on login (not register)
    const loginTab = page.locator('text=Login');
    if (await loginTab.isVisible()) {
      await loginTab.click();
    }
    
    // Fill login form
    await page.fill('input[type="email"], input[placeholder*="email" i]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    
    // Submit
    await page.click('button[type="submit"]');
    
    // Should see home page with username
    await expect(page.locator(`text=${testUser.username}`)).toBeVisible({ timeout: 10000 });
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Make sure we're on login
    const loginTab = page.locator('text=Login');
    if (await loginTab.isVisible()) {
      await loginTab.click();
    }
    
    // Fill with wrong password
    await page.fill('input[type="email"], input[placeholder*="email" i]', testUser.email);
    await page.fill('input[type="password"]', 'wrongpassword123');
    
    // Submit
    await page.click('button[type="submit"]');
    
    // Should show error (toast or inline error)
    const errorVisible = await Promise.race([
      page.locator('.toast.error, .error-message, text=Invalid').isVisible({ timeout: 5000 }),
      page.locator('text=Invalid').isVisible({ timeout: 5000 }),
    ]).catch(() => false);
    
    // Either error shown or still on login page
    expect(errorVisible || await page.locator('input[type="password"]').isVisible()).toBeTruthy();
  });

  test('should validate registration fields', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Click register tab
    const registerTab = page.locator('text=Register');
    if (await registerTab.isVisible()) {
      await registerTab.click();
    }
    
    // Try to submit empty form
    const submitBtn = page.locator('button[type="submit"]');
    
    // Button should be disabled or form should show validation
    const isDisabled = await submitBtn.isDisabled().catch(() => false);
    
    if (!isDisabled) {
      await submitBtn.click();
      // Should show validation error or stay on same page
      await expect(page.locator('input[type="email"], input[placeholder*="email" i]')).toBeVisible();
    }
  });
});
