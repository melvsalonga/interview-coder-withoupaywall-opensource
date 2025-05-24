// ConfigHelper.ts
import fs from "node:fs"
import path from "node:path"
import { app } from "electron"
import { EventEmitter } from "events"
import { OpenAI } from "openai"

// Language detection utility
class LanguageDetector {
  private static readonly FILE_EXTENSIONS: Record<string, string> = {
    '.py': 'python',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.java': 'java',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.c': 'cpp',
    '.cs': 'csharp',
    '.go': 'go',
    '.rs': 'rust',
    '.php': 'php',
    '.rb': 'ruby',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.r': 'r',
    '.m': 'matlab',
    '.pl': 'perl',
    '.sh': 'bash',
    '.ps1': 'powershell'
  };

  private static readonly CONTENT_PATTERNS: Array<{pattern: RegExp, language: string}> = [
    { pattern: /^#!/, language: 'bash' },
    { pattern: /import\s+\w+\s*;/, language: 'java' },
    { pattern: /from\s+\w+\s+import/, language: 'python' },
    { pattern: /def\s+\w+\s*\(/, language: 'python' },
    { pattern: /function\s+\w+\s*\(/, language: 'javascript' },
    { pattern: /const\s+\w+\s*=/, language: 'javascript' },
    { pattern: /let\s+\w+\s*=/, language: 'javascript' },
    { pattern: /interface\s+\w+/, language: 'typescript' },
    { pattern: /class\s+\w+\s*{/, language: 'java' },
    { pattern: /public\s+class\s+\w+/, language: 'java' },
    { pattern: /#include\s*</, language: 'cpp' },
    { pattern: /using\s+namespace/, language: 'cpp' },
    { pattern: /package\s+main/, language: 'go' },
    { pattern: /func\s+\w+\s*\(/, language: 'go' },
    { pattern: /fn\s+\w+\s*\(/, language: 'rust' },
    { pattern: /use\s+std::/, language: 'rust' }
  ];

  static detectFromFilename(filename: string): string | null {
    const ext = path.extname(filename).toLowerCase();
    return this.FILE_EXTENSIONS[ext] || null;
  }

  static detectFromContent(content: string): string | null {
    const lines = content.split('\n').slice(0, 20); // Check first 20 lines
    const sampleContent = lines.join('\n');

    for (const { pattern, language } of this.CONTENT_PATTERNS) {
      if (pattern.test(sampleContent)) {
        return language;
      }
    }
    return null;
  }

  static detectLanguage(filename?: string, content?: string): string {
    // Try filename detection first
    if (filename) {
      const langFromFilename = this.detectFromFilename(filename);
      if (langFromFilename) return langFromFilename;
    }

    // Try content detection
    if (content) {
      const langFromContent = this.detectFromContent(content);
      if (langFromContent) return langFromContent;
    }

    // Default fallback
    return 'python';
  }
}

interface Config {
  apiKey: string;
  apiProvider: "openai" | "gemini" | "anthropic" | "openrouter";  // Added openrouter
  extractionModel: string;
  solutionModel: string;
  debuggingModel: string;
  language?: string;  // Made optional for auto-detection
  opacity: number;
}

// Model configurations for each provider
const API_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini'],
  gemini: [
    'gemini-2.5-pro-preview-05-06',
    'gemini-2.5-flash-preview-05-20',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite'
  ],
  anthropic: [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229'
  ],
  openrouter: [
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'anthropic/claude-3.5-sonnet',
    'anthropic/claude-3.5-haiku',
    'google/gemini-2.0-flash-exp',
    'meta-llama/llama-3.1-405b-instruct',
    'meta-llama/llama-3.1-70b-instruct',
    'mistralai/mistral-large-2407',
    'cohere/command-r-plus'
  ]
};

export class ConfigHelper extends EventEmitter {
  private configPath: string;
  private defaultConfig: Config = {
    apiKey: "",
    apiProvider: "gemini", // Default to Gemini
    extractionModel: "gemini-2.5-flash-preview-05-20", // Updated to latest Flash model
    solutionModel: "gemini-2.5-flash-preview-05-20",
    debuggingModel: "gemini-2.5-flash-preview-05-20",
    opacity: 1.0
    // language removed - will be auto-detected
  };

  constructor() {
    super();
    // Use the app's user data directory to store the config
    try {
      this.configPath = path.join(app.getPath('userData'), 'config.json');
      console.log('Config path:', this.configPath);
    } catch (err) {
      console.warn('Could not access user data path, using fallback');
      this.configPath = path.join(process.cwd(), 'config.json');
    }

    // Ensure the initial config file exists
    this.ensureConfigExists();
  }

  /**
   * Ensure config file exists
   */
  private ensureConfigExists(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        this.saveConfig(this.defaultConfig);
      }
    } catch (err) {
      console.error("Error ensuring config exists:", err);
    }
  }

  /**
   * Validate and sanitize model selection to ensure only allowed models are used
   */
  private sanitizeModelSelection(model: string, provider: "openai" | "gemini" | "anthropic" | "openrouter"): string {
    const allowedModels = API_MODELS[provider];

    if (provider === "openai") {
      if (!allowedModels.includes(model)) {
        console.warn(`Invalid OpenAI model specified: ${model}. Using default model: gpt-4o`);
        return 'gpt-4o';
      }
      return model;
    } else if (provider === "gemini") {
      if (!allowedModels.includes(model)) {
        console.warn(`Invalid Gemini model specified: ${model}. Using default model: gemini-2.5-flash-preview-05-20`);
        return 'gemini-2.5-flash-preview-05-20';
      }
      return model;
    } else if (provider === "anthropic") {
      if (!allowedModels.includes(model)) {
        console.warn(`Invalid Anthropic model specified: ${model}. Using default model: claude-3-5-sonnet-20241022`);
        return 'claude-3-5-sonnet-20241022';
      }
      return model;
    } else if (provider === "openrouter") {
      if (!allowedModels.includes(model)) {
        console.warn(`Invalid OpenRouter model specified: ${model}. Using default model: openai/gpt-4o`);
        return 'openai/gpt-4o';
      }
      return model;
    }
    // Default fallback
    return model;
  }

  public loadConfig(): Config {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const config = JSON.parse(configData);

        // Ensure apiProvider is a valid value
        if (!["openai", "gemini", "anthropic", "openrouter"].includes(config.apiProvider)) {
          config.apiProvider = "gemini"; // Default to Gemini if invalid
        }

        // Sanitize model selections to ensure only allowed models are used
        if (config.extractionModel) {
          config.extractionModel = this.sanitizeModelSelection(config.extractionModel, config.apiProvider);
        }
        if (config.solutionModel) {
          config.solutionModel = this.sanitizeModelSelection(config.solutionModel, config.apiProvider);
        }
        if (config.debuggingModel) {
          config.debuggingModel = this.sanitizeModelSelection(config.debuggingModel, config.apiProvider);
        }

        return {
          ...this.defaultConfig,
          ...config
        };
      }

      // If no config exists, create a default one
      this.saveConfig(this.defaultConfig);
      return this.defaultConfig;
    } catch (err) {
      console.error("Error loading config:", err);
      return this.defaultConfig;
    }
  }

  /**
   * Save configuration to disk
   */
  public saveConfig(config: Config): void {
    try {
      // Ensure the directory exists
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      // Write the config file
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (err) {
      console.error("Error saving config:", err);
    }
  }

  /**
   * Update specific configuration values
   */
  public updateConfig(updates: Partial<Config>): Config {
    try {
      const currentConfig = this.loadConfig();
      let provider = updates.apiProvider || currentConfig.apiProvider;

      // Auto-detect provider based on API key format if a new key is provided
      if (updates.apiKey && !updates.apiProvider) {
        // If API key starts with "sk-", it's likely an OpenAI key
        if (updates.apiKey.trim().startsWith('sk-')) {
          if (updates.apiKey.trim().startsWith('sk-ant-')) {
            provider = "anthropic";
            console.log("Auto-detected Anthropic API key format");
          } else if (updates.apiKey.trim().startsWith('sk-or-')) {
            provider = "openrouter";
            console.log("Auto-detected OpenRouter API key format");
          } else {
            provider = "openai";
            console.log("Auto-detected OpenAI API key format");
          }
        } else {
          provider = "gemini";
          console.log("Using Gemini API key format (default)");
        }

        // Update the provider in the updates object
        updates.apiProvider = provider;
      }

      // If provider is changing, reset models to the default for that provider
      if (updates.apiProvider && updates.apiProvider !== currentConfig.apiProvider) {
        if (updates.apiProvider === "openai") {
          updates.extractionModel = "gpt-4o";
          updates.solutionModel = "gpt-4o";
          updates.debuggingModel = "gpt-4o";
        } else if (updates.apiProvider === "anthropic") {
          updates.extractionModel = "claude-3-5-sonnet-20241022";
          updates.solutionModel = "claude-3-5-sonnet-20241022";
          updates.debuggingModel = "claude-3-5-sonnet-20241022";
        } else if (updates.apiProvider === "openrouter") {
          updates.extractionModel = "openai/gpt-4o";
          updates.solutionModel = "openai/gpt-4o";
          updates.debuggingModel = "openai/gpt-4o";
        } else {
          updates.extractionModel = "gemini-2.5-flash-preview-05-20";
          updates.solutionModel = "gemini-2.5-flash-preview-05-20";
          updates.debuggingModel = "gemini-2.5-flash-preview-05-20";
        }
      }

      // Sanitize model selections in the updates
      if (updates.extractionModel) {
        updates.extractionModel = this.sanitizeModelSelection(updates.extractionModel, provider);
      }
      if (updates.solutionModel) {
        updates.solutionModel = this.sanitizeModelSelection(updates.solutionModel, provider);
      }
      if (updates.debuggingModel) {
        updates.debuggingModel = this.sanitizeModelSelection(updates.debuggingModel, provider);
      }

      const newConfig = { ...currentConfig, ...updates };
      this.saveConfig(newConfig);

      // Only emit update event for changes other than opacity
      // This prevents re-initializing the AI client when only opacity changes
      if (updates.apiKey !== undefined || updates.apiProvider !== undefined ||
          updates.extractionModel !== undefined || updates.solutionModel !== undefined ||
          updates.debuggingModel !== undefined || updates.language !== undefined) {
        this.emit('config-updated', newConfig);
      }

      return newConfig;
    } catch (error) {
      console.error('Error updating config:', error);
      return this.defaultConfig;
    }
  }

  /**
   * Check if the API key is configured
   */
  public hasApiKey(): boolean {
    const config = this.loadConfig();
    return !!config.apiKey && config.apiKey.trim().length > 0;
  }

  /**
   * Validate the API key format
   */
  public isValidApiKeyFormat(apiKey: string, provider?: "openai" | "gemini" | "anthropic" | "openrouter"): boolean {
    // If provider is not specified, attempt to auto-detect
    if (!provider) {
      if (apiKey.trim().startsWith('sk-')) {
        if (apiKey.trim().startsWith('sk-ant-')) {
          provider = "anthropic";
        } else if (apiKey.trim().startsWith('sk-or-')) {
          provider = "openrouter";
        } else {
          provider = "openai";
        }
      } else {
        provider = "gemini";
      }
    }

    if (provider === "openai") {
      // Basic format validation for OpenAI API keys
      return /^sk-[a-zA-Z0-9]{32,}$/.test(apiKey.trim());
    } else if (provider === "gemini") {
      // Basic format validation for Gemini API keys (usually alphanumeric with no specific prefix)
      return apiKey.trim().length >= 10; // Assuming Gemini keys are at least 10 chars
    } else if (provider === "anthropic") {
      // Basic format validation for Anthropic API keys
      return /^sk-ant-[a-zA-Z0-9]{32,}$/.test(apiKey.trim());
    } else if (provider === "openrouter") {
      // Basic format validation for OpenRouter API keys
      return /^sk-or-[a-zA-Z0-9]{32,}$/.test(apiKey.trim());
    }

    return false;
  }

  /**
   * Get the stored opacity value
   */
  public getOpacity(): number {
    const config = this.loadConfig();
    return config.opacity !== undefined ? config.opacity : 1.0;
  }

  /**
   * Set the window opacity value
   */
  public setOpacity(opacity: number): void {
    // Ensure opacity is between 0.1 and 1.0
    const validOpacity = Math.min(1.0, Math.max(0.1, opacity));
    this.updateConfig({ opacity: validOpacity });
  }

  /**
   * Get the preferred programming language with auto-detection support
   */
  public getLanguage(filename?: string, content?: string): string {
    const config = this.loadConfig();

    // If language is explicitly set in config, use it
    if (config.language) {
      return config.language;
    }

    // Otherwise, use auto-detection
    return LanguageDetector.detectLanguage(filename, content);
  }

  /**
   * Set the preferred programming language (optional - will auto-detect if not set)
   */
  public setLanguage(language?: string): void {
    this.updateConfig({ language });
  }

  /**
   * Auto-detect programming language from file context
   */
  public detectLanguage(filename?: string, content?: string): string {
    return LanguageDetector.detectLanguage(filename, content);
  }

  /**
   * Get available models for a specific provider
   */
  public getAvailableModels(provider: "openai" | "gemini" | "anthropic" | "openrouter"): string[] {
    return API_MODELS[provider] || [];
  }

  /**
   * Get all available providers
   */
  public getAvailableProviders(): Array<"openai" | "gemini" | "anthropic" | "openrouter"> {
    return ["openai", "gemini", "anthropic", "openrouter"];
  }

  /**
   * Test API key with the selected provider
   */
  public async testApiKey(apiKey: string, provider?: "openai" | "gemini" | "anthropic" | "openrouter"): Promise<{valid: boolean, error?: string}> {
    // Auto-detect provider based on key format if not specified
    if (!provider) {
      if (apiKey.trim().startsWith('sk-')) {
        if (apiKey.trim().startsWith('sk-ant-')) {
          provider = "anthropic";
          console.log("Auto-detected Anthropic API key format for testing");
        } else if (apiKey.trim().startsWith('sk-or-')) {
          provider = "openrouter";
          console.log("Auto-detected OpenRouter API key format for testing");
        } else {
          provider = "openai";
          console.log("Auto-detected OpenAI API key format for testing");
        }
      } else {
        provider = "gemini";
        console.log("Using Gemini API key format for testing (default)");
      }
    }

    if (provider === "openai") {
      return this.testOpenAIKey(apiKey);
    } else if (provider === "gemini") {
      return this.testGeminiKey(apiKey);
    } else if (provider === "anthropic") {
      return this.testAnthropicKey(apiKey);
    } else if (provider === "openrouter") {
      return this.testOpenRouterKey(apiKey);
    }

    return { valid: false, error: "Unknown API provider" };
  }

  /**
   * Test OpenAI API key
   */
  private async testOpenAIKey(apiKey: string): Promise<{valid: boolean, error?: string}> {
    try {
      const openai = new OpenAI({ apiKey });
      // Make a simple API call to test the key
      await openai.models.list();
      return { valid: true };
    } catch (error: any) {
      console.error('OpenAI API key test failed:', error);

      // Determine the specific error type for better error messages
      let errorMessage = 'Unknown error validating OpenAI API key';

      if (error.status === 401) {
        errorMessage = 'Invalid API key. Please check your OpenAI key and try again.';
      } else if (error.status === 429) {
        errorMessage = 'Rate limit exceeded. Your OpenAI API key has reached its request limit or has insufficient quota.';
      } else if (error.status === 500) {
        errorMessage = 'OpenAI server error. Please try again later.';
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }

      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Test Gemini API key
   * Note: This is a simplified implementation since we don't have the actual Gemini client
   */
  private async testGeminiKey(apiKey: string): Promise<{valid: boolean, error?: string}> {
    try {
      // For now, we'll just do a basic check to ensure the key exists and has valid format
      // In production, you would connect to the Gemini API and validate the key
      if (apiKey && apiKey.trim().length >= 20) {
        // Here you would actually validate the key with a Gemini API call
        return { valid: true };
      }
      return { valid: false, error: 'Invalid Gemini API key format.' };
    } catch (error: any) {
      console.error('Gemini API key test failed:', error);
      let errorMessage = 'Unknown error validating Gemini API key';

      if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }

      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Test Anthropic API key
   * Note: This is a simplified implementation since we don't have the actual Anthropic client
   */
  private async testAnthropicKey(apiKey: string): Promise<{valid: boolean, error?: string}> {
    try {
      // For now, we'll just do a basic check to ensure the key exists and has valid format
      // In production, you would connect to the Anthropic API and validate the key
      if (apiKey && /^sk-ant-[a-zA-Z0-9]{32,}$/.test(apiKey.trim())) {
        // Here you would actually validate the key with an Anthropic API call
        return { valid: true };
      }
      return { valid: false, error: 'Invalid Anthropic API key format.' };
    } catch (error: any) {
      console.error('Anthropic API key test failed:', error);
      let errorMessage = 'Unknown error validating Anthropic API key';

      if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }

      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Test OpenRouter API key
   */
  private async testOpenRouterKey(apiKey: string): Promise<{valid: boolean, error?: string}> {
    try {
      // Test OpenRouter API key by making a request to list models
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        return { valid: true };
      } else if (response.status === 401) {
        return { valid: false, error: 'Invalid OpenRouter API key. Please check your key and try again.' };
      } else if (response.status === 429) {
        return { valid: false, error: 'Rate limit exceeded. Your OpenRouter API key has reached its request limit.' };
      } else {
        return { valid: false, error: `OpenRouter API error: ${response.status} ${response.statusText}` };
      }
    } catch (error: any) {
      console.error('OpenRouter API key test failed:', error);
      let errorMessage = 'Unknown error validating OpenRouter API key';

      if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }

      return { valid: false, error: errorMessage };
    }
  }
}

// Export the LanguageDetector class for use in other modules
export { LanguageDetector };

// Export a singleton instance
export const configHelper = new ConfigHelper();
