# JARVIS — Human-Controlled AI Assistant

### AI automation with human control.

Jarvis is a personal AI agent designed to make everyday digital automation more transparent and controllable. It combines conversational AI, tool execution, persistent memory, scheduled tasks, and a risk-based approval system.

Built around a simple principle: **AI should assist users without taking away their control.**

---

## Overview

As AI assistants become capable of interacting with files, executing commands, and performing actions through external services, users need greater visibility into what these systems do on their behalf.

Uncontrolled automation can result in unintended file modifications, unauthorized external actions, and a lack of accountability.

Jarvis explores a safer approach by introducing risk-based tool permissions, human approval for sensitive operations, and an audit interface that records agent activity.

Users interact with Jarvis through Telegram or its web dashboard, while a central gateway coordinates AI requests and tool execution.

## Problem Statement

How can we make AI-powered automation safer while allowing users to benefit from the capabilities of autonomous AI agents?

Existing conversational interfaces primarily focus on generating responses. However, AI agents capable of performing real-world digital actions introduce additional risks:

- Users may not understand the consequences of an AI-requested action.
- External operations may be initiated without sufficient user oversight.
- File modifications and command execution can have unintended consequences.
- Users may lack visibility into the actions performed by their agents.

There is a need for an AI assistant that combines automation with transparency, accountability, and human control.

## Proposed Solution

Jarvis introduces a risk-based permission architecture that classifies tool operations according to their potential impact.

Instead of allowing every requested action to execute automatically, the system requires explicit human approval for outbound and execution operations.

The platform provides:

- Conversational interaction through Telegram.
- A centralized web dashboard.
- Risk-based tool permissions.
- Human approval for sensitive actions.
- An audit trail of tool activity.
- Persistent memory for useful information.
- Scheduled automation through configurable jobs.

## Key Features

### 1. Telegram AI Assistant

Interact with Jarvis through a Telegram bot.

- Send natural-language requests.
- Receive AI-generated responses.
- Request supported tool operations.
- Access commands such as `/brief` and `/help`.

### 2. Risk-Based Permission System

Jarvis categorizes tool operations into four risk levels.

| Risk | Description | Execution |
|---|---|---|
| Read | Retrieves information | Automatic |
| Write | Modifies local information | Automatic |
| Outbound | Interacts with external services | Requires approval |
| Exec | Executes system commands | Requires approval |

This classification provides a structured way to control potentially sensitive agent operations.

### 3. Human-in-the-Loop Approvals

Sensitive operations are placed in an approval queue instead of executing immediately.

Users can:

- Inspect the requested operation.
- Review its parameters.
- Approve or deny the request.
- Monitor its execution status.

For example, an email draft request is classified as an outbound action and requires approval before execution.

### 4. Web Dashboard

A centralized interface for monitoring and managing the assistant.

| Dashboard page | Purpose |
|---|---|
| Overview | Gateway activity, sessions, approvals, jobs and memory |
| Chat | Direct interaction with the agent |
| Approvals | Review pending sensitive operations |
| Memory | Browse stored information |
| Audit | Inspect recorded tool activity |
| Jobs | Manage scheduled automation |
| Skills | View locally available skills |
| Settings | Configure the assistant and tool permissions |

### 5. Memory Management

Jarvis supports persistent memory through its memory tools.

Users can ask the assistant to remember useful information and retrieve previously stored context in later interactions.

### 6. Audit and Activity Monitoring

The audit interface records tool activity, providing visibility into:

- Tool names.
- Request sources.
- Risk classifications.
- Timestamps.
- Execution statuses.

This helps users understand and monitor the assistant's behaviour.

### 7. Scheduled Automation

Jarvis includes a cron-based scheduler with configurable jobs.

The initial configuration includes:

- Daily brief — 07:00.
- Follow-up sweep — 18:00.

Jobs can be enabled or disabled through the dashboard.

---

## System Architecture

```text
                 USER
                   |
          +--------+--------+
          |                 |
       Telegram         Web Dashboard
          |                 |
          +--------+--------+
                   |
              Jarvis Gateway
                   |
             AI Model Provider
                   |
            Request Processing
                   |
             Tool Selection
                   |
           Risk Classification
                   |
       +-----------+-----------+
       |           |           |
      READ        WRITE     OUTBOUND / EXEC
       |           |           |
    Automatic   Automatic   Approval Queue
                               |
                        Human Decision
                         /          \
                     Approve        Deny
                        |
                  Tool Execution
                         |
                    Audit Log
```

The gateway coordinates communication between the interfaces, AI provider, and available tools.

## Technology Stack

The project uses the following technologies and components:

- **Runtime:** Node.js
- **Package management:** pnpm
- **Language:** TypeScript / JavaScript
- **AI integration:** Configurable AI model provider through an OpenAI-compatible interface
- **Messaging:** Telegram Bot API
- **Backend:** Local gateway and tool execution system
- **Frontend:** Web dashboard
- **Scheduling:** Cron-based job scheduler
- **Memory:** Persistent local memory system
- **Configuration:** Local JSON configuration and environment variables

Refer to the project source for the exact package-level dependencies.

## Getting Started

### Prerequisites

- Node.js 22 or compatible supported version.
- pnpm.
- Git.
- Telegram account (optional, for Telegram interaction).
- An API key for a supported AI model provider.

### 1. Clone the repository

```bash
git clone https://github.com/atmakurakhil/Jarvis.git
cd Jarvis
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Run the onboarding process

```bash
node packages/cli/dist/index.js onboard
```

Follow the prompts to configure the assistant.

### 4. Configure environment variables

Jarvis reads API keys from environment variables rather than storing them directly in its configuration.

Example PowerShell configuration:

```powershell
$secure = Read-Host "Enter AI API key" -AsSecureString
$env:OPENAI_COMPAT_API_KEY = [System.Net.NetworkCredential]::new("", $secure).Password

$secure = Read-Host "Enter Telegram bot token" -AsSecureString
$env:TELEGRAM_BOT_TOKEN = [System.Net.NetworkCredential]::new("", $secure).Password
```

Keep credentials private. Do not commit API keys, bot tokens, or other secrets to GitHub.

### 5. Start Jarvis

```bash
node packages/cli/dist/index.js start
```

The gateway listens locally at:

```text
http://127.0.0.1:4820
```

### 6. Access the dashboard

When the dashboard is running, open:

```text
http://localhost:3300
```

Pair the dashboard with the local gateway using the CLI-generated authentication token.

**Note:** The Telegram bot, AI provider, and dashboard require their respective configurations. Some integrations also require separate authentication.

---

## Example Interaction

A user can interact with Jarvis using natural-language requests.

**Remember project information**

```text
Remember that Jarvis is a personal AI assistant
with Telegram and a web dashboard.
```

**Read a local file**

```text
Read demo-note.txt and tell me what it contains.
Do not modify anything.
```

**Request an external action**

```text
Prepare an email draft for test@example.com.
Do not create it until I approve.
```

For the third request, Jarvis classifies the operation as outbound and places it in the approval queue.

---

## Safety and Security Considerations

Safety is a central design consideration in Jarvis.

Current safeguards include:

- Risk classification for tool operations.
- Explicit approval for outbound and execution operations.
- Local gateway binding to `127.0.0.1`.
- Bearer-token authentication for gateway access.
- Environment-based API key configuration.
- Audit logging of tool activity.
- Telegram responses restricted to the configured chat ID.

### Known Limitations

Jarvis is a prototype, not a complete security sandbox.

- Gmail OAuth authentication must be configured before Gmail operations can succeed.
- External integrations require their own credentials and configuration.
- Shell execution runs with the permissions of the gateway's operating-system user; it is not isolated in a separate operating-system sandbox.
- Approval controls reduce unintended execution but do not guarantee protection against every unsafe action.
- The effectiveness of memory and tool execution depends on the configured AI provider and available integrations.

These limitations are important when evaluating the security properties of the prototype.

## SafeSpace Hacks — Safer Outcome

**Intended users:** Individuals using AI assistants for everyday digital tasks.

**Risk addressed:** Unintended or insufficiently understood actions performed by AI agents.

**Practical improvement:** Users can review potentially sensitive operations before authorizing their execution.

**Example safer outcome:** When a user requests an external email operation, Jarvis places it in an approval queue rather than immediately performing the action.

**Limitation:** The current prototype demonstrates approval and monitoring controls, but does not provide complete operating-system isolation or guarantee that every unsafe action will be detected.

## Demo

The demonstration covers:

1. Telegram interaction with Jarvis.
2. Memory storage and retrieval.
3. Web dashboard monitoring.
4. Risk classification and approval requests.
5. Audit logging.
6. Scheduled jobs and configuration.

**Demo video:** [Add your recorded video link here]

**Screenshots:** Add screenshots of the Overview, Chat, Approvals, Memory, Audit, Jobs, and Settings pages.

## Development and Attribution

Jarvis is based on the existing open-source project:

**Original repository:** https://github.com/atmakurakhil/Jarvis

This submission uses the existing project as its foundation. Any configurations, modifications, integrations, testing, and additional features developed for the SafeSpace Hacks build should be documented separately.

Third-party libraries, original project components, datasets, assets, and AI-assisted contributions should be credited appropriately.

## Future Improvements

- Stronger isolation for command execution.
- More detailed explanations of action risks.
- Granular user-configurable permission policies.
- Safer previews of file modifications.
- Additional authentication and authorization controls.
- Improved integration testing.
- Expanded audit and security monitoring.

## License

Refer to the original repository's license and retain the applicable attribution and license requirements for redistributed components.

---

### Jarvis
**AI automation with human control.**