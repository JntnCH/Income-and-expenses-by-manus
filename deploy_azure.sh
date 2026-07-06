#!/bin/bash

# 1. Install Node.js dependencies
echo "Installing Node.js dependencies..."
npm install

# 2. Install Python dependencies for AI Engine
echo "Installing Python dependencies..."
# Check if pip is available
if command -v pip3 &> /dev/null
then
    pip3 install pandas openpyxl google-api-python-client google-auth-httplib2 google-auth-oauthlib openai
else
    echo "pip3 not found, skipping python dependencies"
fi

echo "Deployment preparation complete."
