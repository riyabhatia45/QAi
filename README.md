# 🤖 Agentic Playwright Framework

An AI-powered, **self-healing test automation framework** built on top of Playwright. This framework addresses the common problem of flaky E2E tests by adding an intelligent recovery layer that automatically repairs broken selectors and navigates past unexpected UI states.

---

## 🌟 Key Features

- **Self-Healing Selectors**: If a selector fails (due to UI changes, ID renames, or structural updates), an AI agent analyzes the page's live DOM and accessibility tree to find a matching alternative.
- **AI as Fallback**: The framework prioritizes deterministic Playwright actions. AI agents only intervene when a failure is detected, maintaining high execution speed.
- **Safety Governance**: A **Policy Engine** gates every healing decision with confidence thresholds, ensuring only reliable fixes are applied.
- **Learning System**: Successful heals are cached in a **Selector Memory Store**, allowing the framework to "learn" from its previous repairs and avoid redundant AI calls.
- **Detailed Reporting**: Generates comprehensive JSON and Markdown reports for every healing event, including "before" and "after" screenshots.
- **Flexible Execution Modes**: 
  - `strict`: High confidence threshold (ideal for CI/CD).
  - `adaptive`: Medium confidence allowed (ideal for local development and nightly regression).

---

## 🏗️ Architecture Overview

The framework is structured into five cohesive layers:

1.  **Execution Core**: Wraps Playwright actions and manages the healing loop.
2.  **AI Agents**: Specialized agents for selector recovery, flow recovery, and assertion verification.
3.  **Tools**: Gathers contextual information like DOM snapshots, accessibility trees, and screenshots.
4.  **Memory**: Persistent storage for learned selectors and recovery plans.
5.  **Telemetry**: Event-driven reporting system for full visibility into healing actions.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- An AI provider API key (Google Gemini, OpenAI, or Groq)

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd riya_ai
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Configure environment variables:
    Copy `.env.example` to `.env` and provide your API keys:
    ```bash
    cp .env.example .env
    ```

### Configuration

Edit the `.env` file to set your preferred AI provider and model:

```env
AI_PROVIDER=google
GOOGLE_API_KEY=your-gemini-api-key
AI_SELECTOR_MODEL=gemini-2.0-flash
HEAL_MODE=adaptive
```

---

## 🧪 Running Tests

The framework provides several scripts to run tests in different environments and modes.

### Run All Tests
```bash
npm test
```

### Run specific tests with Heading
```bash
# General
npm run test:login
npm run test:checkout
npm run test:login-form
npm run test:fixture

# Showcase scenarios (specifically designed to trigger self-healing)
npm run test:showcase
```

### Run in Specific Heal Modes
- **Strict Mode** (No medium-confidence healing):
  ```bash
  npm run test:strict
  ```
- **Adaptive Mode** (Allows medium-confidence healing):
  ```bash
  npm run test:adaptive
  ```

### Generate and View Reports
After running tests, you can view the standard Playwright report:
```bash
npm run report
```

Playwright execution artifacts such as videos, screenshots, and traces are stored under `test-results/playwright-artifacts/`. By default, videos are retained for failed tests, and the CI workflow uploads them as downloadable artifacts.

To regenerate the static dashboard payload that GitHub Pages reads:
```bash
npm run dashboard:data
```

### Sync Heals to Source Code
Once you are happy with the healed selectors stored in memory, you can automatically update your test files:
```bash
npm run sync-heals
```
This will replace the broken selectors in your `.spec.js` files with the high-confidence alternatives found by the AI.

### Resetting Healing Memory
To force the AI to re-analyze failures (e.g., after updating your models or prompts), you can clear the stored memory:
```bash
# On Windows
del test-results\selector-memory.json

# On Mac/Linux
rm test-results/selector-memory.json
```

---

## 🩹 Healing Reports & Artifacts

When a test heals, artifacts are generated in the `test-results/healing-artifacts/` directory. Each healing event includes:
- **`healing-report.md`**: A detailed summary of the failure and the AI's recovery decision.
- **`before_heal.png`**: Screenshot of the page at the moment of failure.
- **`after_heal.png`**: Screenshot illustrating the successful recovery.
- **`healing-report.json`**: Technical details of the healing event for integration purposes.

CI converts these artifacts into `dashboard/public/data/dashboard-data.json` and publishes the dashboard on GitHub Pages for runs on `main`.

---

## 📂 Project Structure

- `src/core`: Test Orchestrator and Policy Engine.
- `src/agents`: AI Agents for Selector and Flow recovery.
- `src/tools`: Context gathering tools (DOM, AX Tree, Screenshots).
- `src/memory`: Storage for learned selectors and recovery plans.
- `tests/e2e`: End-to-end test specifications.
- `config`: Framework and policy configuration files.

---

## 📜 Contributing
Refer to the `FRAMEWORK_DEEP_DRIVE.md` for a technical deep-dive into the framework's internal workings.
