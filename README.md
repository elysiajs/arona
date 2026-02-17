# <img src=https://github.com/user-attachments/assets/e7e2f885-29be-4eba-bb06-2c02ea90a56e alt=Arona width=36 /> Arona

Arona is Elysia's documentation search using AI with RAG

![Elysia search screenshot](https://github.com/user-attachments/assets/c8350ec5-dea0-4e04-9a5f-866b535877d1)

## What is
Standard RAG

When a user ask question, it will query the vector database to find the most relevant content, then use that content to answer the question

It clone Elysia documentation and index the content into embedding and BM25 index

The content will be chunked and vectorized then stored in Postgres
Indexing has diff awareness, it will only update the new content

Indexing process is automated by
1. Using webhook that triggers when Elysia documentation update
2. Cron for 6 hours as a fallback

## Why
1. Off the shelf RAG is expensive

We were looking for an API based RAG provider, but we couldn't find any that fit our needs and budget

Kapa, Mendable, and other RAG providers didn't tell the price upfront, and people said it can cost up to $1000 per month, which is not affordable for us, especially when we are still in early stage and need to be frugal with our expenses

We don't want to move to full API documentation provider because we have already invested in Vitepress and Vue ecosystem for building documentation, eg. Interactive Tutorial, Playground, etc

2. We have already invested in Vitepress

We don't want to lose all the benefits of having our own documentation site and move to a third party provider that may not have the same level of customization and control as we have now

Because all of this we decided to build our own RAG system, which is more cost effective and gives us more control over the data and the features we want to implement

There are several ways to build RAG but we choose a more cost effective way to do things

This also give us more freedom to customize the RAG system to fit our specific needs and use cases, rather than being limited by the features and capabilities of a third party provider

## How it works
1. User request a Proof of Work to prove that they are not a bot, this is to prevent abuse and spam
2. User send question alongside PoW, Turnstile token and checksum to prevent abuse
3. Question then normalized using a small model for semantic search and caching
4. Send question to main model for answering, it has tool for doing search and read page
5. Normalized question will be used to query using BM25 and vector search
6. The relevant content like normalized query, embedding, question-answer will be cached
7. The answer will be returned to the user, and also stored in the cache for future reference

We don't use reranking API because it's expensive

## Stack
Most of the stack is preferably self-hosted when possible:

- Elysia (obviously) - For building the API and backend
- ParadeDB - BM25 + Vector Search
- Dragonfly - Caching, Semantic Cache Search
- GPT OSS 120B - Main model for answering questions
- GPT OSS 20B - Query normalization for semantic search/caching
- OpenAI Embedding Small - Most cost effective embedding model for vector search
- Axiom - Logging and monitoring
- Turnstile - Proof of Work to prevent abuse and spam

See `.env.example` for required environment variables to setup

