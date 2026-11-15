FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache unzip

COPY ["portfolio-xoft-dbrij-no-card (1).zip", "/tmp/portfolio.zip"]

RUN mkdir -p /tmp/portfolio-source \
    && unzip -q /tmp/portfolio.zip -d /tmp/portfolio-source \
    && PACKAGE_DIR="$(find /tmp/portfolio-source -type f -name package.json -not -path '*/node_modules/*' -printf '%h\\n' | head -n 1)" \
    && test -n "$PACKAGE_DIR" \
    && cp -a "$PACKAGE_DIR"/. /app/ \
    && npm install --omit=dev --no-audit --no-fund

ENV NODE_ENV=production

CMD ["npm", "start"]
