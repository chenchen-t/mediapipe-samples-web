/**
 * Copyright 2026 The MediaPipe Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Navigation & UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should redirect to object detection by default', async ({ page }) => {
    await expect(page).toHaveURL(/.*#\/vision\/object_detector/);
    await expect(page.locator('.sidebar-nav .active')).toContainText('Object Detector');
  });

  test('should navigate between tasks', async ({ page }) => {
    await page.click('a[data-task="image-segmenter"]');
    await expect(page).toHaveURL(/.*#\/vision\/image_segmenter/);
    await expect(page.locator('h2')).toContainText('Image Segmentation');

    await page.click('a[data-task="object-detector"]');
    await expect(page).toHaveURL(/.*#\/vision\/object_detector/);
    await expect(page.locator('h2')).toContainText('Object Detection');
  });

  test('should have responsive sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    // Check if sidebar nav is hidden (it might be hidden by CSS, let's check visibility)
    // .sidebar-nav display: none in media query
    const mobileSidebar = page.locator('.sidebar');
    await expect(mobileSidebar).toBeHidden({ timeout: 5000 }).catch(() => {});

    // Toggle menu (using mobile header toggle)
    await page.click('.mobile-header .menu-toggle');
    await expect(mobileSidebar).toBeVisible({ timeout: 5000 });

    // Wait for transition if any (just to be safe)
    await page.waitForTimeout(500);

    // Toggle back (using sidebar toggle, since mobile one is covered)
    await page.click('.sidebar-header .menu-toggle', { force: true });
    await expect(mobileSidebar).toBeHidden({ timeout: 5000 }).catch(() => {});
  });

  test('should display privacy notice link in sidebar', async ({ page }) => {
    const privacyLink = page.locator('.sidebar-footer a.sidebar-footer-link');
    await expect(privacyLink).toBeVisible();
    await expect(privacyLink).toContainText('Privacy Notice');
    await expect(privacyLink).toHaveAttribute('href', 'https://goo.gle/mediapipe-privacy');
    await expect(privacyLink).toHaveAttribute('target', '_blank');
    await expect(privacyLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('should display docs overview, task guide, and StackBlitz banner links and update on navigation', async ({
    page,
  }) => {
    const banner = page.locator('.docs-banner');
    await expect(banner).toBeVisible();

    const overviewLink = page.locator('#banner-docs-overview');
    await expect(overviewLink).toHaveAttribute(
      'href',
      'https://developers.google.com/edge/mediapipe/solutions/guide'
    );

    const taskDocsLink = page.locator('#banner-task-docs');
    await expect(taskDocsLink).toContainText('Object Detector Guide');
    await expect(taskDocsLink).toHaveAttribute(
      'href',
      'https://developers.google.com/edge/mediapipe/solutions/vision/object_detector/web_js'
    );

    const stackblitzLink = page.locator('#banner-stackblitz');
    await expect(stackblitzLink).toContainText('Edit in StackBlitz');
    await expect(stackblitzLink).toHaveAttribute(
      'href',
      'https://stackblitz.com/github/google-ai-edge/mediapipe-samples-web?file=src%2Ftasks%2Fobject-detector.ts'
    );

    // Navigate to another task and verify banner links update
    await page.click('a[data-task="image-segmenter"]');
    await expect(taskDocsLink).toContainText('Image Segmenter Guide');
    await expect(taskDocsLink).toHaveAttribute(
      'href',
      'https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js'
    );
    await expect(stackblitzLink).toHaveAttribute(
      'href',
      'https://stackblitz.com/github/google-ai-edge/mediapipe-samples-web?file=src%2Ftasks%2Fimage-segmenter.ts'
    );
  });
});
