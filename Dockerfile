FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache unzip

COPY ["portfolio-xoft-dbrij-no-card (1).zip", "/tmp/portfolio.zip"]

RUN mkdir -p /tmp/portfolio-source \
    && unzip -q /tmp/portfolio.zip -d /tmp/portfolio-source \
    && PACKAGE_JSON="$(find /tmp/portfolio-source -type f -name package.json -not -path '*/node_modules/*' | head -n 1)" \
    && test -n "$PACKAGE_JSON" \
    && cp -a "$(dirname "$PACKAGE_JSON")"/. /app/ \
    && npm install --omit=dev --no-audit --no-fund

ENV NODE_ENV=production

CMD ["npm", "start"]
