# Technical PPT Outline

This outline is grounded in the current repository implementation. It is written for a technical leadership or architecture audience, but the tone is suitable for senior management review.

## Positioning Guidance

- Present this as a self-healing Playwright framework for web UI automation, not as a universal autonomous testing platform.
- Emphasize controlled AI fallback, policy gating, and auditability.
- Avoid claiming that every UI failure can be healed automatically.
- Avoid claiming quantified productivity or cost outcomes unless you validate them separately from dashboard assumptions.

---

## Slide 1: Title and Framing

**Slide title:** Self-Healing Test Automation Framework: Technical Overview

**What this slide should do:** Establish the problem and the architectural intent in one slide.

**Slide content:**

- AI-assisted test automation framework built on Playwright
- Designed to reduce disruption from UI locator breakage and minor flow drift
- Combines deterministic execution with governed AI fallback
- Generates evidence artifacts and stores successful recoveries for reuse

**Content snippet:**

"This framework extends standard Playwright execution with a controlled recovery layer. When a scripted action fails, the system first retries deterministically, then uses contextual AI analysis to propose recovery options, and finally applies policy checks before any change is used."

**Suggested visual:**

- One-line architecture ribbon: `Playwright Execution -> Recovery Agents -> Policy -> Memory -> Reporting`

---

## Slide 2: Why the Framework Exists

**Slide title:** Problem Statement

**What this slide should do:** Explain the technical pain point without overstatement.

**Slide content:**

- Conventional UI tests fail when selectors drift or page state changes unexpectedly
- Failures often require manual diagnosis even when the application is still functionally correct
- Teams lose time distinguishing real defects from automation maintenance issues
- The framework targets this gap by adding a recovery and governance layer around standard test execution

**Content snippet:**

"The framework is aimed at a practical problem: UI automation becomes brittle when element attributes, labels, or layouts change. Instead of failing immediately on the first locator mismatch, this design adds a controlled mechanism to assess whether the action can be recovered safely."

---

## Slide 3: Architecture at a Glance

**Slide title:** Core Architecture

**What this slide should do:** Introduce the major modules and their responsibilities.

**Slide content:**

- Execution core: `src/core/test-orchestrator.js`
- Safety and decisioning: `src/core/policy-engine.js`
- Recovery agents: selector recovery and flow recovery
- Context tools: DOM snapshot, accessibility tree, screenshot, network capture
- Memory layer: selector memory and flow memory
- Telemetry layer: event bus and healing report writer

**Content snippet:**

"The architecture is intentionally layered. The orchestrator owns runtime control, agents propose recoveries, the policy engine decides whether recovery is allowed, memory stores what has worked before, and telemetry records the entire sequence for review."

**Suggested visual:**

- Layered diagram with six horizontal bands

---

## Slide 4: End-to-End Runtime Flow

**Slide title:** Runtime Execution Sequence

**What this slide should do:** Show how one failed step is processed.

**Slide content:**

1. Test step is executed through the orchestrator
2. Original Playwright action is attempted
3. Deterministic retries are exhausted
4. Failure context is captured
5. Recovery agent proposes alternatives
6. Policy engine evaluates confidence and mode rules
7. Approved recovery is applied or the step fails safely
8. Outcome is logged and artifacts are written

**Content snippet:**

"The framework does not begin with AI. It begins with standard execution, then deterministic retries, and only then escalates to AI-assisted recovery. This ordering preserves speed and predictability while reserving AI for exception handling."

**Suggested visual:**

- Numbered swimlane or flowchart with a decision diamond at policy evaluation

---

## Slide 5: Test Orchestrator as the Control Point

**Slide title:** Central Orchestration Model

**What this slide should do:** Explain why the orchestrator matters.

**Slide content:**

- All key actions route through a single execution engine
- Supported healing-aware actions include `click`, `fill`, `select`, `assertVisible`, and URL/state checks
- Recovery logic is centralized instead of duplicated across test files
- The orchestrator also records visited URLs, step outcomes, and healing decisions

**Content snippet:**

"The orchestrator is the technical backbone of the framework. It standardizes how actions are executed, how failures are escalated, and how outcomes are recorded. This makes behavior consistent across scenarios and makes policy enforcement easier to manage."

---

## Slide 6: Selector Recovery Design

**Slide title:** Selector Healing Mechanism

**What this slide should do:** Explain how selector recovery works and why it is scoped.

**Slide content:**

- Recovery begins by checking selector memory before calling an AI provider
- If memory does not produce a valid candidate, the agent uses DOM and accessibility context
- The agent returns structured candidates, a recommended selector, and a confidence value
- Candidate application is still subject to policy approval

**Content snippet:**

"Selector recovery is designed as a structured recommendation service, not as free-form automation. The agent returns a constrained JSON response containing selector candidates and confidence values so the next step can be governed programmatically."

**Suggested visual:**

- Funnel: `Memory lookup -> DOM/AX context -> AI response -> Policy evaluation -> Candidate cascade`

---

## Slide 7: Flow Recovery Design

**Slide title:** Flow-Level Recovery

**What this slide should do:** Explain the second recovery path for page drift.

**Slide content:**

- Used when the test reaches an unexpected state, route, or modal
- Agent receives expected state, observed state, recent steps, current URL, DOM, and accessibility context
- Output is a constrained recovery plan with allowed actions only
- Enabled in adaptive mode and disabled in strict mode

**Content snippet:**

"Beyond selector failure, the framework can attempt limited flow recovery when the page state drifts from expectation. This is intentionally narrower than full autonomy: recovery plans are filtered through an allowlist and bounded by retry limits."

---

## Slide 8: Governance and Safety Controls

**Slide title:** Policy Engine and Guardrails

**What this slide should do:** Show that AI recommendations are not trusted blindly.

**Slide content:**

- Confidence thresholds: auto-heal at high confidence, conditional acceptance at medium confidence
- Strict mode rejects medium-confidence healing and disables flow recovery
- Adaptive mode allows medium-confidence recovery and flow plans within policy
- Action allowlist limits what a recovery plan may execute
- Denylist blocks unsafe or destructive actions

**Content snippet:**

"The key design choice is that AI suggests, but policy decides. The framework does not treat model output as executable truth. Every recovery path is checked against confidence thresholds, mode-specific rules, retry budgets, and action governance."

**Suggested visual:**

- Decision matrix for `strict` vs `adaptive`

---

## Slide 9: Learning and Reuse

**Slide title:** Memory Layer

**What this slide should do:** Explain how the framework gets more efficient over time.

**Slide content:**

- Successful selector heals are stored in `selector-memory.json`
- Stored entries include original selector, healed selector, confidence, usage count, and score
- Memory is checked before external AI calls, reducing repeated analysis
- Decay logic lowers trust in stale entries over time
- Flow plans can also be stored for reuse

**Content snippet:**

"The framework is not only reactive. It has a lightweight learning model: if a recovery succeeds, that outcome can be reused in future runs, with decay applied so older patterns do not remain dominant indefinitely."

---

## Slide 10: Observability and Audit Trail

**Slide title:** Reporting, Artifacts, and Dashboard

**What this slide should do:** Show how technical teams inspect behavior.

**Slide content:**

- Event bus records failure, recovery, policy rejection, and completion events
- Artifact directory contains JSON, Markdown, HTML, and before/after screenshots
- Dashboard surfaces healing runs, selector memory, and repository activity
- Reports support debugging, review, and controlled rollout conversations

**Content snippet:**

"A major architectural requirement is traceability. Each healing event produces structured records so engineers can inspect what failed, what was proposed, what policy decided, and what evidence was captured."

**Important note for presenter:**

- If dashboard ROI or time-saved cards are shown, describe them as illustrative estimates unless validated by measured operational data.

---

## Slide 11: Current Scope and Practical Constraints

**Slide title:** What the Framework Does Today

**What this slide should do:** Keep the presentation credible by naming scope boundaries.

**Slide content:**

- Current implementation is focused on Playwright-based web UI automation
- Demo scenarios cover retail customer, admin, and testing-mode flows
- Healing quality depends on the availability of strong DOM and accessibility signals
- Low-confidence recoveries are intentionally rejected rather than forced through
- The current Playwright configuration favors controlled execution over maximum parallelism

**Content snippet:**

"This framework is already operational within its intended scope, but it is not positioned as universal automation. It is best understood as a governed resilience layer for web UI tests, with explicit boundaries around confidence, actions, and execution mode."

---

## Slide 12: Example of Governance in Practice

**Slide title:** Evidence of Controlled Failure Handling

**What this slide should do:** Show that the framework can stop safely when it should.

**Slide content:**

- Recent artifact runs show selector recovery being invoked on `Add to cart` failures
- In those runs, the model returned low-confidence alternatives because matching buttons were disabled
- Policy rejected the heal rather than applying an uncertain action
- This demonstrates that the framework is designed to preserve control, not just maximize automated continuation

**Content snippet:**

"One useful proof point is not only where healing succeeds, but where healing is refused. Recent runs in this repository show the framework declining low-confidence recovery when the page context indicated disabled actions. That behavior is important because it limits false recovery."

---

## Slide 13: Integration and Operations Model

**Slide title:** How Teams Would Use It

**What this slide should do:** Explain operational fit.

**Slide content:**

- `strict` mode for CI or gated pipelines
- `adaptive` mode for local investigation, nightly runs, or resilience discovery
- `sync-heals` tool can push accepted selector changes back into test sources
- Multi-provider AI client supports OpenAI, Google, Groq, and mock mode for demo/offline use

**Content snippet:**

"Operationally, the framework supports two different postures. Strict mode prioritizes safety and determinism in controlled environments, while adaptive mode is better suited for discovery and resilience learning outside the critical release path."

---

## Slide 14: Recommended Technical Next Steps

**Slide title:** Technical Maturation Path

**What this slide should do:** Close with sensible engineering next steps.

**Slide content:**

- Broaden scenario coverage across additional business journeys
- Track measured healing precision and false-positive rates
- Formalize approval rules for syncing healed selectors into source control
- Strengthen environment-specific baselines for CI, nightly, and pre-release runs
- Add richer operational metrics for latency, token usage, and review outcomes

**Content snippet:**

"The next phase should focus less on expanding claims and more on expanding evidence: broader scenario coverage, measured recovery quality, and a clear operational process for when learned fixes are promoted into maintained test code."

---

## Closing Message

**Use this as the final line on the last slide or in speaker notes:**

"Technically, this framework is best positioned as a governed resilience layer for Playwright automation: deterministic by default, AI-assisted only on failure, policy-controlled before action, and auditable after execution."
