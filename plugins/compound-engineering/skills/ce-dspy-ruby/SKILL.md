---
name: ce-dspy-ruby
description: "Build type-safe LLM applications with DSPy.rb, Ruby's programmatic prompt framework. Use when implementing AI features with signatures, modules, agents, or optimization in Ruby."
---

<objective>
- **Type-safe signatures** — Define inputs/outputs with Sorbet types
- **Modular components** — Compose and reuse LLM logic
- **Automatic optimization** — Use data to improve prompts, not guesswork
- **Production-ready** — Built-in observability, testing, and error handling
</objective>

<essential_principles>

1. **Signatures** — Type-safe I/O contracts with Sorbet types (`T::Struct`, `T::Enum`)
2. **Modules** — Predict, ChainOfThought, ReAct, CodeAct
3. **Tools & Toolsets** — `Tools::Base` for single tools, `Tools::Toolset` for multi-tool groups
4. **Type System** — `_type` discriminator injection, recursive types via `$defs`
5. **Optimization** — MIPROv2, GEPA, Evaluation framework

</essential_principles>

<intake>
What do you need help with?

1. **Getting started** — Install, configure, first signature, provider adapters
2. **Core concepts** — Signatures, modules, predictors, type system deep-dive
3. **Tools & toolsets** — Tool DSL, toolset patterns, type safety, testing tools
4. **Rails integration** — Directory structure, initializers, schema-driven signatures, tool patterns
5. **Runtime** — Events system, lifecycle callbacks, fiber-local LM context
6. **Evaluation & optimization** — Evals framework, GEPA, MIPROv2, typed context
7. **Testing** — VCR setup, schema tests, tool tests with mocks
8. **Observability** — Tracing, Langfuse, dspy-o11y, score reporting
9. **Providers** — Adapter gems, RubyLLM, compatibility matrix
10. **Templates** — Signature, module, or config scaffolds

Specify a number, describe the topic, or ask a question.
</intake>

<routing>

| Input | Reference to load |
|-------|-------------------|
| 1, install, configure, setup, schema format, storage | `references/getting-started.md` |
| 2, signature, module, predict, type, struct, enum | `references/core-concepts.md` |
| 3, tool, toolset, DSL | `references/toolsets.md` |
| 4, rails, initializer, entity, feature flag | `references/rails-patterns.md` |
| 5, event, callback, lifecycle, fiber, with_lm | `references/runtime.md` |
| 6, eval, optimize, GEPA, MIPROv2, metric | `references/evaluation.md` + `references/optimization.md` |
| 7, test, VCR, rspec, spec | `references/testing.md` |
| 8, observability, trace, langfuse, span, o11y | `references/observability.md` |
| 9, provider, adapter, ruby_llm, openai, anthropic, gemini | `references/providers.md` |
| 10, template, scaffold | relevant `assets/*.rb` file |

Match the user's query to the most relevant row, then read that reference.
For cross-cutting questions spanning multiple topics, load 2-3 relevant references.
If no topic matches, re-present the intake menu.

</routing>

<reference_index>

| File | Topics |
|------|--------|
| `references/getting-started.md` | Install, configure, provider adapters, schema formats, storage |
| `references/core-concepts.md` | Signatures, modules, predictors, type system, discriminators |
| `references/toolsets.md` | Tools::Base, Toolset DSL, enum tools, type safety |
| `references/rails-patterns.md` | Rails structure, initializers, schema-driven signatures, tool patterns, best practices |
| `references/runtime.md` | Events, subscriptions, lifecycle callbacks, fiber-local LM |
| `references/evaluation.md` | Evals framework, metrics, GEPA, typed context |
| `references/testing.md` | VCR setup, schema tests, tool tests |
| `references/observability.md` | dspy-o11y, Langfuse tracing, score reporting |
| `references/optimization.md` | MIPROv2, GEPA deep-dive, storage system |
| `references/providers.md` | Adapters, RubyLLM, compatibility matrix |
| `assets/signature-template.rb` | Signature scaffold |
| `assets/module-template.rb` | Module scaffold with callbacks |
| `assets/config-template.rb` | Rails initializer scaffold |

</reference_index>

## Key URLs

- Homepage: https://oss.vicente.services/dspy.rb/
- GitHub: https://github.com/vicentereig/dspy.rb
- Documentation: https://oss.vicente.services/dspy.rb/getting-started/

<behavioral_guidelines>
When helping users with DSPy.rb:

- **Schema over prose** — Define output structure with `T::Struct` and `T::Enum` types, not string descriptions
- **Short-circuit LLM calls** — Skip the LLM for trivial cases (small data, cached results)
- **Cap input sizes** — Prevent token overflow by limiting array sizes before sending to LLM
- **Graceful degradation** — Always rescue LLM errors and return fallback data

After routing, read the matched reference file(s) then apply patterns to the user's code. For queries spanning multiple topics (e.g., "Rails integration with testing"), load 2-3 relevant references. When uncertain, re-present the intake menu.
</behavioral_guidelines>

## Version

Current: 0.34.3
