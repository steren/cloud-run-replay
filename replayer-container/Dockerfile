FROM ghcr.io/puppeteer/puppeteer:17.1.3
COPY package*.json ./
RUN npm ci --omit=dev
COPY --chown=pptruser:pptruser . .
ENTRYPOINT ["node", "replayer.js"]