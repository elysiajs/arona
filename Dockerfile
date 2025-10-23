FROM oven/bun AS build

WORKDIR /app

# Cache packages installation
COPY package.json package.json
COPY bun.lock bun.lock


RUN bun install

COPY src src
COPY tsconfig.json tsconfig.json

ENV NODE_ENV=production

RUN apt update
RUN apt install -y git

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
COPY public public

ENV NODE_ENV=production

CMD ["./server"]

EXPOSE 3000
