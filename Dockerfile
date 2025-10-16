FROM oven/bun AS build

WORKDIR /app

# Cache packages installation
COPY package.json package.json
COPY bun.lock bun.lock
COPY scripts scripts

RUN bun install
RUN bun db:setup

COPY src src
COPY tsconfig.json tsconfig.json

ENV NODE_ENV=production

RUN bun build \
	--compile \
	--target bun-linux-x64 \
	--minify-whitespace \
	--minify-syntax \
	--outfile server \
	src/index.ts

FROM gcr.io/distroless/base

WORKDIR /app

COPY --from=build /app/server server

ENV NODE_ENV=production

CMD ["./server"]

EXPOSE 80
