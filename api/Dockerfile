FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=10000
COPY --chown=node:node package.json server.js order-utils.js order-read.js pixel-manager.js catalog.json launch-readiness.js btcpay-test-invoice.js ./
USER node
EXPOSE 10000
CMD ["node", "server.js"]
