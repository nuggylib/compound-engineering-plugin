# Conditional Persona Routing Criteria

Activation criteria for conditional document-review personas. Read this file once and identify all personas whose criteria match the document under review.

---

## product-lens-reviewer

**FQN:** `compound-engineering:document-review:product-lens-reviewer`

**Trigger summary:** challengeable premise claims or strategic weight

Activate when the document makes challengeable claims about what to build and why, or when the proposed work carries strategic weight beyond the immediate problem. The system's users may be end users, developers, operators, maintainers, or any other audience -- the criteria are domain-agnostic. Check for either leg:

**Leg 1 -- Premise claims:** The document stakes a position on what to build or why that a knowledgeable stakeholder could reasonably challenge -- not merely describing a task or restating known requirements:

- Problem framing where the stated need is non-obvious or debatable, not self-evident from existing context
- Solution selection where alternatives plausibly exist (implicit or explicit)
- Prioritization decisions that explicitly rank what gets built vs deferred
- Goal statements that predict specific user outcomes, not just restate constraints or describe deliverables

**Leg 2 -- Strategic weight:** The proposed work could affect system trajectory, user perception, or competitive positioning, even if the premise is sound:

- Changes that shape how the system is perceived or what it becomes known for
- Complexity or simplicity bets that affect adoption, onboarding, or cognitive load
- Work that opens or closes future directions (path dependencies, architectural commitments)
- Opportunity cost implications -- building this means not building something else

---

## design-lens-reviewer

**FQN:** `compound-engineering:document-review:design-lens-reviewer`

**Trigger summary:** UI/UX, user flows, or visual design references

Activate when the document contains:

- UI/UX references, frontend components, or visual design language
- User flows, wireframes, screen/page/view mentions
- Interaction descriptions (forms, buttons, navigation, modals)
- References to responsive behavior or accessibility

---

## security-lens-reviewer

**FQN:** `compound-engineering:document-review:security-lens-reviewer`

**Trigger summary:** auth, data handling, or trust boundaries

Activate when the document contains:

- Auth/authorization mentions, login flows, session management
- API endpoints exposed to external clients
- Data handling, PII, payments, tokens, credentials, encryption
- Third-party integrations with trust boundary implications

---

## scope-guardian-reviewer

**FQN:** `compound-engineering:document-review:scope-guardian-reviewer`

**Trigger summary:** multiple priority tiers, large scope, or misaligned boundaries

Activate when the document contains:

- Multiple priority tiers (P0/P1/P2, must-have/should-have/nice-to-have)
- Large requirement count (>8 distinct requirements or implementation units)
- Stretch goals, nice-to-haves, or "future work" sections
- Scope boundary language that seems misaligned with stated goals
- Goals that don't clearly connect to requirements

---

## adversarial-document-reviewer

**FQN:** `compound-engineering:document-review:adversarial-document-reviewer`

**Trigger summary:** 5+ requirements, explicit rationale, high-stakes domains, or new abstractions

Activate when the document contains:

- More than 5 distinct requirements or implementation units
- Explicit architectural or scope decisions with stated rationale
- High-stakes domains (auth, payments, data migrations, external integrations)
- Proposals of new abstractions, frameworks, or significant architectural patterns
