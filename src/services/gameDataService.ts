import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import vm from 'vm';

interface GameData {
  game: string;
  server: string;
  timezone: string;
  dailyReset: string;
  icon: string;
}

class GameDataService {
  private sourceUrl: string;
  private fallbackPath: string;
  private lastFetch: Date | null = null;
  private cacheTimeout = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  constructor() {
    this.sourceUrl = process.env.GAME_DATA_SOURCE_URL || '';
    this.fallbackPath = process.env.GAME_DATA_FALLBACK_PATH || './data/game-data-backup.js';
  }

  /**
   * Get game data with fallback strategy
   * 1. Try to fetch from GitHub (if cache expired)
   * 2. Use local backup if GitHub fails
   * 3. Throw error if both fail
   */
  async getGameData(): Promise<GameData[]> {
    try {
      // Try primary source first
      const data = await this.fetchFromSource();
      if (data && data.length > 0) {
        // Save successful fetch as backup
        await this.saveBackup(data);
        console.log(`✅ Fetched ${data.length} games from primary source`);
        return data;
      }
    } catch (error) {
      console.warn('⚠️ Primary source failed, trying fallback...', error);
    }

    // Fallback to local backup
    try {
      const data = await this.loadFromBackup();
      console.log(`📁 Loaded ${data.length} games from local backup`);
      return data;
    } catch (error) {
      throw new Error('Both primary source and fallback failed: ' + error);
    }
  }

  /**
   * Always fetches live from upstream — no cache check.
   * Use this for admin-triggered imports. By default it saves the result as the
   * local backup; pass { persist: false } to fetch without any side effects
   * (dry-run preview, or when the caller wants to validate before persisting —
   * see persistSync()).
   */
  async fetchLiveFromSource(options: { persist?: boolean } = {}): Promise<GameData[]> {
    const response = await axios.get(this.sourceUrl, {
      timeout: 10000,
      headers: { 'User-Agent': 'Gacha-Daily-Tracker/1.0' },
    });
    const gameData = this.parseGameDataFile(response.data);
    console.log(`✅ Live fetch: ${gameData.length} games from upstream`);
    if (options.persist !== false) {
      await this.persistSync(gameData);
    }
    return gameData;
  }

  /**
   * Record a successful sync: remember the fetch time and save the data as the
   * local fallback backup. Only call this with data that passed validation.
   */
  async persistSync(data: GameData[]): Promise<void> {
    this.lastFetch = new Date();
    await this.saveBackup(data);
  }

  /**
   * Force refresh from primary source
   */
  async refreshFromSource(): Promise<GameData[]> {
    return await this.fetchLiveFromSource();
  }

  /**
   * Returns last-fetch timestamp and cache expiry for the GET /admin/games response.
   */
  getLastSyncInfo(): { lastFetch: Date | null; cacheExpiresAt: Date | null } {
    return {
      lastFetch: this.lastFetch,
      cacheExpiresAt: this.lastFetch
        ? new Date(this.lastFetch.getTime() + this.cacheTimeout)
        : null,
    };
  }

  /**
   * Fetch game data from GitHub (cache-gated — used only by startup auto-import)
   */
  private async fetchFromSource(): Promise<GameData[]> {
    if (!this.shouldFetch()) {
      throw new Error('Cache still valid, skipping fetch');
    }

    const response = await axios.get(this.sourceUrl, {
      timeout: 10000,
      headers: { 'User-Agent': 'Gacha-Daily-Tracker/1.0' },
    });

    const gameData = this.parseGameDataFile(response.data);
    this.lastFetch = new Date();

    return gameData;
  }

  /**
   * Parse the game-data.js file content
   */
  private parseGameDataFile(fileContent: string): GameData[] {
    try {
      console.log('🔍 Parsing game data file...');

      // Extract the JavaScript array directly
      const evalContent = fileContent
          .replace('var gameData = ', '')  // Remove variable declaration
          .replace(/;\s*$/, '');          // Remove trailing semicolon

      // Evaluate the array literal in an empty, time-limited VM context (no access to
      // require/process/globals), then round-trip through JSON so callers only ever
      // see plain data from this realm.
      const evaluated = vm.runInNewContext('(' + evalContent + ')', {}, { timeout: 2000 });
      const gameData = JSON.parse(JSON.stringify(evaluated));

      // Validate data structure
      if (!Array.isArray(gameData) || gameData.length === 0) {
        throw new Error('Game data is not a valid array');
      }

      console.log(`✅ Successfully parsed ${gameData.length} games`);
      return gameData;

    } catch (error) {
      console.error('❌ Failed to parse game data:', error);
      throw new Error(`Failed to parse game data: ${error}`);
    }
  }

  /**
   * Save game data as local backup
   */
  private async saveBackup(data: GameData[]): Promise<void> {
    try {
      const backupDir = path.dirname(this.fallbackPath);
      await fs.mkdir(backupDir, { recursive: true });

      const backup = {
        lastUpdated: new Date().toISOString(),
        source: this.sourceUrl,
        gameCount: data.length,
        data: data
      };

      await fs.writeFile(
          this.fallbackPath.replace('.js', '.json'),
          JSON.stringify(backup, null, 2)
      );
    } catch (error) {
      console.warn('Failed to save backup:', error);
    }
  }

  /**
   * Load game data from local backup
   */
  private async loadFromBackup(): Promise<GameData[]> {
    try {
      const backupPath = this.fallbackPath.replace('.js', '.json');
      const content = await fs.readFile(backupPath, 'utf-8');
      const backup = JSON.parse(content);

      if (!backup.data || !Array.isArray(backup.data)) {
        throw new Error('Invalid backup format');
      }

      return backup.data;
    } catch (error) {
      throw new Error(`Failed to load backup: ${error}`);
    }
  }

  /**
   * Check if we should fetch new data (cache expired)
   */
  private shouldFetch(): boolean {
    if (!this.lastFetch) return true;
    return (Date.now() - this.lastFetch.getTime()) > this.cacheTimeout;
  }

  /**
   * Get info about current data source
   */
  async getDataInfo() {
    try {
      const data = await this.getGameData();
      return {
        gameCount: data.length,
        lastFetch: this.lastFetch,
        source: this.lastFetch ? 'primary' : 'backup',
        cacheExpires: this.lastFetch ? new Date(this.lastFetch.getTime() + this.cacheTimeout) : null
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        // Safely access the `message` property if error is an instance of Error
        return { error: error.message };
      } else {
        // In case the error is not an instance of Error, return a generic message
        return { error: 'An unknown error occurred' };
      }
    }
  }
}

export default new GameDataService();