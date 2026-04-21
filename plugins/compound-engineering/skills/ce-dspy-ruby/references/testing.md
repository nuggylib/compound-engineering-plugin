# Testing

## VCR Setup for Rails

```ruby
VCR.configure do |config|
  config.cassette_library_dir = "spec/vcr_cassettes"
  config.hook_into :webmock
  config.configure_rspec_metadata!
  config.filter_sensitive_data('<GEMINI_API_KEY>') { ENV['GEMINI_API_KEY'] }
  config.filter_sensitive_data('<OPENAI_API_KEY>') { ENV['OPENAI_API_KEY'] }
end
```

## Signature Schema Tests

Test that signatures produce valid schemas without calling any LLM:

```ruby
RSpec.describe ClassifyResearchQuery do
  it "has required input fields" do
    schema = described_class.input_json_schema
    expect(schema[:required]).to include("query")
  end

  it "has typed output fields" do
    schema = described_class.output_json_schema
    expect(schema[:properties]).to have_key(:search_strategy)
  end
end
```

## Tool Tests with Mocked Predictions

```ruby
RSpec.describe RerankTool do
  let(:tool) { described_class.new }

  it "skips LLM for small result sets" do
    expect(DSPy::Predict).not_to receive(:new)
    result = tool.call(query: "test", items: [{ id: "1" }])
    expect(result[:reranked]).to be false
  end

  it "calls LLM for large result sets", :vcr do
    items = 10.times.map { |i| { id: i.to_s, title: "Item #{i}" } }
    result = tool.call(query: "relevant items", items: items)
    expect(result[:reranked]).to be true
  end
end
```

## Guidelines for Testing

- **Test schemas without LLM** — Validate `input_json_schema` and `output_json_schema` in unit tests
- **VCR for integration tests** — Record real HTTP interactions, never mock LLM responses by hand
