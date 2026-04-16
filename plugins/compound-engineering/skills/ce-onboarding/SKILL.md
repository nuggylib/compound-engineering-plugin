---
name: ce-onboarding
description: "Generate or regenerate ONBOARDING.md to help new contributors understand a codebase. Use when the project needs onboarding documentation or an existing onboarding doc needs updating."
---

# Generate Onboarding Document

Crawl a repository and generate `ONBOARDING.md` at the repo root. Always regenerate from scratch -- if `ONBOARDING.md` already exists, overwrite it.

## When to Use

Trigger when the user:
- Says "create onboarding docs", "generate ONBOARDING.md", "write onboarding documentation", "vonboard", or "vonboarding"
- Says "document this project for new developers" or "prepare this repo for a new contributor"
- Says "refresh the onboarding doc" or "update ONBOARDING.md"
- Wants to onboard a new team member and needs a written artifact
- Has a codebase that lacks onboarding documentation

## Core Principles

1. **Write for humans first** -- Clear prose a new developer can read and understand. Agent utility is a side effect, not a separate goal.
2. **Show, don't just tell** -- Use ASCII diagrams for architecture and flow, markdown tables for structured information, and backtick formatting for all file paths, commands, and code references.
3. **Six sections, each earning its place** -- Every section answers a question a new contributor will ask in their first hour. No speculative sections. Section 2 may be skipped for pure infrastructure with no consuming audience.
4. **State what you can observe, not what you must infer** -- Do not fabricate design rationale or assess fragility. If the code doesn't reveal why a decision was made, don't guess.
5. **Never include secrets** -- Never include API keys, tokens, passwords, connection strings with credentials, or any other secret values. Reference environment variable *names* (`STRIPE_SECRET_KEY`), never their *values*. If a `.env` file contains actual secrets, extract only the variable names. <!-- why: ONBOARDING.md is committed to the repo, so secrets would leak -->
6. **Link, don't duplicate** -- When existing documentation covers a topic well, link to it inline rather than re-explaining.

## Execution Flow

### Phase 1: Gather Inventory

Run the bundled inventory script (`scripts/inventory.mjs`):

```bash
node scripts/inventory.mjs --root .
```

Parse the JSON output. It provides:
- Project name, languages, frameworks, package manager, test framework
- Directory structure (top-level + one level into source directories)
- Entry points per detected ecosystem
- Available scripts/commands
- Existing documentation files (with first-heading titles for triage)
- Test infrastructure
- Infrastructure and external dependencies (env files, docker services, detected integrations)
- Monorepo structure (if applicable)

If the script fails or returns an error field, report the issue to the user and stop. Do not attempt to write `ONBOARDING.md` from incomplete data.

### Phase 2: Read Key Files

Guided by the inventory, read files essential for understanding the codebase.

Read files in parallel batches where there are no dependencies between them (e.g., batch README.md, entry points, and AGENTS.md/CLAUDE.md together).

Only read files whose content is needed to write the six sections with concrete detail. The inventory already provides structure, languages, frameworks, scripts, and entry point paths -- do not re-read files to confirm inventory data. Let the sections drive what to read, not an arbitrary count.

**Priority order:**

1. **README.md** (if exists) -- project purpose and setup instructions
2. **Primary entry points** -- files listed in `entryPoints` from the inventory
3. **Route/controller files** -- `routes/`, `app/controllers/`, `src/routes/`, `src/api/`, or similar directories from the inventory structure; read the main route file
4. **Configuration files** -- `docker-compose.yml`, `.env.example`, `.env.sample`, database config, `next.config.*`, `vite.config.*`, or similar. Only read if they exist in the inventory. **Never read `.env` itself** -- only `.env.example` or `.env.sample` templates. Extract variable names only, never values.
5. **AGENTS.md or CLAUDE.md** (if exists) -- project conventions and patterns
6. **Discovered documentation** -- the inventory's `docs` list includes each file's title (first heading). Use titles to decide relevance without reading first. Only read full content of docs whose titles indicate direct relevance. Skip dated brainstorm/plan files unless the focus hint specifically calls for them.

Do not read files speculatively. Every file read must be justified by inventory output and traceable to a section that needs it.

### Phase 3: Write ONBOARDING.md

Synthesize the inventory data and key file contents into the sections defined below. Write the file to the repo root.

**Title**: `# {Project Name} Onboarding Guide`. Derive the project name from the inventory. Do not use the filename as a heading.

**Writing style -- a knowledgeable teammate explaining the project over coffee, not generated documentation.**

Voice and tone:
- Second person ("you"), active voice, present tense
- Lead sentences with what matters: "Run `bun dev` to start the server" not "In order to start the development server, you will need to run the following command"
- Match the formality of the codebase. Read the README and existing docs for tone cues.

Clarity:
- Every sentence must teach or instruct. Cut any that doesn't.
- Prefer concrete over abstract: "`src/services/billing.ts` charges the customer's card" not "The billing module handles payment-related business logic"
- Define terms immediately in context, not in a glossary.
- Use the simplest accurate word. "Use" not "utilize." "Start" not "initialize."

What to avoid:
- Filler: "It's important to note that", "As mentioned above", "In this section we will"
- Vague summarization: "This module handles various aspects of..." -- say specifically what it does
- Hedge words when stating facts: "This essentially serves as", "This is basically"
- Superlatives: "robust", "powerful", "comprehensive", "seamless"
- Meta-commentary: "This document aims to..."

**Formatting requirements -- apply consistently throughout:**
- Use backticks for all file names (`package.json`), paths (`src/routes/`), commands (`bun test`), function/class names, environment variables, and technical terms
- Use markdown headers (`##`) for each section
- Use ASCII diagrams and markdown tables where specified below
- Use bold for emphasis sparingly
- Keep paragraphs short -- 2-4 sentences

**Section separators** -- Insert a horizontal rule (`---`) between each `##` section.

**Width constraint for code blocks -- 80 columns max.** <!-- why: code blocks render with white-space:pre and never wrap, causing horizontal scrolling --> Tables are fine -- markdown renderers wrap them. Apply these rules to all content inside ``` fences:

- **ASCII architecture diagrams**: Stack boxes vertically. Max 2 boxes on the same horizontal line, each label under 20 characters.
- **Flow diagrams**: Keep file path + annotation under 80 chars. Move long descriptions to the next line.
- **Directory trees**: Keep inline `# comments` under 30 characters. Use brief role descriptions ("Editor plugins") not exhaustive lists.

#### Section 1: What Is This?

Answer: What does this project do, who is it for, and what problem does it solve?

Draw from `README.md`, manifest descriptions (e.g., `package.json` description field), and entry points.

If purpose cannot be determined from the code, state that plainly: "This project's purpose is not documented. Based on the code structure, it appears to be..."

Keep to 1-3 paragraphs.

#### Section 2: How It's Used

Answer: What does it look like to be on the consuming side of this project?

Title this section based on who consumes the project:

- **End-user product** (web app, mobile app, consumer tool) -- Title: **"User Experience"**. Describe what the user sees and the primary workflows. Draw from routes, entry points, and README.
- **Developer tool** (SDK, library, dev CLI, framework) -- Title: **"Developer Experience"**. Describe installation, a minimal usage example, and the 2-3 most common commands or patterns. <!-- why: distinct from Section 6 (Developer Guide) which covers contributing to the codebase; this covers using what the codebase produces -->
- **Both** (platform with a consumer-facing product AND a developer API/SDK) -- Title: **"User and Developer Experience"**. Cover both perspectives, starting with end-user then developer-facing.

Keep to 1-3 paragraphs or a short flow per audience. If comprehensive docs exist, link to them and summarize key workflows. Do not duplicate existing documentation.

Skip this section only for codebases with no consuming audience (pure infrastructure, internal deployment tooling).

---

#### Section 3: How Is It Organized?

Answer: What is the architecture, what are the key modules, how do they connect, and what does the system depend on externally?

**System architecture** -- Two diagram types; system complexity determines whether to use one or both:

1. **Architecture diagram** -- Components, connections, protocols/transports. Label edges with interaction types (HTTP, WebSocket, bridge, queue, etc.). User-facing surfaces at top, internal plumbing in middle, data stores and external services at bottom.

2. **User interaction flow** -- The logical journey a user takes through the product: sequence of actions and system responses.

**When to use one vs. both:**
- Straightforward systems (single web app, CLI tool, simple API): architecture diagram only.
- Multi-surface products (native app + web + API, or multiple distinct user types): include both.

Use vertical stacking to keep diagrams under 80 columns.

Architecture diagram example:

```
       User / Browser
            |
            |  HTTP / WebSocket
            v
+------------------+    bridge    +------------------+
| Browser Client   |<----------->| Native macOS App |
| (Vite bundle)    |             | (Swift/WKWebView)|
+--------+---------+             +--------+---------+
         |                                |
         |  WebSocket                     |  bridge
         v                               v
+------------------------------------------+
|            Express Server                |
|  routes -> services -> models            |
+--------------------+---------------------+
                     |
                     |  SQL / Yjs sync
                     v
              +--------------+
              | SQLite + Yjs |
              +--------------+
```

User interaction flow example (same system, different lens):

```
User opens app
  |
  v
Writes/edits document
  (Milkdown editor)
  |
  v
Changes sync in real-time
  (Yjs CRDT)
  |                \
  v                 v
Document persists   Other connected
  to SQLite         clients see edits
  |
  v
User shares doc
  -> generates link
  |
  v
Recipient opens
  in browser client
```

Skip both for simple projects where the directory tree suffices.

**Internal structure** -- Include an ASCII directory tree showing the high-level layout:

```
project-name/
  src/
    routes/       # HTTP route handlers
    services/     # Business logic
    models/       # Data layer
  tests/          # Test suite
  config/         # Environment and app configuration
```

Annotate directories with their role. Skip build artifacts, config files, and boilerplate.

When modules have clear responsibilities, present them in a table:

```
| Module | Responsibility |
|--------|---------------|
| `src/routes/` | HTTP request handling and routing |
| `src/services/` | Core business logic |
| `src/models/` | Database models and queries |
```

Describe how the modules connect -- call relationships and data flow.

**External dependencies and integrations** -- Surface everything the system talks to outside its own codebase. Look for signals in:
- `docker-compose.yml` (databases, caches, message queues)
- Environment variable references in config files or `.env.example`
- Import statements for client libraries (database drivers, API SDKs, cloud storage)
- The inventory's detected frameworks (e.g., Prisma implies a database)

Present as a table when there are multiple dependencies:

```
| Dependency | What it's used for | Configured via |
|-----------|-------------------|---------------|
| PostgreSQL | Primary data store | `DATABASE_URL` |
| Redis | Session cache and job queue | `REDIS_URL` |
| Stripe API | Payment processing | `STRIPE_SECRET_KEY` |
| S3 | File uploads | `AWS_*` env vars |
```

If no external dependencies are detected, state: "This project appears self-contained with no external service dependencies."

#### Section 4: Key Concepts and Abstractions

Answer: What vocabulary and patterns does someone need to understand to talk about this codebase?

**Domain terms** -- Project-specific vocabulary: entity names, API resource names, database tables, configuration concepts, and jargon a new reader would not recognize.

**Architectural abstractions** -- Structural patterns that shape code organization and change-making.

Examples:
- "Business logic lives in the service layer (`src/services/`), not in route handlers"
- "Authentication runs through middleware in `src/middleware/auth.ts` before every protected route"
- "Database access uses the repository pattern -- each model has a corresponding repository class"
- "Background jobs are defined in `src/jobs/` and dispatched through a Redis-backed queue"

Present both domain terms and abstractions in a single table:

```
| Concept | What it means in this codebase |
|---------|-------------------------------|
| `Widget` | The primary entity users create and manage |
| `Pipeline` | A sequence of processing steps applied to incoming data |
| Service layer | Business logic in `src/services/`, not handlers |
| Middleware chain | Requests flow through `src/middleware/` first |
```

Aim for 5-15 entries. Include only concepts that would confuse a new reader or represent non-obvious architectural decisions. Skip universally understood terms.

#### Section 5: Primary Flows

Answer: What happens when the main things this app does actually happen?

Trace one flow per distinct surface or user type (a "surface" = a meaningfully different entry path: native app, web UI, API consumer, CLI user). Each flow must reveal architecture not covered by previous flows. Stop when the next flow would retrace files already shown.

Let the architecture drive the count: one flow for a simple CLI, two for a full-stack app, three for multi-surface products.

Include an ASCII flow diagram for the primary flow:

```
User Request
  |
  v
src/routes/widgets.ts
  validates input, extracts params
  |
  v
src/services/widget.ts
  applies business rules, calls DB
  |
  v
src/models/widget.ts
  persists to PostgreSQL
  |
  v
Response (201 Created)
```

Reference the specific file path at each step. Keep file path + annotation under 80 characters -- put the annotation on the next line if needed (as shown above).

Additional flows: use a numbered list if the first diagram already establishes the structural pattern.

#### Section 6: Developer Guide

Answer: How do I set up the project, run it, and make common changes?

Cover these areas:

1. **Setup** -- Prerequisites, install steps, environment config. Draw from README and the inventory's scripts. Format commands in code blocks:
   ```
   bun install
   cp .env.example .env
   bun dev
   ```

2. **Running and testing** -- How to start the dev server, run tests, lint. Use the inventory's detected scripts.

3. **Common change patterns** -- Where to go for the 2-3 most common types of changes. For example:
   - "To add a new API endpoint, create a route handler in `src/routes/` and register it in `src/routes/index.ts`"
   - "To add a new database model, create a file in `src/models/` and run `bun migrate`"

4. **Key files to start with** (for complex projects) -- A table mapping areas to specific entry-point files with a brief "why start here" note:

   ```
   | Area | File | Why |
   |------|------|-----|
   | Editor core | `src/editor/index.ts` | All editor wiring |
   | Data model | `src/formats/marks.ts` | The annotation system everything builds on |
   | Server entry | `server/index.ts` | Express app setup and route mounting |
   ```

   Skip for projects with fewer than ~10 source files.

5. **Practical tips** (for complex projects) -- Surface areas that are particularly large, complex, or have non-obvious gotchas as brief contributor tips:
   - "The editor module is ~450KB. Most behavior is wired through plugins in `src/editor/plugins/` -- understand the plugin architecture before making editor changes."
   - "The collab subsystem has many guards and epoch checks. Read the test names to understand what invariants are maintained."

   Skip for simple projects.

#### Inline Documentation Links

While writing each section, check whether any file from the inventory's `docs` list is directly relevant. If so, link inline:

> Authentication uses token-based middleware -- see [`docs/solutions/auth-pattern.md`](docs/solutions/auth-pattern.md) for the full pattern.

Do not create a separate references section. Do not mention the absence of relevant docs.

### Phase 4: Quality Check

Verify before writing:

- [ ] Every section answers its question without padding or filler
- [ ] No secrets, API keys, tokens, passwords, or credential values anywhere in the document
- [ ] No fabricated design rationale ("we chose X because...")
- [ ] No fragility or risk assessments
- [ ] File paths referenced in the document correspond to real files from the inventory
- [ ] All file names, paths, commands, code references, and technical terms use backtick formatting
- [ ] Document title uses "# {Project Name} Onboarding Guide" format, not the filename
- [ ] System-level architecture diagram included for multi-surface projects (skipped for simple libraries/CLIs)
- [ ] All code block content (diagrams, trees, flow traces) fits within 80 columns
- [ ] ASCII diagrams are present in the architecture and/or primary flow sections
- [ ] One flow per distinct surface or user type (architecture drives the count, not an arbitrary number)
- [ ] External dependencies and integrations are surfaced in the architecture section (or explicitly noted as absent)
- [ ] Tables are used for module responsibilities, domain terms/abstractions, and external dependencies
- [ ] Markdown styling is consistent throughout (headers, bold, code blocks, tables)
- [ ] Existing docs are linked inline only where directly relevant
- [ ] Writing is direct and concrete -- no filler, no hedge words, no meta-commentary about the document
- [ ] Tone matches the codebase (casual for scrappy projects, precise for enterprise)
- [ ] "How It's Used" section present with title adapted to audience (User Experience / Developer Experience / both), skipped only for pure infrastructure with no consuming audience
- [ ] Architecture diagram has labeled edges (protocols/transports) and includes a user interaction flow diagram when the system has multiple surfaces or user types

Write the file to the repo root as `ONBOARDING.md`.

### Phase 5: Present Result

After writing, inform the user that `ONBOARDING.md` has been generated. Offer next steps via the platform question tool (AskUserQuestion / request_user_input / ask_user). Fallback: present numbered options.

Options:
1. Open the file for review
2. Share to Proof
3. Done

Based on selection:
- **Open for review** -> Open `ONBOARDING.md` using the current platform's file-open or editor mechanism
- **Share to Proof** -> Upload the document:
  ```bash
  CONTENT=$(cat ONBOARDING.md)
  TITLE="Onboarding: <project name from inventory>"
  RESPONSE=$(curl -s -X POST https://www.proofeditor.ai/share/markdown \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg title "$TITLE" --arg markdown "$CONTENT" --arg by "ai:compound" '{title: $title, markdown: $markdown, by: $by}')")
  PROOF_URL=$(echo "$RESPONSE" | jq -r '.tokenUrl')
  ```
  Display `View & collaborate in Proof: <PROOF_URL>` if successful, then return to options
- **Done** -> No further action
