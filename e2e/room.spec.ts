import { test, expect, Page, BrowserContext } from '@playwright/test';

/**
 * E2E Tests: Room & Messaging Flow
 * 
 * Tests the complete chat experience:
 * - Create room
 * - Send encrypted messages
 * - File upload (encrypted)
 * - Room info display
 * - Leave room
 */

const timestamp = Date.now();
const testUser = {
  email: `e2e_room_${timestamp}@example.com`,
  username: `roomuser${timestamp}`.slice(0, 20),
  password: 'TestPassword123',
};

// Helper to register and login
async function registerAndLogin(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  
  // Check if already logged in
  const createRoomBtn = page.locator('text=Create Room');
  if (await createRoomBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    return; // Already logged in
  }
  
  // Click register tab
  const registerTab = page.locator('text=Register');
  if (await registerTab.isVisible()) {
    await registerTab.click();
  }
  
  // Fill registration form
  const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
  await emailInput.fill(testUser.email);
  await page.fill('input[placeholder*="username" i]', testUser.username);
  await page.fill('input[type="password"]', testUser.password);
  
  // Submit
  await page.click('button[type="submit"]');
  
  // Wait for home page
  await expect(page.locator('text=Create Room')).toBeVisible({ timeout: 15000 });
}

test.describe('Room & Messaging Flow', () => {
  test.describe.configure({ mode: 'serial' });
  
  let roomCode: string;

  test('should create a new encrypted room', async ({ page }) => {
    await registerAndLogin(page);
    
    // Click create room
    await page.click('text=Create Room');
    
    // Should show room page with room code
    await expect(page.locator('.room-header, .room-container')).toBeVisible({ timeout: 10000 });
    
    // Get room code from URL or UI
    const roomHeader = page.locator('text=Room').first();
    await expect(roomHeader).toBeVisible();
    
    // Store room code for later tests
    const roomText = await page.locator('.room-title-section h3, h3:has-text("Room")').textContent();
    const match = roomText?.match(/[A-Z0-9]{6}/);
    if (match) {
      roomCode = match[0];
      console.log('Created room:', roomCode);
    }
  });

  test('should display encryption info', async ({ page }) => {
    await registerAndLogin(page);
    
    // Create a room if needed
    const roomHeader = page.locator('.room-header');
    if (!await roomHeader.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.click('text=Create Room');
      await expect(page.locator('.room-header')).toBeVisible({ timeout: 10000 });
    }
    
    // Click info button
    const infoBtn = page.locator('button[title="Room Info"], .btn-icon').first();
    await infoBtn.click();
    
    // Should show encryption info
    await expect(page.locator('text=AES-256-GCM')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=ECDH')).toBeVisible();
  });

  test('should send and receive encrypted messages', async ({ page }) => {
    await registerAndLogin(page);
    
    // Create or enter room
    const roomHeader = page.locator('.room-header');
    if (!await roomHeader.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.click('text=Create Room');
      await expect(page.locator('.room-header')).toBeVisible({ timeout: 10000 });
    }
    
    // Type message
    const messageInput = page.locator('.message-input, input[placeholder*="message" i]');
    await messageInput.fill('Hello, this is an encrypted test message!');
    
    // Send message
    await page.click('.btn-send, button[type="submit"]');
    
    // Message should appear in chat
    await expect(page.locator('text=Hello, this is an encrypted test message!')).toBeVisible({ timeout: 5000 });
    
    // Should show decrypted badge
    await expect(page.locator('.encrypted-badge, text=🔓')).toBeVisible();
  });

  test('should show encryption banner', async ({ page }) => {
    await registerAndLogin(page);
    
    // Create or enter room
    const roomHeader = page.locator('.room-header');
    if (!await roomHeader.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.click('text=Create Room');
      await expect(page.locator('.room-header')).toBeVisible({ timeout: 10000 });
    }
    
    // Should see encryption banner
    await expect(page.locator('text=end-to-end encrypted')).toBeVisible();
  });

  test('should display QR code for mobile joining', async ({ page }) => {
    await registerAndLogin(page);
    
    // Create or enter room
    const roomHeader = page.locator('.room-header');
    if (!await roomHeader.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.click('text=Create Room');
      await expect(page.locator('.room-header')).toBeVisible({ timeout: 10000 });
    }
    
    // Click info button
    const infoBtn = page.locator('button[title="Room Info"], .btn-icon').first();
    await infoBtn.click();
    
    // Should show QR code
    await expect(page.locator('canvas')).toBeVisible({ timeout: 5000 });
  });

  test('should show members panel', async ({ page }) => {
    await registerAndLogin(page);
    
    // Create or enter room
    const roomHeader = page.locator('.room-header');
    if (!await roomHeader.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.click('text=Create Room');
      await expect(page.locator('.room-header')).toBeVisible({ timeout: 10000 });
    }
    
    // Click members button
    const membersBtn = page.locator('button[title="Members"]');
    await membersBtn.click();
    
    // Should show members panel with current user
    await expect(page.locator('.members-panel, .members-list')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=You')).toBeVisible();
  });

  test('should confirm before leaving room as owner', async ({ page }) => {
    await registerAndLogin(page);
    
    // Create or enter room
    const roomHeader = page.locator('.room-header');
    if (!await roomHeader.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.click('text=Create Room');
      await expect(page.locator('.room-header')).toBeVisible({ timeout: 10000 });
    }
    
    // Click leave button
    const leaveBtn = page.locator('.btn-leave, button[title*="Leave"], button[title*="Close"]');
    await leaveBtn.click();
    
    // Should show confirmation modal
    await expect(page.locator('.modal, .confirm-modal, text=Close Room')).toBeVisible({ timeout: 5000 });
    
    // Cancel for now
    const cancelBtn = page.locator('text=Cancel');
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    }
  });

  test('should leave room and return to home', async ({ page }) => {
    await registerAndLogin(page);
    
    // Create a room
    await page.click('text=Create Room');
    await expect(page.locator('.room-header')).toBeVisible({ timeout: 10000 });
    
    // Click leave button
    const leaveBtn = page.locator('.btn-leave, button[title*="Leave"], button[title*="Close"]');
    await leaveBtn.click();
    
    // Confirm leave
    const confirmBtn = page.locator('button:has-text("Close Room"), button:has-text("Leave")').first();
    await confirmBtn.click();
    
    // Should return to home
    await expect(page.locator('text=Create Room')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Join Room Flow', () => {
  test('should show join room form', async ({ page }) => {
    // Register a user
    const user = {
      email: `join_test_${Date.now()}@example.com`,
      username: `joinuser${Date.now()}`.slice(0, 20),
      password: 'TestPassword123',
    };
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Register
    const registerTab = page.locator('text=Register');
    if (await registerTab.isVisible()) {
      await registerTab.click();
    }
    
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
    await emailInput.fill(user.email);
    await page.fill('input[placeholder*="username" i]', user.username);
    await page.fill('input[type="password"]', user.password);
    await page.click('button[type="submit"]');
    
    // Wait for home
    await expect(page.locator('text=Create Room')).toBeVisible({ timeout: 15000 });
    
    // Click join room
    await page.click('text=Join Room');
    
    // Should show code input
    await expect(page.locator('.code-input, input[placeholder*="XXXX" i]')).toBeVisible({ timeout: 5000 });
  });

  test('should validate room code format', async ({ page }) => {
    const user = {
      email: `validate_test_${Date.now()}@example.com`,
      username: `valuser${Date.now()}`.slice(0, 20),
      password: 'TestPassword123',
    };
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Register
    const registerTab = page.locator('text=Register');
    if (await registerTab.isVisible()) {
      await registerTab.click();
    }
    
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
    await emailInput.fill(user.email);
    await page.fill('input[placeholder*="username" i]', user.username);
    await page.fill('input[type="password"]', user.password);
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Create Room')).toBeVisible({ timeout: 15000 });
    
    // Click join room
    await page.click('text=Join Room');
    
    // Enter invalid code (less than 6 chars)
    const codeInput = page.locator('.code-input, input[placeholder*="XXXX" i]');
    await codeInput.fill('ABC');
    
    // Submit button should be disabled
    const submitBtn = page.locator('button:has-text("Join"), button[type="submit"]').last();
    await expect(submitBtn).toBeDisabled();
    
    // Enter valid length code
    await codeInput.fill('ABCDEF');
    await expect(submitBtn).toBeEnabled();
  });
});
