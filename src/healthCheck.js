const { google } = require('googleapis');
const { parsePrivateKey, parseServiceAccountJson } = require('./utils/credentialsParser');
const { isStorageConfigured, getBucketName } = require('./services/cloudStorage');

class HealthCheckService {
  constructor() {
    this.cache = {
      lastCheck: null,
      data: null,
      ttl: 30000 // 30 seconds
    };
  }

  /**
   * Get basic health status (fast, no external calls)
   */
  getBasicHealth() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      }
    };
  }

  /**
   * Get readiness status (includes dependency checks with caching)
   */
  async getReadinessHealth() {
    const now = Date.now();
    if (this.cache.lastCheck && (now - this.cache.lastCheck) < this.cache.ttl) {
      return this.cache.data;
    }

    const checks = {
      environment: this.checkEnvironmentVariables(),
      auth: await this.checkGoogleAuthentication(),
      sheets: await this.checkGoogleSheetsAccess(),
      imageStorage: this.checkImageStorageConfiguration()
    };

    const hasErrors = Object.values(checks).some(c => c.status === 'error');
    const health = {
      status: hasErrors ? 'not-ready' : 'ready',
      timestamp: new Date().toISOString(),
      checks
    };

    this.cache.lastCheck = now;
    this.cache.data = health;
    return health;
  }

  /**
   * Get startup status (full diagnostics)
   */
  async getStartupHealth() {
    return {
      status: 'startup',
      timestamp: new Date().toISOString(),
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
      },
      checks: {
        environment: this.checkEnvironmentVariables(),
        auth: await this.checkGoogleAuthentication(),
        sheets: await this.checkGoogleSheetsAccess(),
        imageStorage: this.checkImageStorageConfiguration()
      }
    };
  }

  /**
   * Check Environment Variables
   */
  checkEnvironmentVariables() {
    const required = [
      'GOOGLE_SPREADSHEET_ID'
    ];

    const optional = [
      'OPENAI_API_KEY',
      'TELEGRAM_TOKEN',
      'GOOGLE_SERVICE_ACCOUNT_EMAIL',
      'GOOGLE_PRIVATE_KEY',
      'GOOGLE_SERVICE_ACCOUNT_JSON',
      'GCS_IMAGE_BUCKET',
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
   * Check Google Cloud Storage image configuration without making a network request.
   */
  checkImageStorageConfiguration() {
    const bucket = getBucketName() || 'income-expenses-by-manus_cloudbuild';
    if (!isStorageConfigured()) {
      return {
        status: 'warning',
        message: 'GCS_IMAGE_BUCKET is not configured; image responses will use text fallback',
        bucket
      };
    }
    return {
      status: 'ok',
      message: 'Google Cloud Storage image upload is configured',
      bucket
    };
  }

  /**
   * Check Google Authentication
   */
  async checkGoogleAuthentication() {
    try {
      let credentials;

      if (process.env.K_SERVICE) {
        const auth = new google.auth.GoogleAuth({
          scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
        });
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        if (!token || !token.token) {
          return { status: 'error', message: 'Failed to obtain Cloud Run access token' };
        }
        return {
          status: 'ok',
          message: 'Google Cloud Application Default Credentials authentication successful'
        };
      }

      // Try JSON credentials first for local or legacy deployments.
      if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        try {
          credentials = parseServiceAccountJson(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
        } catch (e) {
          console.error('[HealthCheck] JSON parsing failed:', e.message);
          // Fall through to separate vars
        }
      }

      // Fall back to separate variables, then Cloud Run Application Default Credentials.
      if (!credentials) {
        const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;
        if (email && privateKeyRaw) {
          credentials = { client_email: email, private_key: parsePrivateKey(privateKeyRaw) };
        }
      }

      const auth = new google.auth.GoogleAuth({
        ...(credentials ? { credentials } : {}),
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
        message: credentials
          ? 'Google authentication successful'
          : 'Google Cloud Application Default Credentials authentication successful',
        ...(credentials?.client_email ? {
          email: credentials.client_email.substring(0, 5) + '...@' + credentials.client_email.split('@')[1]
        } : {})
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

      if (!spreadsheetId) {
        return {
          status: 'error',
          message: 'Spreadsheet ID not configured'
        };
      }

      let credentials;

      if (process.env.K_SERVICE) {
        const auth = new google.auth.GoogleAuth({
          scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
        });
        const client = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: client });
        const response = await sheets.spreadsheets.get({ spreadsheetId });
        return {
          status: 'ok',
          message: `Connected to spreadsheet: "${response.data.properties.title}"`,
          spreadsheetTitle: response.data.properties.title
        };
      }

      if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        try {
          credentials = parseServiceAccountJson(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
        } catch (e) {
          console.error('[HealthCheck] JSON parsing failed:', e.message);
        }
      }

      if (!credentials) {
        const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;
        if (email && privateKeyRaw) {
          credentials = { client_email: email, private_key: parsePrivateKey(privateKeyRaw) };
        }
      }

      const auth = new google.auth.GoogleAuth({
        ...(credentials ? { credentials } : {}),
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
      });

      const client = await auth.getClient();
      const sheets = google.sheets({ version: 'v4', auth: client });
      const response = await sheets.spreadsheets.get({ spreadsheetId });

      return {
        status: 'ok',
        message: `Connected to spreadsheet: "${response.data.properties.title}"`,
        spreadsheetTitle: response.data.properties.title
      };

    } catch (error) {
      return {
        status: 'error',
        message: `Google Sheets access failed: ${error.message}`
      };
    }
  }
}

module.exports = new HealthCheckService();
