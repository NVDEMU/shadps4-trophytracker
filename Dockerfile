FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=3000 HOST=0.0.0.0 COOKIE_SECURE=true
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["sh", "-c", "npm run sync:games && npm start"]
