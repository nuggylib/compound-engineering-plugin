# Architecture - DHH Rails Style

<routing>
## Routing

Everything maps to CRUD. Nested resources for related actions:

```ruby
Rails.application.routes.draw do
  resources :boards do
    resources :cards do
      resource :closure
      resource :goldness
      resource :not_now
      resources :assignments
      resources :comments
    end
  end
end
```

**Verb-to-noun conversion:**
| Action | Resource |
|--------|----------|
| close a card | `card.closure` |
| watch a board | `board.watching` |
| mark as golden | `card.goldness` |
| archive a card | `card.archival` |

**Shallow nesting** - `resources :cards, shallow: true` avoids deep URLs (`/boards/:id/cards` but `/cards/:id`).

**Singular resources** for one-per-parent: `resource :closure` (not `resources`).

**Resolve for URL generation:** `resolve("Comment") { |comment| [comment.card, anchor: dom_id(comment)] }`
</routing>

<multi_tenancy>
## Multi-Tenancy (Path-Based)

**Middleware extracts tenant** from URL prefix:

```ruby
class TenantExtractor
  def initialize(app) = @app = app
  def call(env)
    if match = env["PATH_INFO"].match(%r{^/(\d+)(/.*)?$})
      env["SCRIPT_NAME"] = "/#{match[1]}"
      env["PATH_INFO"] = match[2] || "/"
    end
    @app.call(env)
  end
end
```

**Cookie scoping** per tenant: `cookies.signed[:session_id] = { value: session.id, path: "/#{Current.account.id}" }`

**Background job context** - serialize tenant:
```ruby
class ApplicationJob < ActiveJob::Base
  around_perform do |job, block|
    Current.set(account: job.arguments.first.account) { block.call }
  end
end
# Recurring jobs: Account.find_each { |acct| Current.set(account: acct) { process(acct) } }
```

**Controller security** - always scope through tenant:
```ruby
# Good - scoped through user's accessible records
@card = Current.user.accessible_cards.find(params[:id])

# Avoid - direct lookup
@card = Card.find(params[:id])
```
</multi_tenancy>

<authentication>
## Authentication

Custom passwordless magic link auth (~150 lines total):

```ruby
class Session < ApplicationRecord
  belongs_to :user
  before_create { self.token = SecureRandom.urlsafe_base64(32) }
end

class MagicLink < ApplicationRecord
  belongs_to :user
  before_create { self.code = SecureRandom.random_number(100_000..999_999).to_s; self.expires_at = 15.minutes.from_now }
  def expired? = expires_at < Time.current
end
```

**Why not Devise:** ~150 lines vs massive dependency, no password storage liability, full control over flow.

**Bearer token** for APIs:
```ruby
module Authentication
  extend ActiveSupport::Concern
  included { before_action :authenticate }
  private
    def authenticate
      Current.session = Session.find_by(token: request.headers["Authorization"]&.split(" ")&.last) ||
                        Session.find_by(id: cookies.signed[:session_id])
      redirect_to login_path unless Current.session
    end
end
```
</authentication>

<background_jobs>
## Background Jobs

Jobs are shallow wrappers calling model methods:

```ruby
class NotifyWatchersJob < ApplicationJob
  def perform(card) = card.notify_watchers
end

module Watchable
  def notify_watchers_later = NotifyWatchersJob.perform_later(self)
  def notify_watchers_now = NotifyWatchersJob.perform_now(self)
  def notify_watchers = watchers.each { |w| WatcherMailer.notification(w, self).deliver_later }
end
```

**Naming convention:** `_later` suffix for async, `_now` suffix for immediate.

**Database-backed** with Solid Queue:
- No Redis required
- Same transactional guarantees as your data
- Simpler infrastructure

**Transaction safety:**
```ruby
# config/application.rb
config.active_job.enqueue_after_transaction_commit = true
```

**Error handling** by type:
```ruby
class DeliveryJob < ApplicationJob
  retry_on Net::OpenTimeout, Net::ReadTimeout, wait: :polynomially_longer  # Transient - retry
  discard_on Net::SMTPSyntaxError { |job, error| Sentry.capture_exception(error, level: :info) }  # Permanent - discard
end
```

**Batch processing** with `ActiveJob::Continuable`: use `checkpoint!` inside `in_batches.each_record` to resume from interruption point.
</background_jobs>

<database_patterns>
## Database Patterns

**UUIDs as primary keys** (time-sortable UUIDv7):
```ruby
# migration
create_table :cards, id: :uuid do |t|
  t.references :board, type: :uuid, foreign_key: true
end
```

Benefits: No ID enumeration, distributed-friendly, client-side generation.

**State as records** (not booleans):
```ruby
class Card::Closure < ApplicationRecord
  belongs_to :card; belongs_to :creator, class_name: "User"
end
# Card.joins(:closure) = closed, Card.where.missing(:closure) = open
```

**Hard deletes** - no soft delete. Use `card.destroy!` + `card.record_event(:deleted, by: Current.user)` for auditing.

**Counter caches:** `belongs_to :card, counter_cache: true` -- `card.comments_count` without query.

**Account scoping** on every table: `default_scope { where(account: Current.account) }`.
</database_patterns>

<current_attributes>
## Current Attributes

Use `Current` for request-scoped state:

```ruby
# app/models/current.rb
class Current < ActiveSupport::CurrentAttributes
  attribute :session, :user, :account, :request_id

  delegate :user, to: :session, allow_nil: true

  def account=(account)
    super
    Time.zone = account&.time_zone || "UTC"
  end
end
```

Set in controller via `before_action`: `Current.session = authenticated_session; Current.account = Account.find(params[:account_id])`.

Use throughout app: `belongs_to :creator, default: -> { Current.user }`.
</current_attributes>

<caching>
## Caching

**HTTP caching** with ETags: `fresh_when etag: [@card, Current.user.timezone]`

**Russian doll caching** (fragment caching with nesting):
```erb
<% cache @board do %>
  <% @board.cards.each do |card| %>
    <% cache card do %>
      <%= render card %>
    <% end %>
  <% end %>
<% end %>
```

**Cache invalidation** via `belongs_to :board, touch: true`.

**Solid Cache** - database-backed:
- No Redis required
- Consistent with application data
- Simpler infrastructure
</caching>

<configuration>
## Configuration

**ENV.fetch with defaults:**
```ruby
config.active_job.queue_adapter = ENV.fetch("QUEUE_ADAPTER", "solid_queue").to_sym
config.cache_store = ENV.fetch("CACHE_STORE", "solid_cache").to_sym
```

**Multiple databases** in `config/database.yml`: separate `primary`, `cable`, `queue`, `cache` entries each with their own `migrations_paths`.

**Switch adapters via ENV:** `ENV.fetch("DATABASE_ADAPTER", "sqlite3")`. **CSP extensible via ENV:** `policy.script_src :self, *ENV.fetch("CSP_SCRIPT_SRC", "").split(",")`.
</configuration>

<testing>
## Testing

**Minitest**, not RSpec. **Fixtures** instead of factories:

```ruby
class CardTest < ActiveSupport::TestCase
  test "closing a card creates a closure" do
    card = cards(:one)  # loaded from test/fixtures/cards.yml
    card.close
    assert card.closed?
    assert_not_nil card.closure
  end
end

class CardsControllerTest < ActionDispatch::IntegrationTest
  test "closing a card" do
    sign_in users(:alice)
    post card_closure_path(cards(:one))
    assert_response :success
  end
end
```

**Tests ship with features** - same commit, not TDD-first but together.

**Regression tests for security fixes** - always.
</testing>

<events>
## Event Tracking

Events are the single source of truth:

```ruby
class Event < ApplicationRecord
  belongs_to :creator, class_name: "User"
  belongs_to :eventable, polymorphic: true
  serialize :particulars, coder: JSON
end

module Eventable
  extend ActiveSupport::Concern
  included { has_many :events, as: :eventable, dependent: :destroy }
  def record_event(action, particulars = {})
    events.create!(creator: Current.user, action: action, particulars: particulars)
  end
end
```

**Webhooks driven by events** - events are the canonical source.
</events>

<email_patterns>
## Email Patterns

**Multi-tenant URL helpers:** Override `default_url_options` to set `script_name: "/#{Current.account.id}"` when `Current.account` is present.

**Timezone-aware delivery:** Wrap mailer body in `Time.use_zone(user.timezone) { ... }`.

**Batch delivery:** `ActiveJob.perform_all_later(users.map { |u| NotificationMailer.digest(u).deliver_later })`

**One-click unsubscribe (RFC 8058):** Use `after_action` to set `List-Unsubscribe-Post` and `List-Unsubscribe` headers.
</email_patterns>

<security_patterns>
## Security Patterns

**XSS prevention** - escape in helpers:
```ruby
def formatted_content(text)
  # Escape first, then mark safe
  simple_format(h(text)).html_safe
end
```

**SSRF protection:** Resolve DNS once, pin the IP, block private networks (`127.`, `10.`, `192.168.`, `172.16-31.`), then use pinned IP for request via `Net::HTTP.start(uri.host, uri.port, ipaddr: ip)`.

**Content Security Policy:**
```ruby
config.content_security_policy do |policy|
  policy.default_src :self; policy.script_src :self; policy.style_src :self, :unsafe_inline
  policy.base_uri :none; policy.form_action :self; policy.frame_ancestors :self
end
```

**ActionText sanitization:** `ActionText::ContentHelper.allowed_tags = %w[strong em a ul ol li p br h1 h2 h3 h4 blockquote]`
</security_patterns>

<active_storage>
## Active Storage Patterns

**Variant preprocessing:**
```ruby
class User < ApplicationRecord
  has_one_attached :avatar do |attachable|
    attachable.variant :thumb, resize_to_limit: [100, 100], preprocessed: true
    attachable.variant :medium, resize_to_limit: [300, 300], preprocessed: true
  end
end
```

**Direct upload expiry:** `config.active_storage.service_urls_expire_in = 48.hours`

**Avatar optimization:** `expires_in 1.year, public: true` then `redirect_to @user.avatar.variant(:thumb).processed.url`

**Mirror service** for migrations: `service: Mirror, primary: amazon, mirrors: [google]` in `config/storage.yml`.
</active_storage>
