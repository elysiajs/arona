FROM oven/bun AS build

WORKDIR /app

RUN apt update
RUN apt install -y git

# Cache packages installation
COPY package.json package.json
COPY bun.lock bun.lock

RUN bun install

COPY src src
COPY tsconfig.json tsconfig.json
COPY scripts/build.ts scripts/build.ts

ENV NODE_ENV=production

RUN bun run build

FROM gcr.io/distroless/base

WORKDIR /app

COPY --from=build /app/dist/src server
COPY public public

ENV NODE_ENV=production

CMD ["./server"]

EXPOSE 3000
