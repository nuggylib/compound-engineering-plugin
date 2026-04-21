# Runtime

## Events System

### Module-Scoped Subscriptions (preferred for agents)

```ruby
class MyAgent < DSPy::Module
  subscribe 'lm.tokens', :track_tokens, scope: :descendants

  def track_tokens(_event, attrs)
    @total_tokens += attrs.fetch(:total_tokens, 0)
  end
end
```

### Global Subscriptions (for observability/integrations)

```ruby
subscription_id = DSPy.events.subscribe('score.create') do |event, attrs|
  Langfuse.export_score(attrs)
end

# Wildcards supported
DSPy.events.subscribe('llm.*') { |name, attrs| puts "[#{name}] tokens=#{attrs[:total_tokens]}" }
```

Event names use dot-separated namespaces (`llm.generate`, `react.iteration_complete`). Every event includes module metadata (`module_path`, `module_leaf`, `module_scope.ancestry_token`) for filtering.

## Lifecycle Callbacks

- **`before`** — Runs ahead of `forward` for setup (metrics, context loading)
- **`around`** — Wraps `forward`, calls `yield`, and lets you pair setup/teardown logic
- **`after`** — Fires after `forward` returns for cleanup or persistence

```ruby
class InstrumentedModule < DSPy::Module
  before :setup_metrics
  around :manage_context
  after :log_metrics

  def forward(question:)
    @predictor.call(question: question)
  end

  private

  def setup_metrics
    @start_time = Time.now
  end

  def manage_context
    load_context
    result = yield
    save_context
    result
  end

  def log_metrics
    duration = Time.now - @start_time
    Rails.logger.info "Prediction completed in #{duration}s"
  end
end
```

Execution order: before -> around (before yield) -> forward -> around (after yield) -> after. Callbacks are inherited from parent classes and execute in registration order.

## Fiber-Local LM Context

Override the language model temporarily using fiber-local storage:

```ruby
fast_model = DSPy::LM.new("openai/gpt-4o-mini", api_key: ENV['OPENAI_API_KEY'])

DSPy.with_lm(fast_model) do
  result = classifier.call(text: "test")  # Uses fast_model inside this block
end
# Back to global LM outside the block
```

**LM resolution hierarchy**: Instance-level LM -> Fiber-local LM (`DSPy.with_lm`) -> Global LM (`DSPy.configure`).

Use `configure_predictor` for fine-grained control over agent internals:

```ruby
agent = DSPy::ReAct.new(MySignature, tools: tools)
agent.configure { |c| c.lm = default_model }
agent.configure_predictor('thought_generator') { |c| c.lm = powerful_model }
```
