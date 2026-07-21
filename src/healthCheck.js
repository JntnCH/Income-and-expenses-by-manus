const { google } = require('googleapis');

/**
 * Health Check Module
 * Provides multiple levels of health checks for the application
 */

class HealthCheckService {
  constructor() {
    this.lastGoogleAuthCheck = null;
    this.lastGoogleAuthCheckTime = 0;
    this.lastCheckDuration = 0;
  }

  /**
   * Basic Health Check - Server is running
   * Used for Docker HEALTHCHECK and quick probes
   */
  getBasicHealth() {
    return {
      status: 'ok',
      message: 'Income & Expense Bot is running',
      version: '2.1.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    };
  }

  /**
   * Readiness Check - All critical dependencies are OK
   * Used for Kubernetes readiness probes and deployment checks
   */
  async getReadinessHealth() {
    const startTime = Date.now();
    const checks = {
      server: { status: 'ok', message: 'Server is running' },
      environment: { status: 'unknown', message: '' },
      google_auth: { status: 'unknown', message: '' },
      google_sheets: { status: 'unknown', message: '' },
      ocr_provider: { status: 'unknown', message: '' }
    };

    try {
      // 1. Check Environment Variables
      checks.environment = this.checkEnvironmentVariables();

      // 2. Check Google Authentication (with caching)
      const useCache = Date.now() - this.lastGoogleAuthCheckTime < 30000; // Cache for 30 seconds
      if (useCache && this.lastGoogleAuthCheck) {
        checks.google_auth = this.lastGoogleAuthCheck;
      } else {
        checks.google_auth = await this.checkGoogleAuthentication();
        this.lastGoogleAuthCheck = checks.google_auth;
        this.lastGoogleAuthCheckTime = Date.now();
      }

      // 3. Check Google Sheets Access (only if auth is OK)
      if (checks.google_auth.status === 'ok') {
        checks.google_sheets = await this.checkGoogleSheetsAccess();
      } else {
        checks.google_sheets = {
          status: 'warning',
          message: 'Skipped due to authentication failure'
        };
      }

      // 4. Check OCR Provider
      checks.ocr_provider = this.checkOCRProvider();

    } catch (error) {
      console.error('[HealthCheck] Error during readiness check:', error.message);
      checks.server.status = 'degraded';
      checks.server.message = error.message;
    }

    this.lastCheckDuration = Date.now() - startTime;

    // Determine overall status
    const allOk = Object.values(checks).every(c => 
      c.status === 'ok' || c.status === 'warning'
    );

    return {
      status: allOk ? 'ready' : 'not-ready',
      checks,
      duration: `${this.lastCheckDuration}ms`,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Startup Check - Full diagnostic for initialization
   * Used during deployment and startup verification
   */
  async getStartupHealth() {
    const readiness = await this.getReadinessHealth();
    
    return {
      ...readiness,
      type: 'startup',
      details: {
        node_version: process.version,
        node_env: process.env.NODE_ENV,
        memory_usage: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
        },
        uptime: process.uptime() + 's',
        platform: process.platform
      }
    };
  }

  /**
   * Check Environment Variables
   */
  checkEnvironmentVariables() {
    const required = [
      'GOOGLE_SERVICE_ACCOUNT_EMAIL',
      'GOOGLE_PRIVATE_KEY',
      'GOOGLE_SPREADSHEET_ID'
    ];

    const optional = [
      'OPENAI_API_KEY',
      'TELEGRAM_TOKEN',
      'OCR_PROVIDER'
    ];

    const missing = required.filter(v => !process.env[v]);

    if (missing.length > 0) {
      return {
        status: 'error',
        message: `Missing required variables: ${missing.join(', ')}`,
        required,
        found: required.filter(v => process.env[v])
      };
    }

    return {
      status: 'ok',
      message: 'All required environment variables are set',
      requiredCount: required.length,
      optionalCount: optional.filter(v => process.env[v]).length
    };
  }

  /**
   * Check Google Authentication
   */
  async checkGoogleAuthentication() {
    try {
      const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      const privateKey = process.env.GOOGLE_PRIVATE_KEY;

      if (!email || !privateKey) {
        return {
          status: 'error',
          message: 'Service account credentials not configured'
        };
      }

      if (!privateKey.includes('BEGIN PRIVATE KEY')) {
        return {
          status: 'error',
          message: 'Invalid private key format'
        };
      }

      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: email,
          private_key: privateKey.replace(/\\n/g, '\n')
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
      });

      const client = await auth.getClient();
      const token = await client.getAccessToken();

      if (!token || !token.token) {
        return {
          status: 'error',
          message: 'Failed to obtain access token'
        };
      }

      return {
        status: 'ok',
        message: 'Google authentication successful',
        email: email.substring(0, 5) + '...@' + email.split('@')[1]
      };

    } catch (error) {
      return {
        status: 'error',
        message: `Google authentication failed: ${error.message}`
      };
    }
  }

  /**
   * Check Google Sheets Access
   */
  async checkGoogleSheetsAccess() {
    try {
      const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
      const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      const privateKey = process.env.GOOGLE_PRIVATE_KEY;

      if (!spreadsheetId) {
        return {
          status: 'error',
          message: 'Spreadsheet ID not configured'
        };
      }

      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: email,
          private_key: privateKey.replace(/\\n/g, '\n')
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
      });

      const client = await auth.getClient();
      const sheets = google.sheets({ version: 'v4', auth: client });
      const response = await sheets.spreadsheets.get({ spreadsheetId });

      return {
        status: 'ok',
        message: `Connected to spreadsheet: "${response.data.properties.title}"`,
        sheetCount: response.data.sheets?.length || 0
      };

    } catch (error) {
      // 404 means spreadsheet not found or no access
      if (error.message.includes('404')) {
        return {
          status: 'error',
          message: 'Spreadsheet not found or no access permission'
        };
      }

      return {
        status: 'error',
        message: `Spreadsheet access failed: ${error.message}`
      };
    }
  }

  /**
   * Check OCR Provider
   */
  checkOCRProvider() {
    const provider = process.env.OCR_PROVIDER || 'tesseract';
    const supportedProviders = ['tesseract', 'google'];

    if (!supportedProviders.includes(provider)) {
      return {
        status: 'warning',
        message: `Unknown OCR provider: ${provider}. Supported: ${supportedProviders.join(', ')}`
      };
    }

    return {
      status: 'ok',
      message: `OCR Provider: ${provider}`,
      provider
    };
  }

  /**
   * Get last check duration
   */
  getLastCheckDuration() {
    return this.lastCheckDuration;
  }
}

module.exports = new HealthCheckService();
