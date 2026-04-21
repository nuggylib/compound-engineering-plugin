# Evaluation

## Evaluation Framework

Systematically test LLM application performance with `DSPy::Evals`:

```ruby
metric = DSPy::Metrics.exact_match(field: :answer, case_sensitive: false)
evaluator = DSPy::Evals.new(predictor, metric: metric)
result = evaluator.evaluate(test_examples, display_table: true)
puts "Pass Rate: #{(result.pass_rate * 100).round(1)}%"
```

Built-in metrics: `exact_match`, `contains`, `numeric_difference`, `composite_and`. Custom metrics return `true`/`false` or a `DSPy::Prediction` with `score:` and `feedback:` fields.

Use `DSPy::Example` for typed test data and `export_scores: true` to push results to Langfuse.

## GEPA Optimization

```ruby
gem 'dspy-gepa'

teleprompter = DSPy::Teleprompt::GEPA.new(
  metric: metric,
  reflection_lm: DSPy::ReflectionLM.new('openai/gpt-4o-mini', api_key: ENV['OPENAI_API_KEY']),
  feedback_map: feedback_map,
  config: { max_metric_calls: 600, minibatch_size: 6 }
)

result = teleprompter.compile(program, trainset: train, valset: val)
optimized_program = result.optimized_program
```

The metric must return `DSPy::Prediction.new(score:, feedback:)`. Use `feedback_map` to target individual predictors in composite modules.

## Typed Context Pattern

Use `T::Struct` inputs with per-field `description:` annotations:

```ruby
class NavigationContext < T::Struct
  const :workflow_hint, T.nilable(String),
        description: "Current workflow phase guidance for the agent"
  const :action_log, T::Array[String], default: [],
        description: "Compact one-line-per-action history of research steps taken"
  const :iterations_remaining, Integer,
        description: "Budget remaining. Each tool call costs 1 iteration."
end

class ToolSelectionSignature < DSPy::Signature
  input do
    const :query, String
    const :context, NavigationContext  # Structured, not an opaque string
  end

  output do
    const :tool_name, String
    const :tool_args, String, description: "JSON-encoded arguments"
  end
end
```
