# AI Code Editor - Development Prompts

This document contains the actual prompts used to build this AI Code Editor project.

## Initial Development

### 1. Edit File Tool
```
I want that the ai can edit the files
```
**Result**: Created `editFile` tool in `code-tools.ts` for partial file modifications

### 2. GitHub Token Input
```
Add personal github token input
```
**Result**:
- Added GitHub Personal Access Token input field
- Implemented user token with server fallback
- Added link to create GitHub token

## Project Cleanup

### 3. Remove Unnecessary Files
```
Clean the project un used folders and files
```
**Result**:
- Removed `.cursor/`, `.claude/`, `.vscode/`, `.github/`, `tests/`
- Deleted unnecessary files (`nul`, `npm-agents-banner.svg`, etc.)
- Cleaned up project structure

## Bug Fixes

### 4. WebContainer Error Fix
```
Error initializing WebContainer: DataCloneError: Failed to execute 'postMessage' on 'Worker': SharedArrayBuffer transfer requires self.crossOriginIsolated.
```
**Result**:
- Added `Cross-Origin-Embedder-Policy: require-corp` header
- Added `Cross-Origin-Opener-Policy: same-origin` header
- Applied headers to ALL responses

