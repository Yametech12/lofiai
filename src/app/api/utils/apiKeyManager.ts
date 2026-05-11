// API Key management with rotation and balance tracking

interface KeyStatus {
  key: string;
  index: number;
  credits: number;
  isValid: boolean;
  lastChecked: number;
  expiresAt?: number;
}

class APIKeyManager {
  private keys: string[] = [];
  private currentIndex: number = 0;
  private keyStatuses: Map<string, KeyStatus> = new Map();
  private readonly CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly LOW_BALANCE_THRESHOLD = 1.0; // Credits below this trigger rotation

  constructor() {
    this.initializeKeys();
  }

  private initializeKeys() {
    // Parse multiple API keys from environment
    const primaryKey = process.env.MUSICGPT_API_KEY;
    const backupKeys = process.env.MUSICGPT_API_KEYS_BACKUP
      ? process.env.MUSICGPT_API_KEYS_BACKUP.split(',').map(k => k.trim()).filter(Boolean)
      : [];

    this.keys = [];
    if (primaryKey?.trim()) this.keys.push(primaryKey.trim());
    this.keys.push(...backupKeys);

    if (this.keys.length === 0) {
      console.warn('No MusicGPT API keys configured');
    }

    // Initialize status for each key
    this.keys.forEach((key, index) => {
      this.keyStatuses.set(key, {
        key,
        index,
        credits: 0,
        isValid: true,
        lastChecked: 0,
      });
    });
  }

  /**
   * Get the current active API key
   */
  getCurrentKey(): string | null {
    if (this.keys.length === 0) return null;
    const currentKey = this.keys[this.currentIndex];
    const currentStatus = this.keyStatuses.get(currentKey);
    if (currentStatus?.isValid === false) {
      return this.rotateKey();
    }
    return currentKey;
  }

  /**
   * Check if current key should be rotated
   */
  shouldRotate(credits: number, isExpired: boolean = false): boolean {
    if (isExpired) {
      console.log(`API key expired, rotating...`);
      return true;
    }
    if (Number.isFinite(credits) && credits < this.LOW_BALANCE_THRESHOLD) {
      console.log(`API key has low balance (${credits}), rotating...`);
      return true;
    }
    return false;
  }

  /**
   * Rotate to next available API key
   */
  rotateKey(): string | null {
    if (this.keys.length === 0) return null;

    const startIndex = this.currentIndex;
    let nextIndex = this.currentIndex;
    let attempts = 0;

    do {
      nextIndex = (nextIndex + 1) % this.keys.length;
      attempts += 1;
      const candidateKey = this.keys[nextIndex];
      const candidateStatus = this.keyStatuses.get(candidateKey);
      if (candidateStatus?.isValid !== false) {
        const oldIndex = this.currentIndex;
        this.currentIndex = nextIndex;
        console.log(`Rotated API key from index ${oldIndex} to ${this.currentIndex}`);
        return candidateKey;
      }
    } while (attempts < this.keys.length && nextIndex !== startIndex);

    console.warn('No valid backup API keys available for rotation');
    return null;
  }

  /**
   * Update key status with balance and expiration info
   */
  updateKeyStatus(credits: number, expiresAt?: number) {
    const currentKey = this.getCurrentKey();
    if (!currentKey) return;

    const status = this.keyStatuses.get(currentKey);
    if (status) {
      status.credits = credits;
      status.lastChecked = Date.now();
      if (expiresAt) status.expiresAt = expiresAt;
      this.keyStatuses.set(currentKey, status);
    }
  }

  /**
   * Get all available keys (for fallback scenarios)
   */
  getAllKeys(): string[] {
    return [...this.keys];
  }

  /**
   * Get all currently valid keys
   */
  getValidKeys(): string[] {
    return this.keys.filter((key) => this.keyStatuses.get(key)?.isValid ?? true);
  }

  /**
   * Set the current active API key by value
   */
  setCurrentKey(key: string) {
    const index = this.keys.indexOf(key);
    if (index !== -1) {
      this.currentIndex = index;
    }
  }

  /**
   * Get status of all keys
   */
  getKeysStatus(): KeyStatus[] {
    return Array.from(this.keyStatuses.values());
  }

  /**
   * Mark a key as invalid (failed requests)
   */
  markKeyInvalid(key?: string) {
    const targetKey = key || this.getCurrentKey();
    if (!targetKey) return;

    const status = this.keyStatuses.get(targetKey);
    if (status) {
      status.isValid = false;
      this.keyStatuses.set(targetKey, status);
      console.log(`Marked API key as invalid, attempting rotation...`);
      this.rotateKey();
    }
  }

  /**
   * Reset all key statuses (useful for recovery)
   */
  resetStatuses() {
    this.keys.forEach((key) => {
      const status = this.keyStatuses.get(key);
      if (status) {
        status.isValid = true;
        status.credits = 0;
        status.lastChecked = 0;
        this.keyStatuses.set(key, status);
      }
    });
  }
}

// Global instance
const apiKeyManager = new APIKeyManager();

export default apiKeyManager;
