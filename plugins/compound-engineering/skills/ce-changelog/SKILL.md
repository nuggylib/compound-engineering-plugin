---
name: ce-changelog
description: Create engaging changelogs for recent merges to main branch
argument-hint: "[optional: daily|weekly, or time period in days]"
disable-model-invocation: true
---

Create a fun, engaging changelog for an internal development team. Summarize the latest merges to the main branch, highlight new features and bug fixes, and credit contributors.

## Time Period

- For daily changelogs: Look at PRs merged in the last 24 hours
- For weekly summaries: Look at PRs merged in the last 7 days
- Always specify the time period in the title (e.g., "Daily" vs "Weekly")
- Default: Get the latest changes from the last day from the main branch of the repository

## PR Analysis

Analyze the provided GitHub changes and related issues. Look for:

1. New features
2. Bug fixes
3. Other significant changes or improvements
4. Issue references and details
5. Contributor names
6. PR descriptions via `gh` CLI
7. Check PR labels to identify feature type (feature, bug, chore, etc.)
8. Look for breaking changes and highlight them prominently
9. Include PR numbers for traceability
10. Check if PRs are linked to issues and include issue context

## Content Priorities

1. Breaking changes (if any) - MUST be at the top
2. User-facing features
3. Critical bug fixes
4. Performance improvements
5. Developer experience improvements
6. Documentation updates

## Formatting Guidelines

1. Keep it concise and to the point
2. Highlight the most important changes first
3. Group similar changes together (e.g., all new features, all bug fixes)
4. Include issue references where applicable
5. Credit contributors by name
6. Add a touch of humor or playfulness to make it engaging
7. Use emojis sparingly to add visual interest
8. Keep total message under 2000 characters for Discord
9. Use consistent emoji for each section
10. Format code/technical terms in backticks
11. Include PR numbers in parentheses (e.g., "Fixed login bug (#123)")

## Deployment Notes

When relevant, include:

- Database migrations required
- Environment variable updates needed
- Manual intervention steps post-deploy
- Dependencies that need updating

Output format:

<change_log>

# 🚀 [Daily/Weekly] Change Log: [Current Date]

## 🚨 Breaking Changes (if any)

[List any breaking changes that require immediate attention]

## 🌟 New Features

[List new features here with PR numbers]

## 🐛 Bug Fixes

[List bug fixes here with PR numbers]

## 🛠️ Other Improvements

[List other significant changes or improvements]

## 🙌 Shoutouts

[Mention contributors and their contributions]

## 🎉 Fun Fact of the Day

[Include a brief, work-related fun fact or joke]

</change_log>

## Style Guide Review

Review the changelog against the EVERY_WRITE_STYLE.md file line by line. Use parallel agents for speed.

Final output: only the content within the <change_log> tags. Exclude thought process and original data.

## Discord Posting (Optional)

Optional: Post changelogs to Discord via webhook:

```
# Set your Discord webhook URL
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN"

# Post using curl
curl -H "Content-Type: application/json" \
  -d "{\"content\": \"{{CHANGELOG}}\"}" \
  $DISCORD_WEBHOOK_URL
```

Webhook URL path: Discord server → Server Settings → Integrations → Webhooks → New Webhook.

## Error Handling

- If no changes in the time period, post a "quiet day" message: "🌤️ Quiet day! No new changes merged."
- If unable to fetch PR details, list the PR numbers for manual review
- Always validate message length before posting to Discord (max 2000 chars)

## Schedule Recommendations

- Run daily at 6 AM NY time for previous day's changes
- Run weekly summary on Mondays for the previous week
- Special runs after major releases or deployments

## Audience Considerations

Adjust the tone and detail level based on the channel:

- **Dev team channels**: Include technical details, performance metrics, code snippets
- **Product team channels**: Focus on user-facing changes and business impact
- **Leadership channels**: Highlight progress on key initiatives and blockers
