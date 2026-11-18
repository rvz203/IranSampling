FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY . .
ARG API_URL=http://api:8080
ENV API_URL=$API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN addgroup -S sampling && adduser -S sampling -G sampling
COPY --from=build --chown=sampling:sampling /app/.next/standalone ./
COPY --from=build --chown=sampling:sampling /app/.next/static ./.next/static
COPY --from=build --chown=sampling:sampling /app/public ./public
USER sampling
EXPOSE 3000
CMD ["node", "server.js"]
