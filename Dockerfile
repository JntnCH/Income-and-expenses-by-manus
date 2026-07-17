# ใช้ Node.js เป็น base image
FROM node:20-slim

# ติดตั้ง dependencies สำหรับ Tesseract OCR และ Python
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-tha \
    tesseract-ocr-eng \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY requirements.txt ./

# ติดตั้ง Node.js dependencies
RUN npm install --omit=dev

# ติดตั้ง Python dependencies (ใช้ --break-system-packages สำหรับ debian-based slim image)
RUN pip3 install --no-cache-dir -r requirements.txt --break-system-packages

# Copy source code
COPY . .

ENV NODE_OPTIONS="--openssl-legacy-provider"

# Cloud Run จะส่งพอร์ตมาทาง environment variable $PORT (ปกติคือ 8080)
ENV PORT=8080
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Start server
CMD ["node", "src/index.js"]
