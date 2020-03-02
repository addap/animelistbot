FROM node:erbium as builder

WORKDIR /opt/animelistbot

COPY ./package*.json ./
COPY ./tsconfig.json ./
COPY ./src ./src

RUN npm ci && npm run tsc

# Production stage
FROM node:erbium-alpine3.11

WORKDIR /animelistbot/

COPY ./package*.json ./
COPY .env .env

RUN apk add --update git && npm ci --only=prod

COPY --from=builder /opt/animelistbot/build ./build

EXPOSE 443

CMD ["npm", "start"]