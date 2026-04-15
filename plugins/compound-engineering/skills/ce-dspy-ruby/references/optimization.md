# DSPy.rb Optimization

## MIPROv2

MIPROv2 is the primary instruction tuner in DSPy.rb. It proposes new instructions and few-shot demonstrations per predictor, evaluates them on mini-batches, and retains candidates that improve the metric. Ships as a separate gem.

### Installation

```ruby
# Gemfile
gem "dspy"
gem "dspy-miprov2"
```

Bundler auto-requires `dspy/miprov2`. No additional `require` statement is needed.

### AutoMode presets

Use `DSPy::Teleprompt::MIPROv2::AutoMode` for preconfigured optimizers:

```ruby
light  = DSPy::Teleprompt::MIPROv2::AutoMode.light(metric: metric)   # 6 trials, greedy
medium = DSPy::Teleprompt::MIPROv2::AutoMode.medium(metric: metric)  # 12 trials, adaptive
heavy  = DSPy::Teleprompt::MIPROv2::AutoMode.heavy(metric: metric)   # 18 trials, Bayesian
```

| Preset   | Trials | Strategy   | Use case                                            |
|----------|--------|------------|-----------------------------------------------------|
| `light`  | 6      | `:greedy`  | Quick wins on small datasets or during prototyping. |
| `medium` | 12     | `:adaptive`| Balanced exploration vs. runtime for most pilots.   |
| `heavy`  | 18     | `:bayesian`| Highest accuracy targets or multi-stage programs.   |

### Manual configuration with dry-configurable

`DSPy::Teleprompt::MIPROv2` includes `Dry::Configurable`. Configure at the class level (defaults for all instances) or instance level (overrides class defaults).

**Class-level defaults:**

```ruby
DSPy::Teleprompt::MIPROv2.configure do |config|
  config.optimization_strategy = :bayesian
  config.num_trials = 30
  config.bootstrap_sets = 10
end
```

**Instance-level overrides:**

```ruby
optimizer = DSPy::Teleprompt::MIPROv2.new(metric: metric)
optimizer.configure do |config|
  config.num_trials = 15
  config.optimization_strategy = :adaptive       # :greedy, :adaptive, :bayesian
  # Also: num_instruction_candidates, bootstrap_sets, max_bootstrapped_examples,
  # max_labeled_examples, early_stopping_patience, init_temperature, final_temperature,
  # minibatch_size (nil = auto), auto_seed
end
```

The `optimization_strategy` setting accepts symbols and coerces them internally to `DSPy::Teleprompt::OptimizationStrategy` T::Enum values. The old `config:` constructor parameter is removed. Passing `config:` raises `ArgumentError`.

### Auto presets via configure

Instead of `AutoMode`, set the preset through the configure block: `config.auto_preset = DSPy::Teleprompt::AutoPreset.deserialize("medium")`.

### Compile and inspect

```ruby
result = optimizer.compile(DSPy::Predict.new(MySignature), trainset: train_examples, valset: val_examples)
# result.optimized_program        -- ready-to-use predictor with updated instruction and demos
# result.optimization_trace[:trial_logs] -- per-trial instructions, demos, scores
# result.metadata[:optimizer]     -- "MIPROv2"
```

### Multi-stage programs

MIPROv2 generates dataset summaries for each predictor and proposes per-stage instructions. For a ReAct agent with `thought_generator` and `observation_processor` predictors, the optimizer handles credit assignment internally. The metric only needs to evaluate the final output.

### Bootstrap sampling

During bootstrap, MIPROv2 generates dataset summaries, bootstraps few-shot demos from the baseline program, proposes candidate instructions, and evaluates on mini-batches. Control with `bootstrap_sets`, `max_bootstrapped_examples`, and `max_labeled_examples`.

### Bayesian optimization

With `:bayesian` strategy (or `heavy` preset), MIPROv2 fits a Gaussian Process surrogate over past trial scores for informed candidate selection, reducing trials needed.

---

## GEPA

GEPA (Genetic-Pareto Reflective Prompt Evolution) is a feedback-driven optimizer. It runs the program on a small batch, collects scores and textual feedback, and asks a reflection LM to rewrite the instruction. Improved candidates are retained on a Pareto frontier.

### Installation

```ruby
# Gemfile
gem "dspy"
gem "dspy-gepa"
```

The `dspy-gepa` gem depends on the `gepa` core optimizer gem automatically.

### Metric contract

GEPA metrics return `DSPy::Prediction` with both a numeric score and a feedback string. Do not return a plain boolean.

```ruby
metric = lambda do |example, prediction|
  score = prediction.label == example.expected_values[:label] ? 1.0 : 0.0
  DSPy::Prediction.new(score: score, feedback: "Result for: #{example.input_values[:text][0..60]}")
end
```

Keep the score in `[0, 1]`. Always include a short feedback message -- GEPA hands this text to the reflection model so it can reason about failures.

### Feedback maps

`feedback_map` targets individual predictors inside a composite module. Each entry receives keyword arguments (`predictor_output:`, `predictor_inputs:`, `module_inputs:`, `module_outputs:`, `captured_trace:`) and returns a `DSPy::Prediction`:

```ruby
feedback_map = {
  'self' => lambda do |predictor_output:, module_inputs:, **|
    expected = module_inputs.expected_values[:label]
    DSPy::Prediction.new(
      score: predictor_output.label == expected ? 1.0 : 0.0,
      feedback: "#{predictor_output.label} (expected #{expected})"
    )
  end
}
```

For single-predictor programs, key the map with `'self'`. For multi-predictor chains, add entries per component. Omit `feedback_map` entirely if the top-level metric already covers the basics.

### Configuring the teleprompter

```ruby
teleprompter = DSPy::Teleprompt::GEPA.new(
  metric: metric,
  reflection_lm: DSPy::ReflectionLM.new('openai/gpt-4o-mini', api_key: ENV['OPENAI_API_KEY']),
  feedback_map: feedback_map,
  config: { max_metric_calls: 600, minibatch_size: 6, skip_perfect_score: false }
)
```

Key knobs: `max_metric_calls` (hard eval budget), `minibatch_size` (examples per replay batch -- 3-6 for exploration, 8-12 for stable metrics), `skip_perfect_score` (stop early at 1.0).

### Compile and evaluate

```ruby
result = teleprompter.compile(DSPy::Predict.new(MySignature), trainset: train, valset: val)
# result.optimized_program -- predictor with updated instruction and few-shot examples
# result.best_score_value  -- validation score for the best candidate
# result.metadata          -- candidate counts, trace hashes, and telemetry IDs
```

### Reflection LM

Swap `DSPy::ReflectionLM` for any callable object that accepts the reflection prompt hash and returns a string. The default reflection signature extracts the new instruction from triple backticks in the response.

### Experiment tracking

Plug `GEPA::Logging::ExperimentTracker` into a persistence layer. Pass it as `experiment_tracker:` to the GEPA constructor. The tracker emits Pareto update events, merge decisions, and candidate evolution records as JSONL via `with_subscriber { |event| ... }`.

### Pareto frontier

GEPA samples from a Pareto frontier of diverse candidates instead of mutating only the top scorer. Enable `enable_merge_proposer: true` in config after multiple strong lineages emerge (premature merges waste budget).

### Advanced options

`acceptance_strategy:` for bespoke Pareto filters. Telemetry via `GEPA::Telemetry`; enable with `DSPy.configure { |c| c.observability = true }` for OpenTelemetry export.

---

## Evaluation Framework

`DSPy::Evals` provides batch evaluation of predictors against test datasets with built-in and custom metrics.

### Basic usage

```ruby
metric = proc { |example, prediction| prediction.answer == example.expected_values[:answer] }
evaluator = DSPy::Evals.new(predictor, metric: metric)
result = evaluator.evaluate(test_examples, display_table: true, display_progress: true)
# result.pass_rate, result.passed_examples, result.total_examples
```

### DSPy::Example

Convert raw data into `DSPy::Example` instances before passing to optimizers or evaluators. Each example carries `input_values` and `expected_values`:

```ruby
examples = rows.map { |row| DSPy::Example.new(input_values: { text: row[:text] }, expected_values: { label: row[:label] }) }
train, val, test = split_examples(examples, train_ratio: 0.6, val_ratio: 0.2, seed: 42)
```

Hold back a test set from the optimization loop. Optimizers work on train/val; only the test set proves generalization.

### Built-in metrics

```ruby
DSPy::Metrics.exact_match(field: :answer, case_sensitive: true)
DSPy::Metrics.contains(field: :answer, case_sensitive: false)
DSPy::Metrics.numeric_difference(field: :answer, tolerance: 0.01)
DSPy::Metrics.composite_and(DSPy::Metrics.exact_match(field: :answer), DSPy::Metrics.contains(field: :reasoning))
```

### Custom metrics

```ruby
quality_metric = lambda do |example, prediction|
  return false unless prediction
  score = 0.0
  score += 0.5 if prediction.answer == example.expected_values[:answer]
  score += 0.3 if prediction.explanation&.length.to_i > 50
  score += 0.2 if prediction.confidence.to_f > 0.8
  score >= 0.7
end
# Usage: DSPy::Evals.new(predictor, metric: quality_metric)
```

Access prediction fields with dot notation (`prediction.answer`), not hash notation.

### Observability hooks

Register callbacks without editing the evaluator. Available hooks: `before_example`, `after_example`, `before_batch`, `after_batch`. Each receives a `payload` hash with `:example` or `:result` keys.

```ruby
DSPy::Evals.after_batch { |payload| log_result(payload[:result]) }
```

### Langfuse score export

Enable `export_scores: true` on the evaluator to emit `score.create` events for each example and a batch score. Optional `score_name:` (default: `'evaluation'`). Scores attach to the current trace context and flow to Langfuse asynchronously via `DSPy::Scores::Exporter`.

### Evaluation results

`result = evaluator.evaluate(test_examples)` returns an object with: `score` (0.0-1.0), `passed_count`, `failed_count`, `error_count`. Per-example results via `result.results.each { |r| r.passed; r.score; r.error }`.

### Integration with optimizers

```ruby
metric = proc { |ex, pred| pred.answer.to_s.strip.downcase.include?(ex.expected_values[:answer].to_s.strip.downcase) }
optimizer = DSPy::Teleprompt::MIPROv2::AutoMode.medium(metric: metric)
result = optimizer.compile(DSPy::Predict.new(QASignature), trainset: train_examples, valset: val_examples)
test_result = DSPy::Evals.new(result.optimized_program, metric: metric).evaluate(test_examples)
```

---

## Storage System

`DSPy::Storage` persists optimization results, tracks history, and manages multiple versions of optimized programs.

### ProgramStorage (low-level)

```ruby
storage = DSPy::Storage::ProgramStorage.new(storage_path: "./dspy_storage")
saved = storage.save_program(result.optimized_program, result, metadata: { signature_class: 'ClassifyText' })
# saved.program_id, storage.load_program(id).program, storage.list_programs
```

### StorageManager (recommended)

```ruby
manager = DSPy::Storage::StorageManager.new
saved = manager.save_optimization_result(result, tags: ['production'], description: 'v2')
programs = manager.find_programs(optimizer: 'MIPROv2', min_score: 0.85, tags: ['production'])
# Also: find_programs(max_age_days: 7, signature_class: 'ClassifyText')
best = manager.get_best_program('ClassifyText')
```

Global shorthand: `StorageManager.save(result, ...)`, `StorageManager.load(id)`, `StorageManager.best('ClassifyText')`.

### Checkpoints

Create and restore checkpoints during long-running optimizations:

```ruby
manager.create_checkpoint(current_result, 'iteration_50', metadata: { iteration: 50, current_score: 0.87 })
restored = manager.restore_checkpoint('iteration_50')
# Auto-checkpoint: manager.create_checkpoint(current_result, "auto_checkpoint_#{iteration}")
```

### Import and export

Share programs between environments via `storage.export_programs(['abc123', 'def456'], './export.json')` and `storage.import_programs('./export.json')`.

### Optimization history

`manager.get_optimization_history` returns `[:summary]` (total_programs, avg_score), `[:optimizer_stats]` (per-optimizer counts and best scores), and `[:trends]` (improvement_percentage).

### Program comparison

`manager.compare_programs(id_a, id_b)` returns `[:comparison]` with `score_difference`, `better_program`, and `age_difference_hours`.

### Storage configuration

```ruby
config = DSPy::Storage::StorageManager::StorageConfig.new
config.storage_path = Rails.root.join('dspy_storage')
# Also: auto_save (true), save_intermediate_results (false), max_stored_programs (100)
manager = DSPy::Storage::StorageManager.new(config: config)
```

### Cleanup

`manager.cleanup_old_programs` removes old programs, retaining best-performing and most recent using a weighted score (70% performance, 30% recency).

### Storage events

Emits structured log events: `dspy.storage.{save,load,delete,export,import,cleanup}_{start,complete,error}`.

### File layout

Programs stored as JSON under `dspy_storage/programs/`, with a `history.json` index.

---

## API rules

- Call predictors with `.call()`, not `.forward()`.
- Access prediction fields with dot notation (`result.answer`), not hash notation (`result[:answer]`).
- GEPA metrics return `DSPy::Prediction.new(score:, feedback:)`, not a boolean.
- MIPROv2 metrics may return `true`/`false`, a numeric score, or `DSPy::Prediction`.
