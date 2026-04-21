# DSPy.rb Toolsets

## Tools::Base

`DSPy::Tools::Base` is the base class for single-purpose tools. Each subclass exposes one operation to an LLM agent through a `call` method.

### Defining a Tool

Set the tool's identity with the `tool_name` and `tool_description` class-level DSL methods. Define the `call` instance method with a Sorbet `sig` declaration so DSPy.rb can generate the JSON schema the LLM uses to invoke the tool.

```ruby
class WeatherLookup < DSPy::Tools::Base
  extend T::Sig

  tool_name "weather_lookup"
  tool_description "Look up current weather for a given city"

  sig { params(city: String, units: T.nilable(String)).returns(String) }
  def call(city:, units: nil)
    # Fetch weather data and return a string summary
    "72F and sunny in #{city}"
  end
end
```

Key points: Inherit from `DSPy::Tools::Base` (not `DSPy::Tool`). Set `tool_name` and `tool_description` as class methods. Use **keyword arguments** in `call`. Always attach a Sorbet `sig` -- without it, the schema has empty properties.

### Schema Generation

`call_schema_object` introspects the Sorbet signature on `call` and returns a hash with `type`, `properties`, and `required` keys. `call_schema` wraps this in the full LLM tool-calling format (`type: "function", function: { name:, description:, parameters: }`).

### Using Tools with ReAct

Pass tool instances to `DSPy::ReAct.new(MySignature, tools: [WeatherLookup.new, AnotherTool.new])`. Access output with dot notation (`result.answer`), not hash access.

---

## Tools::Toolset

`DSPy::Tools::Toolset` groups multiple related methods into a single class. Each exposed method becomes an independent tool from the LLM's perspective.

### Defining a Toolset

```ruby
class DatabaseToolset < DSPy::Tools::Toolset
  extend T::Sig
  toolset_name "db"
  tool :query,  description: "Run a read-only SQL query"
  tool :insert, description: "Insert a record into a table"
  tool :delete, description: "Delete a record by ID"

  sig { params(sql: String).returns(String) }
  def query(sql:) = # Execute read query

  sig { params(table: String, data: T::Hash[String, String]).returns(String) }
  def insert(table:, data:) = # Insert record

  sig { params(table: String, id: Integer).returns(String) }
  def delete(table:, id:) = # Delete record
end
```

### DSL Methods

**`toolset_name(name)`** -- Prefix for generated tool names. Default: class name minus `Toolset`, lowercased (e.g., `"db"` makes `tool :query` produce `"db_query"`).

**`tool(method_name, tool_name:, description:)`** -- Expose a method as a tool. Optional `tool_name:` overrides default naming; `description:` is shown to the LLM.

### Converting to a Tool Array

`DatabaseToolset.to_tools` returns `ToolProxy` objects compatible with `DSPy::Tools::Base`. Each wraps one method and generates its own JSON schema from the Sorbet signature. Usage: `DSPy::ReAct.new(AnalyzeText, tools: DatabaseToolset.to_tools)`.

### Shared State

All tool proxies from a single `to_tools` call share one toolset instance. Store shared state (connections, caches, configuration) in the toolset's `initialize`:

```ruby
class ApiToolset < DSPy::Tools::Toolset
  extend T::Sig
  toolset_name "api"
  tool :get,  description: "Make a GET request"
  tool :post, description: "Make a POST request"

  sig { params(base_url: String).void }
  def initialize(base_url:)
    @base_url = base_url
    @client = HTTP.persistent(base_url)
  end

  sig { params(path: String).returns(String) }
  def get(path:) = @client.get("#{@base_url}#{path}").body.to_s

  sig { params(path: String, body: String).returns(String) }
  def post(path:, body:) = @client.post("#{@base_url}#{path}", body: body).body.to_s
end
```

---

## Type Safety

Sorbet signatures on tool methods drive both JSON schema generation and automatic type coercion of LLM responses.

### Basic Types

| Sorbet Type      | JSON Schema                                        |
|------------------|----------------------------------------------------|
| `String`         | `{"type": "string"}`                               |
| `Integer`        | `{"type": "integer"}`                              |
| `Float`/`Numeric`| `{"type": "number"}`                               |
| `T::Boolean`     | `{"type": "boolean"}`                              |
| `T::Enum`        | `{"type": "string", "enum": [...]}`                |
| `T::Struct`      | `{"type": "object", "properties": {...}}`          |
| `T::Array[Type]` | `{"type": "array", "items": {...}}`                |
| `T::Hash[K, V]`  | `{"type": "object", "additionalProperties": {...}}`|
| `T.nilable(Type)`| `{"type": [original, "null"]}`                     |
| `T.any(T1, T2)`  | `{"oneOf": [{...}, {...}]}`                        |
| `T.class_of(X)`  | `{"type": "string"}`                               |

### T::Enum Parameters

Define a `T::Enum` and reference it in a tool signature. DSPy.rb generates a JSON Schema `enum` constraint and automatically deserializes the LLM's string response into the correct enum instance.

```ruby
class Priority < T::Enum
  enums do
    Low = new('low'); Medium = new('medium'); High = new('high'); Critical = new('critical')
  end
end

sig { params(priority: Priority).returns(String) }
def update_task(priority:)
  "Updated to #{priority.serialize}"
end
# Schema: { "priority": { "type": "string", "enum": ["low", "medium", "high", "critical"] } }
```

**Case-insensitive matching**: When the LLM returns `"HIGH"` or `"High"` instead of `"high"`, DSPy.rb first tries an exact `try_deserialize`, then falls back to a case-insensitive lookup.

### T::Struct Parameters

Use `T::Struct` for complex nested objects. DSPy.rb generates nested JSON Schema properties and recursively coerces the LLM's hash response into struct instances.

```ruby
class TaskMetadata < T::Struct
  prop :id, String; prop :priority, Priority; prop :tags, T::Array[String]
  prop :estimated_hours, T.nilable(Float), default: nil
end

class TaskRequest < T::Struct
  prop :title, String; prop :description, String
  prop :metadata, TaskMetadata; prop :assignees, T::Array[String]
end
# sig { params(task: TaskRequest).returns(String) } -- LLM sees full nested schema
```

DSPy.rb reconstructs the struct tree from the JSON response, including enum fields inside nested structs.

### Nilable Parameters

Mark optional parameters with `T.nilable(...)` and provide a default of `nil`. These are excluded from the JSON Schema `required` array: `def search(query:, max_results: nil, filter: nil)`.

### Collections

Typed arrays and hashes generate precise item/value schemas: `T::Array[String]`, `T::Array[Priority]`, `T::Hash[String, T.any(String, Integer)]`. Elements are validated and coerced.

### Union Types

`T.any(...)` generates a `oneOf` JSON Schema. When a union member is a `T::Struct`, DSPy.rb uses the `_type` discriminator field for coercion.

---

## Built-in Toolsets

### TextProcessingToolset

`DSPy::Tools::TextProcessingToolset` provides Unix-style text analysis and manipulation operations. Toolset name prefix: `text`.

| Tool Name                         | Method            | Description                                |
|-----------------------------------|-------------------|--------------------------------------------|
| `text_grep`                       | `grep`            | Search for patterns with optional case-insensitive and count-only modes |
| `text_wc`                         | `word_count`      | Count lines, words, and characters         |
| `text_rg`                         | `ripgrep`         | Fast pattern search with context lines     |
| `text_extract_lines`              | `extract_lines`   | Extract a range of lines by number         |
| `text_filter_lines`               | `filter_lines`    | Keep or reject lines matching a regex      |
| `text_unique_lines`               | `unique_lines`    | Deduplicate lines, optionally preserving order |
| `text_sort_lines`                 | `sort_lines`      | Sort lines alphabetically or numerically   |
| `text_summarize_text`             | `summarize_text`  | Produce a statistical summary (counts, averages, frequent words) |

Usage: `DSPy::ReAct.new(AnalyzeText, tools: DSPy::Tools::TextProcessingToolset.to_tools)`.

### GitHubCLIToolset

`DSPy::Tools::GitHubCLIToolset` wraps the `gh` CLI for read-oriented GitHub operations. Toolset name prefix: `github`.

| Tool Name              | Method            | Description                                       |
|------------------------|-------------------|---------------------------------------------------|
| `github_list_issues`   | `list_issues`     | List issues filtered by state, labels, assignee   |
| `github_list_prs`      | `list_prs`        | List pull requests filtered by state, author, base|
| `github_get_issue`     | `get_issue`       | Retrieve details of a single issue                |
| `github_get_pr`        | `get_pr`          | Retrieve details of a single pull request         |
| `github_api_request`   | `api_request`     | Make an arbitrary GET request to the GitHub API    |
| `github_traffic_views` | `traffic_views`   | Fetch repository traffic view counts              |
| `github_traffic_clones`| `traffic_clones`  | Fetch repository traffic clone counts             |

This toolset uses `T::Enum` parameters (`IssueState`, `PRState`, `ReviewState`) for state filters. Usage: `DSPy::ReAct.new(RepoAnalysis, tools: DSPy::Tools::GitHubCLIToolset.to_tools)`.

---

## Testing

### Unit Testing Tools and Toolsets

Test `DSPy::Tools::Base` subclasses by instantiating and calling `call` directly. Test toolsets on an instance and verify tool generation with `to_tools`:

```ruby
RSpec.describe DatabaseToolset do
  subject(:toolset) { described_class.new }

  it "executes a query" do
    expect(toolset.query(sql: "SELECT 1")).to be_a(String)
  end

  it "generates tools with correct names" do
    names = described_class.to_tools.map(&:name)
    expect(names).to contain_exactly("db_query", "db_insert", "db_delete")
  end

  # Also test: tool.name, described_class.call_schema_object[:required], tool descriptions
end
```

### Mocking Predictions Inside Tools

When a tool calls a DSPy predictor internally, stub the predictor to isolate tool logic from LLM calls:

```ruby
class SmartSearchTool < DSPy::Tools::Base
  extend T::Sig
  tool_name "smart_search"
  tool_description "Search with query expansion"
  sig { void }
  def initialize = @expander = DSPy::Predict.new(QueryExpansionSignature)
  sig { params(query: String).returns(String) }
  def call(query:) = perform_search(@expander.call(query: query).expanded_query)
  private def perform_search(query) = # actual search logic
end

RSpec.describe SmartSearchTool do
  before do
    allow_any_instance_of(DSPy::Predict).to receive(:call)
      .and_return(double(expanded_query: "expanded test query"))
  end
  it "expands the query before searching" do
    allow(subject).to receive(:perform_search).with("expanded test query").and_return("found 3 results")
    expect(subject.call(query: "test")).to eq("found 3 results")
  end
end
```

### Testing Enum Coercion

Verify that string values from LLM responses deserialize correctly. The LLM may return `"OPEN"` instead of `"open"` -- DSPy.rb handles case-insensitive matching automatically.

---

## Constraints

- All exposed tool methods must use **keyword arguments**. Positional-only parameters generate schemas but keyword arguments produce more reliable LLM interactions.
- Each exposed method becomes a **separate, independent tool**. Method chaining or multi-step sequences within a single tool call are not supported.
- Shared state across tool proxies is scoped to a single `to_tools` call. Separate `to_tools` invocations create separate toolset instances.
- Methods without a Sorbet `sig` produce an empty parameter schema. The LLM will not know what arguments to pass.
