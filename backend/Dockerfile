# Gunakan image Node.js yang ringan (Alpine Linux)
FROM node:20-alpine

# Set folder kerja
WORKDIR /app

# Salin package.json dan install dependency dulu (untuk efisiensi cache)
COPY package*.json ./
RUN npm install --production

# Salin seluruh kode backend
COPY . .

# Standar Keamanan: Gunakan user non-root 'node' bawaan image
USER node

# Port yang digunakan aplikasi
EXPOSE 3000

# Jalankan aplikasi (Docker akan menangani restart, jadi tidak butuh PM2 di sini)
CMD ["node", "server.js"]
