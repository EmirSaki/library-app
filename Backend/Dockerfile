# Hafif bir Node.js imajı kullanıyoruz (Artık devasa Puppeteer imajına gerek yok)
FROM node:20-slim

# Linux kütüphanelerini güncelle (Sadece temel olanlar kalsın)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Mekanımız burası
WORKDIR /app

# Docker Cache avantajı için önce paket dosyaları
COPY package*.json ./

# Bağımlılıkları kur (Artık Puppeteer indirmesine gerek yok, axios yetecek)
# Not: package.json'daki Puppeteer kalsın istiyorsan kalsın, ama indirmeyi atlayabilirsin
RUN npm install --production

# Kral kodları içeri al
COPY . .

# Cloud Run için port 8080
EXPOSE 8080

# Ve motoru çalıştırıyoruz
CMD ["node", "src/server.js"]