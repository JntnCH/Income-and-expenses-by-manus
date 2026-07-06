
require('dotenv').config();
const { google } = require('googleapis');

async function debugAuth() {
    console.log('=== 🔍 Google Auth Debugger ===\n');

    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    // 1. Check Email
    console.log('1. Checking Service Account Email...');
    if (!email) {
        console.error('❌ Error: GOOGLE_SERVICE_ACCOUNT_EMAIL is missing in .env\n');
    } else {
        console.log(`✅ Email found: ${email}\n`);
    }

    // 2. Check Private Key
    console.log('2. Checking Private Key...');
    if (!privateKey) {
        console.error('❌ Error: GOOGLE_PRIVATE_KEY is missing in .env\n');
    } else if (!privateKey.includes('BEGIN PRIVATE KEY')) {
        console.error('❌ Error: GOOGLE_PRIVATE_KEY format seems wrong (Missing BEGIN/END headers)\n');
    } else {
        console.log('✅ Private Key found and format looks valid.\n');
    }

    // 3. Try to authenticate
    console.log('3. Attempting to authenticate with Google...');
    try {
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: email,
                private_key: privateKey.replace(/\\n/g, '\n')
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        const authClient = await auth.getClient();
        console.log('✅ Authentication Successful!\n');

        // 4. Try to read a spreadsheet if ID exists
        if (spreadsheetId) {
            console.log(`4. Attempting to read Spreadsheet (ID: ${spreadsheetId})...`);
            const sheets = google.sheets({ version: 'v4', auth: authClient });
            const response = await sheets.spreadsheets.get({ spreadsheetId });
            console.log(`✅ Success! Spreadsheet Title: ${response.data.properties.title}\n`);
        } else {
            console.log('⚠️ Skipping Spreadsheet read test: GOOGLE_SPREADSHEET_ID is missing.\n');
        }

    } catch (error) {
        console.error('❌ Authentication FAILED!');
        console.error('--- Error Details ---');
        console.error('Message:', error.message);
        if (error.response) {
            console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
        }
        console.error('----------------------\n');
        
        console.log('💡 Suggestions:');
        if (error.message.includes('invalid_grant')) {
            console.log('- Double check if the Email exists in Google Cloud Console.');
            console.log('- Ensure the Private Key matches the Email.');
            console.log('- Check if your server time is correct (Google is sensitive to time drift).');
        } else if (error.message.includes('not found')) {
            console.log('- Ensure you have SHARED the spreadsheet with the Service Account Email.');
        }
    }

    console.log('=== End of Debug ===');
}

debugAuth();
