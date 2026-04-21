# DSPy.rb Core Concepts

## Signatures

Signatures define the interface between application code and LLMs: inputs, outputs, and a task description using Sorbet types.

### Structure

```ruby
class ClassifyEmail < DSPy::Signature
  description "Classify customer support emails by urgency and category"

  input do
    const :subject, String
    const :body, String
  end

  output do
    const :category, String
    const :urgency, String
  end
end
```

### Supported Types

| Type | JSON Schema | Notes |
|------|-------------|-------|
| `String` | `string` | Required string |
| `Integer` | `integer` | Whole numbers |
| `Float` | `number` | Decimal numbers |
| `T::Boolean` | `boolean` | true/false |
| `T::Array[X]` | `array` | Typed arrays |
| `T::Hash[K, V]` | `object` | Typed key-value maps |
| `T.nilable(X)` | nullable | Optional fields |
| `Date` | `string` (ISO 8601) | Auto-converted |
| `DateTime` | `string` (ISO 8601) | Preserves timezone |
| `Time` | `string` (ISO 8601) | Converted to UTC |

### Date and Time Types

Date, DateTime, and Time serialize to ISO 8601 strings and auto-convert back to Ruby objects. Timezone conventions follow ActiveRecord: Time converts to UTC, DateTime preserves timezone, Date is timezone-agnostic. Use `T.nilable(Date)` for optional date fields.

### Enums with T::Enum

Define constrained output values using `T::Enum` classes. Do not use inline `T.enum([...])` syntax.

```ruby
class SentimentAnalysis < DSPy::Signature
  description "Analyze sentiment of text"

  class Sentiment < T::Enum
    enums do
      Positive = new('positive'); Negative = new('negative'); Neutral = new('neutral')
    end
  end

  input { const :text, String }
  output { const :sentiment, Sentiment; const :confidence, Float }
end

result = DSPy::Predict.new(SentimentAnalysis).call(text: "This product is amazing!")
result.sentiment           # => #<Sentiment::Positive>
result.sentiment.serialize # => "positive"
```

Enum matching is case-insensitive. The LLM returning `"POSITIVE"` matches `new('positive')`.

### Default Values

Default values work on both inputs and outputs. Input defaults reduce caller boilerplate. Output defaults provide fallbacks when the LLM omits optional fields.

```ruby
class SmartSearch < DSPy::Signature
  description "Search with intelligent defaults"
  input do
    const :query, String
    const :max_results, Integer, default: 10
    const :language, String, default: "English"
  end
  output { const :results, T::Array[String]; const :total_found, Integer; const :cached, T::Boolean, default: false }
end
# DSPy::Predict.new(SmartSearch).call(query: "Ruby programming") -- defaults apply automatically
```

### Field Descriptions

Add `description:` to any field to guide the LLM. Appears in the generated JSON schema. Works on `T::Struct` fields and signature `input`/`output` blocks:

```ruby
class ASTNode < T::Struct
  const :node_type, String, description: "The type of AST node (heading, paragraph, code_block)"
  const :children, T::Array[ASTNode], default: []
end
# ASTNode.field_descriptions[:node_type] => "The type of AST node ..."
# Signature blocks: const :text, String, description: "Raw text to analyze"
```

### Schema Formats

DSPy.rb supports three schema formats for communicating type structure to LLMs.

#### JSON Schema (default)

Verbose but universally supported. Access via `YourSignature.output_json_schema`.

#### BAML Schema

Compact format that reduces schema tokens by 80-85%. Requires the `sorbet-baml` gem. Set `schema_format: :baml` on the LM. Applies only in Enhanced Prompting mode (`structured_outputs: false`).

#### TOON Schema + Data Format

Table-oriented text format that shrinks both schema definitions and prompt values. Set `schema_format: :toon, data_format: :toon` on the LM. Only works with Enhanced Prompting mode. The `sorbet-toon` gem is included automatically.

### Recursive Types

Self-referencing structs produce `$defs`/`$ref` entries in the JSON schema. Access via `YourSignature.output_json_schema_with_defs`.

### Union Types with T.any()

Specify fields that accept multiple types: `const :result, T.any(Float, String)`.

For struct unions, DSPy.rb automatically adds a `_type` discriminator field to each struct's JSON schema. The LLM returns `_type` in its response, and DSPy converts the hash to the correct struct instance.

```ruby
class CreateTask < T::Struct
  const :title, String; const :priority, String
end
class DeleteTask < T::Struct
  const :task_id, String; const :reason, T.nilable(String)
end

class TaskRouter < DSPy::Signature
  description "Route user request to the appropriate task action"
  input { const :request, String }
  output { const :action, T.any(CreateTask, DeleteTask) }
end

result = DSPy::Predict.new(TaskRouter).call(request: "Create a task for Q4 review")
result.action.class  # => CreateTask -- pattern match with case/when
```

Union types also work inside arrays: `const :events, T::Array[T.any(LoginEvent, PurchaseEvent)]`. Limit unions to 2-4 types for reliable LLM comprehension. Use clear struct names since they become the `_type` discriminator values.

---

## Modules

Modules are composable building blocks that wrap predictors. Define a `forward` method; invoke the module with `.call()`.

### Basic Structure

```ruby
class SentimentAnalyzer < DSPy::Module
  def initialize = (super; @predictor = DSPy::Predict.new(SentimentSignature))
  def forward(text:) = @predictor.call(text: text)
end
result = SentimentAnalyzer.new.call(text: "I love this product!")
# result.sentiment => "positive", result.confidence => 0.9
```

**API rules:** Invoke with `.call()`, not `.forward()`. Access fields with `result.field`, not `result[:field]`.

### Module Composition

Combine modules through explicit method calls in `forward`. Initialize sub-modules in constructor, call them in `forward`:

```ruby
class DocumentProcessor < DSPy::Module
  def initialize = (super; @classifier = DocumentClassifier.new; @summarizer = DocumentSummarizer.new)
  def forward(document:)
    { document_type: @classifier.call(content: document).document_type,
      summary: @summarizer.call(content: document).summary }
  end
end
```

### Lifecycle Callbacks

Modules support `before`, `after`, and `around` callbacks on `forward`. Declare them as class-level macros referencing private methods.

**Execution order:** `before` -> `around` (before yield) -> `forward` -> `around` (after yield) -> `after`.

```ruby
class InstrumentedModule < DSPy::Module
  before :setup_metrics
  after :log_metrics
  around :manage_context

  def initialize
    super
    @predictor = DSPy::Predict.new(MySignature)
    @metrics = {}
  end

  def forward(question:)
    @predictor.call(question: question)
  end

  private

  def setup_metrics = @metrics[:start_time] = Time.now
  def manage_context = (load_context; result = yield; save_context; result)
  def log_metrics = @metrics[:duration] = Time.now - @metrics[:start_time]
end
```

Multiple callbacks of the same type execute in registration order. Callbacks inherit from parent classes; parent callbacks run first. Around callbacks must call `yield` to execute the wrapped method and return the result.

### Instruction Update Contract

Teleprompters (GEPA, MIPROv2) require modules to expose immutable update hooks. Include `DSPy::Mixins::InstructionUpdatable` and implement `with_instruction` and `with_examples`, each cloning `self` and returning a new instance with the updated predictor:

```ruby
class SentimentPredictor < DSPy::Module
  include DSPy::Mixins::InstructionUpdatable
  # initialize: @predictor = DSPy::Predict.new(SentimentSignature)

  def with_instruction(instruction)
    clone = self.class.new
    clone.instance_variable_set(:@predictor, @predictor.with_instruction(instruction))
    clone
  end
  # with_examples follows the same clone pattern with @predictor.with_examples(examples)
end
```

If a module omits these hooks, teleprompters raise `DSPy::InstructionUpdateError` instead of silently mutating state.

---

## Predictors

Predictors are execution engines that take a signature and produce structured results from a language model. DSPy.rb provides four predictor types.

### Predict

Direct LLM call with typed input/output. Fastest option, lowest token usage.

```ruby
result = DSPy::Predict.new(ClassifyText).call(text: "Technical document about APIs")
# result.sentiment, result.topics, result.confidence
```

### ChainOfThought

Adds a `reasoning` field to the output automatically. The model generates step-by-step reasoning before the final answer. Do not define a `:reasoning` field in the signature output when using ChainOfThought.

```ruby
class SolveMathProblem < DSPy::Signature
  description "Solve mathematical word problems step by step"
  input { const :problem, String }
  output { const :answer, String }  # :reasoning added automatically by ChainOfThought
end
solver = DSPy::ChainOfThought.new(SolveMathProblem)
result = solver.call(problem: "Sarah has 15 apples. She gives 7 away and buys 12 more.")
# result.reasoning => "Step by step: ...", result.answer => "20 apples"
```

Use ChainOfThought for complex analysis, multi-step reasoning, or when explainability matters.

### ReAct

Reasoning + Action agent that uses tools in an iterative loop. Define tools by subclassing `DSPy::Tools::Base`. Group related tools with `DSPy::Tools::Toolset`.

```ruby
class WeatherTool < DSPy::Tools::Base
  extend T::Sig
  tool_name "weather"
  tool_description "Get weather information for a location"
  sig { params(location: String).returns(String) }
  def call(location:)
    { location: location, temperature: 72, condition: "sunny" }.to_json
  end
end

class TravelSignature < DSPy::Signature
  description "Help users plan travel"
  input { const :destination, String }
  output { const :recommendations, String }
end

agent = DSPy::ReAct.new(TravelSignature, tools: [WeatherTool.new], max_iterations: 5)
result = agent.call(destination: "Tokyo, Japan")
# result.recommendations, result.history (steps), result.iterations, result.tools_used
```

Use toolsets: `DSPy::ReAct.new(MySignature, tools: DSPy::Tools::TextProcessingToolset.to_tools)`.

### CodeAct

Think-Code-Observe agent that synthesizes and executes Ruby code. Requires `gem 'dspy-code_act', '~> 0.29'`. Usage: `DSPy::CodeAct.new(ProgrammingSignature, max_iterations: 10).call(task: "...")`.

### Predictor Comparison

| Predictor | Speed | Token Usage | Best For |
|-----------|-------|-------------|----------|
| Predict | Fastest | Low | Classification, extraction |
| ChainOfThought | Moderate | Medium-High | Complex reasoning, analysis |
| ReAct | Slower | High | Multi-step tasks with tools |
| CodeAct | Slowest | Very High | Dynamic programming, calculations |

### Concurrent Predictions

Process multiple independent predictions simultaneously using `Async::Barrier` (requires `gem 'async', '~> 2.29'`):

```ruby
Async do
  barrier = Async::Barrier.new
  tasks = documents.map { |doc| barrier.async { analyzer.call(content: doc) } }
  barrier.wait
  predictions = tasks.map(&:wait)
end
```

Handle errors within each `barrier.async` block (`rescue StandardError => e; nil`) to prevent one failure from cancelling others.

### Few-Shot Examples and Instruction Tuning

```ruby
classifier = DSPy::Predict.new(SentimentAnalysis)
examples = [DSPy::FewShotExample.new(input: { text: "Love it!" }, output: { sentiment: "positive", confidence: 0.95 })]
optimized = classifier.with_examples(examples)
tuned = classifier.with_instruction("Be precise and confident.")
```

---

## Type System

### Automatic Type Conversion

DSPy.rb v0.9.0+ auto-converts LLM JSON to typed Ruby objects: Enums (case-insensitive), Structs (nested hashes), Arrays (recursive), Defaults (missing fields). Union types use `_type` discriminator. Recursive structs use `$ref` pointers.

### Nesting Depth

1-2 levels: reliable. 3-4 levels: works but complex. 5+: may trigger OpenAI warnings; flatten or split into multiple signatures.

### Tips

- Prefer `T::Array[X], default: []` over `T.nilable(T::Array[X])` -- nilable arrays cause schema issues with OpenAI structured outputs.
- Limit union types to 2-4 members. Use clear struct names (they become `_type` discriminator values).
- Check compatibility: `DSPy::OpenAI::LM::SchemaConverter.validate_compatibility(schema)`.
