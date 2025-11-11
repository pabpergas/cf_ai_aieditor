# 🤖 AI Code Editor

AI-powered collaborative code editor built with Cloudflare Workers, Durable Objects, and OpenAI. The system enables real-time code editing with intelligent AI assistance, project management, GitHub integration, and WebContainer-based terminal execution.

## Demo

You can test the application at: https://noisy-tooth-c899.pabloperezgaspar.workers.dev

## System Overview

AI Code Editor is a serverless application that combines:

- **Frontend**: React 19 + TypeScript + TailwindCSS
- **Backend**: Cloudflare Workers (Edge Runtime)
- **Database**: Cloudflare D1 (SQLite) + Durable Objects
- **Storage**: Cloudflare R2 for file content
- **AI**: OpenAI GPT-4o via Cloudflare Agents SDK
- **Auth**: Better-auth with GitHub OAuth
- **Code Editor**: Monaco Editor
- **Terminal**: WebContainer API

## Key Features

- **AI-powered code editing** with automatic file manipulation
- **Monaco Editor** with full TypeScript support and IntelliSense
- **Multi-project management** with isolated user workspaces
- **GitHub repository cloning** (public and private with token)
- **WebContainer terminal** for running commands in browser
- **Real-time file tree updates** after AI modifications
- **Drag-and-drop file operations** with VS Code-style UX
- **Better Auth authentication** with secure GitHub OAuth
- **Per-project chat history** with automatic context switching
- **Build and preview system** for web projects

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- Cloudflare account
- OpenAI API key
- GitHub OAuth App

## Setup

### 1. Clone and Install

```bash
git clone <repository-url>
cd cf_ai_aieditor
npm install
```

### 2. Configure Environment Variables

Create a `.dev.vars` file in the root directory:

```env
OPENAI_API_KEY=your_openai_api_key_here
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
BETTER_AUTH_SECRET=your_random_secret_key
GITHUB_TOKEN=your_github_token  # Optional
```

### 3. Configure GitHub OAuth App

1. Go to https://github.com/settings/developers
2. Create a new OAuth App
3. Set the callback URLs:
   - Development: `http://localhost:8787/api/auth/callback/github`
   - Production: `https://your-domain.workers.dev/api/auth/callback/github`
4. Copy the Client ID and Client Secret to `.dev.vars`

### 4. Create and Setup Database

Run migrations locally:

```bash
npm run db:migrate
```

### 5. Add Secrets

Set your secrets for production deployment:

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put GITHUB_TOKEN  # Optional
```

## Development

Start the development server:

```bash
npm start
```

This starts the Cloudflare Workers local development server on http://localhost:8787

## Build

Build the project for production:

```bash
npm run build
```

This compiles:
- Frontend assets to `dist/`
- Server code with TypeScript

## Deploy

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

### First Deployment Checklist

- [ ] D1 database created and configured in `wrangler.jsonc`
- [ ] R2 bucket created for file storage
- [ ] KV namespace created for sessions
- [ ] Vectorize index created for embeddings
- [ ] Migrations run on remote database (`npm run db:migrate:prod`)
- [ ] All secrets added via `wrangler secret put`
- [ ] GitHub OAuth callback URL updated with production URL
- [ ] Build successful (`npm run build`)
- [ ] Deploy executed (`npm run deploy`)

## Project Structure

```
cf_ai_aieditor/
├── src/                    # Source code
│   ├── components/         # React components
│   │   ├── ai-chat/        # AI chat interface
│   │   ├── auth/           # Authentication components
│   │   ├── code-editor/    # Monaco code editor
│   │   ├── file-tree/      # File explorer
│   │   ├── terminal/       # WebContainer terminal
│   │   └── ...
│   ├── db/                 # Database schema
│   ├── lib/                # Auth and utilities
│   ├── code-tools.ts       # AI tools for file operations
│   ├── project-manager.ts  # Durable Object for projects
│   ├── build-runner.ts     # Build and preview system
│   ├── server.ts           # Main server and Chat agent
│   └── git-clone.ts        # Git repository cloning
├── drizzle/                # Database migrations
├── public/                 # Static assets
├── wrangler.jsonc          # Cloudflare configuration
└── package.json            # Dependencies
```

## How It Works

### Multi-Project System

Each user can create and manage multiple projects:

- **Create new project**: Start with an empty workspace
- **Clone from GitHub**: Import existing repositories (public or private)
- **Isolated storage**: Each project has its own file tree and content in R2
- **Per-project chat**: AI conversations are scoped to the active project

### AI Tools

The AI assistant has access to the following tools:

- `listFiles` - List all files in the project
- `readFile` - Read file contents
- `writeFile` - Create or completely replace a file
- `editFile` - Edit specific parts of a file (recommended for modifications)
- `createFile` - Create a new file or directory
- `deleteFile` - Delete a file or directory
- `moveFile` - Move a file to a different location
- `renameFile` - Rename a file or directory
- `searchInFiles` - Search for text across all files

### File Operations

The system supports full file management:

- **Drag-and-drop**: Move files between folders
- **Context menu**: Right-click for create, rename, delete options
- **Inline editing**: VS Code-style inline input for file creation
- **Real-time sync**: File tree updates automatically after AI operations

## Configuration Files

### wrangler.jsonc

Main Cloudflare Workers configuration. Key sections:

- `d1_databases`: D1 database binding for authentication
- `r2_buckets`: R2 bucket for file storage
- `kv_namespaces`: KV namespace for sessions
- `vectorize`: Vectorize index for code embeddings
- `durable_objects`: DO bindings (Chat, ProjectManager, BuildRunner)

### .dev.vars

Local development environment variables (not committed to git):

- `OPENAI_API_KEY`: OpenAI API key
- `GITHUB_CLIENT_ID`: GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET`: GitHub OAuth client secret
- `BETTER_AUTH_SECRET`: Better-auth encryption secret
- `GITHUB_TOKEN`: Optional GitHub personal access token

## Available Scripts

- `npm start` - Start development server
- `npm run deploy` - Build and deploy to Cloudflare
- `npm run db:generate` - Generate Drizzle migrations
- `npm run db:migrate` - Apply migrations to local D1
- `npm run db:migrate:prod` - Apply migrations to production D1
- `npm run db:studio` - Open Drizzle Studio
- `npm run types` - Generate TypeScript types from Wrangler
- `npm test` - Run tests
- `npm run format` - Format code with Prettier
- `npm run check` - Check code quality

## Troubleshooting

### Build errors

- Ensure Node.js version is 18 or higher
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`

### Database errors

- Verify `database_id` in `wrangler.jsonc` matches your D1 database
- Run migrations: `npm run db:migrate:prod`

### Deployment fails

- Check that resource IDs are set correctly in `wrangler.jsonc`
- Ensure you're logged in: `npx wrangler login`
- Verify all secrets are set: `npx wrangler secret list`

### AI not responding

- Verify OpenAI API key is set as secret
- Check Worker logs: `npx wrangler tail`

### WebContainer errors

- Ensure CORS headers are enabled (already configured in `server.ts`)
- Check browser console for `SharedArrayBuffer` errors

### Authentication issues

- Verify GitHub OAuth callback URL matches your deployment
- Check Better Auth secret is set correctly
- Ensure D1 migrations have been applied

## Documentation

- Cloudflare Workers: https://developers.cloudflare.com/workers/
- Cloudflare D1: https://developers.cloudflare.com/d1/
- Cloudflare R2: https://developers.cloudflare.com/r2/
- Cloudflare Durable Objects: https://developers.cloudflare.com/durable-objects/
- OpenAI API: https://platform.openai.com/docs/
- Better Auth: https://www.better-auth.com/
- WebContainer API: https://webcontainers.io/
