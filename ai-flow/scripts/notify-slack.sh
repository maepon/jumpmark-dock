#!/bin/bash
# Usage: ./scripts/notify-slack.sh <ISSUE_URL> <MESSAGE>
#
# The payload is built with jq so that quotes, newlines, and backslashes in the message
# do not break it (essential, since review text is passed through as is).

set -uo pipefail

ISSUE_URL="${1:?ISSUE_URL is required}"
MESSAGE="${2:?MESSAGE is required}"

if [ -z "${SLACK_WEBHOOK_URL:-}" ]; then
  echo "Error: the SLACK_WEBHOOK_URL environment variable is not set. See .env." >&2
  exit 1
fi

# The agents reply in GitHub markdown, but Slack mrkdwn uses *x* for bold,
# so ** would be shown literally. Collapse it to a single asterisk here
PAYLOAD=$(jq -n --arg url "$ISSUE_URL" --arg msg "$MESSAGE" \
  '($msg | gsub("\\*\\*"; "*")) as $m
   | {text: (":robot_face: *Claude Code notification*\n*Issue:* " + $url + "\n\n*Details:*\n" + $m)}')

# Always check the result, so that a failure is never silently swallowed
HTTP_CODE=$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST -H 'Content-type: application/json' \
  --data "$PAYLOAD" "$SLACK_WEBHOOK_URL" 2>/dev/null)
CURL_STATUS=$?

if [ $CURL_STATUS -ne 0 ]; then
  echo "Error: sending to Slack failed (curl exit code ${CURL_STATUS})." >&2
  exit 1
fi

if [ "$HTTP_CODE" != "200" ]; then
  echo "Error: Slack returned HTTP $HTTP_CODE. Check the webhook URL." >&2
  exit 1
fi
