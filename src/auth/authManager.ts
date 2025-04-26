import {Browser, BrowserContext, chromium, Cookie, Page} from 'playwright';
import {CookieManager} from './cookieManager';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import logger from '../utils/logger';

dotenv.config();

export class AuthManager {
  private browser: Browser | null;
  private context: BrowserContext | null;
  private page: Page | null;
  private cookieManager: CookieManager;

  constructor(cookiePath?: string) {
    logger.info('Initializing AuthManager');
    this.browser = null;
    this.context = null;
    this.page = null;

    // Set default cookie path to ~/.mcp/rednote/cookies.json
    if (!cookiePath) {
      const homeDir = os.homedir();
      const mcpDir = path.join(homeDir, '.mcp');
      const rednoteDir = path.join(mcpDir, 'rednote');

      // Create directories if they don't exist
      if (!fs.existsSync(mcpDir)) {
        logger.info(`Creating directory: ${mcpDir}`);
        fs.mkdirSync(mcpDir);
      }
      if (!fs.existsSync(rednoteDir)) {
        logger.info(`Creating directory: ${rednoteDir}`);
        fs.mkdirSync(rednoteDir);
      }

      cookiePath = path.join(rednoteDir, 'cookies.json');
    }

    logger.info(`Using cookie path: ${cookiePath}`);
    this.cookieManager = new CookieManager(cookiePath);
  }

  async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      logger.info('Launching browser');
      this.browser = await chromium.launch({
        headless: false,
      });
    }
    return this.browser;
  }

  async getCookies(): Promise<Cookie[]> {
    logger.info('Loading cookies');
    return await this.cookieManager.loadCookies();
  }

  async login(timeout: number = 60000): Promise<void> {
    logger.info(`Starting login process with timeout: ${timeout}ms`);
    this.browser = await chromium.launch({headless: false});
    if (!this.browser) {
      logger.error('Failed to launch browser');
      throw new Error('Failed to launch browser');
    }

    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        logger.info(`Login attempt ${retryCount + 1}/${maxRetries}`);
        this.context = await this.browser.newContext();
        this.page = await this.context.newPage();

        // Load existing cookies if available
        const cookies = await this.cookieManager.loadCookies();
        if (cookies && cookies.length > 0) {
          logger.info(`Loaded ${cookies.length} existing cookies`);
          await this.context.addCookies(cookies);
        }

        // Navigate to explore page
        logger.info('Navigating to explore page');
        await this.page.goto('https://www.xiaohongshu.com/explore', {
          waitUntil: 'domcontentloaded',
          timeout: Math.min(10000, timeout / 3) // 不超过timeout的1/3
        });

        // Check if already logged in
        const userSidebar = await this.page.$('.user.side-bar-component .channel');
        if (userSidebar) {
          const isLoggedIn = await this.page.evaluate(() => {
            const sidebarUser = document.querySelector('.user.side-bar-component .channel');
            return sidebarUser?.textContent?.trim() === '我';
          });

          if (isLoggedIn) {
            logger.info('Already logged in');
            // Already logged in, save cookies and return
            const newCookies = await this.context.cookies();
            await this.cookieManager.saveCookies(newCookies);
            return;
          }
        }

        logger.info('Waiting for login dialog');
        // Wait for login dialog if not logged in
        try {
          await this.page.waitForSelector('.login-container', {
            timeout: Math.min(10000, timeout / 3) // 不超过timeout的1/3
          });
        } catch (error: any) {
          throw new Error(`登录对话框加载超时 (${Math.min(10000, timeout / 3)}ms): ${error.message}`);
        }

        // Wait for QR code image
        logger.info('Waiting for QR code');
        try {
          const qrCodeImage = await this.page.waitForSelector('.qrcode-img', {
            timeout: Math.min(10000, timeout / 3) // 不超过timeout的1/3
          });
        } catch (error: any) {
          throw new Error(`二维码加载超时 (${Math.min(10000, timeout / 3)}ms): ${error.message}`);
        }

        // Wait for user to complete login
        logger.info('Waiting for user to complete login');
        try {
          await this.page.waitForSelector('.user.side-bar-component .channel', {
            timeout: timeout // 允许用户登录的时间较长
          });
        } catch (error: any) {
          throw new Error(`等待用户登录超时 (${timeout}ms): ${error.message}`);
        }

        // Verify the text content
        const isLoggedIn = await this.page.evaluate(() => {
          const sidebarUser = document.querySelector('.user.side-bar-component .channel');
          return sidebarUser?.textContent?.trim() === '我';
        });

        if (!isLoggedIn) {
          logger.error('Login verification failed');
          throw new Error('Login verification failed');
        }

        logger.info('Login successful, saving cookies');
        // Save cookies after successful login
        const newCookies = await this.context.cookies();
        await this.cookieManager.saveCookies(newCookies);
        return;
      } catch (error: any) {
        logger.error(`Login attempt ${retryCount + 1} failed:`, error);
        // Clean up current session
        if (this.page) await this.page.close();
        if (this.context) await this.context.close();

        retryCount++;
        if (retryCount < maxRetries) {
          logger.info(`Retrying login in 2 seconds (${retryCount}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          logger.error('Login failed after maximum retries');
          throw new Error(`登录失败，已达到最大重试次数 (${maxRetries}): ${error.message}`);
        }
      }
    }
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up browser resources');
    if (this.page) await this.page.close();
    if (this.context) await this.context.close();
    this.page = null;
    this.context = null;
    this.browser = null;
  }
}
