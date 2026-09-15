FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src
RUN mkdir -p /data/auth

ENV NODE_ENV=production
ENV PORT=3100
EXPOSE 3100

CMD ["npm", "start"]
