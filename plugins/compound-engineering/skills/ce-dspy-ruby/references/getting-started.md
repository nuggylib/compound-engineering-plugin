# Getting Started

## Quick Start

```ruby
# Install
gem 'dspy'

# Configure
DSPy.configure do |c|
  c.lm = DSPy::LM.new('openai/gpt-4o-mini', api_key: ENV['OPENAI_API_KEY'])
end

# Define a task
class SentimentAnalysis < DSPy::Signature
  description "Analyze sentiment of text"

  input do
    const :text, String
  end

  output do
    const :sentiment, String  # positive, negative, neutral
    const :score, Float       # 0.0 to 1.0
  end
end

# Use it
analyzer = DSPy::Predict.new(SentimentAnalysis)
result = analyzer.call(text: "This product is amazing!")
puts result.sentiment  # => "positive"
puts result.score      # => 0.92
```

## Provider Adapter Gems

Two strategies for connecting to LLM providers:

### Per-provider adapters (direct SDK access)

```ruby
# Gemfile
gem 'dspy'
gem 'dspy-openai'    # OpenAI, OpenRouter, Ollama
gem 'dspy-anthropic' # Claude
gem 'dspy-gemini'    # Gemini
```

### Unified adapter via RubyLLM (recommended for multi-provider)

```ruby
# Gemfile
gem 'dspy'
gem 'dspy-ruby_llm'  # Routes to any provider via ruby_llm
gem 'ruby_llm'
```

Use the `ruby_llm/` prefix:

```ruby
DSPy.configure do |c|
  c.lm = DSPy::LM.new('ruby_llm/gemini-2.5-flash', structured_outputs: true)
  # c.lm = DSPy::LM.new('ruby_llm/claude-sonnet-4-20250514', structured_outputs: true)
  # c.lm = DSPy::LM.new('ruby_llm/gpt-4o-mini', structured_outputs: true)
end
```

## Schema Formats (BAML / TOON)

Control how DSPy describes signature structure to the LLM:

- **JSON Schema** (default) — Standard format, works with `structured_outputs: true`
- **BAML** (`schema_format: :baml`) — 84% token reduction for Enhanced Prompting mode. Requires `sorbet-baml` gem.
- **TOON** (`schema_format: :toon, data_format: :toon`) — Table-oriented format for both schemas and data. Enhanced Prompting mode only.

BAML and TOON apply only when `structured_outputs: false`. With `structured_outputs: true`, the provider receives JSON Schema directly.

## Storage System

Persist and reload optimized programs with `DSPy::Storage::ProgramStorage`:

```ruby
storage = DSPy::Storage::ProgramStorage.new(storage_path: "./dspy_storage")
storage.save_program(result.optimized_program, result, metadata: { optimizer: 'MIPROv2' })
```

Supports checkpoint management, optimization history tracking, and import/export between environments.

## Version

Current: 0.34.3
