#!/bin/bash
# Slack notification. The default NOTIFY_CMD when SLACK_WEBHOOK_URL is set (see the Makefile).
# Usage: AI_FLOW_NOTIFY_KIND=<kind> AI_FLOW_NOTIFY_TITLE=<title> AI_FLOW_NOTIFY_ISSUE_URL=<url> ./scripts/notify-slack.sh < body
#
# It follows the notification contract every NOTIFY_CMD gets (docs/setup.md): the body on stdin,
# the rest in AI_FLOW_NOTIFY_* environment variables, success reported by the exit code.
# The payload is built with jq so that quotes, newlines, and backslashes in the body
# do not break it (essential, since review text is passed through as is).

set -uo pipefail

KIND="${AI_FLOW_NOTIFY_KIND:-}"
TITLE="${AI_FLOW_NOTIFY_TITLE:?AI_FLOW_NOTIFY_TITLE is required}"
ISSUE_URL="${AI_FLOW_NOTIFY_ISSUE_URL:?AI_FLOW_NOTIFY_ISSUE_URL is required}"
BODY=$(cat)

if [ -z "${SLACK_WEBHOOK_URL:-}" ]; then
  echo "Error: the SLACK_WEBHOOK_URL environment variable is not set. See .env." >&2
  exit 1
fi

case "$KIND" in
  done)     EMOJI=":white_check_mark:" ;;
  waiting)  EMOJI=":raising_hand:" ;;
  aborted)  EMOJI=":x:" ;;
  progress) EMOJI=":hammer:" ;;
  *)        EMOJI=":robot_face:" ;;
esac

# The agents reply in GitHub markdown, but Slack mrkdwn uses *x* for bold,
# so ** would be shown literally. Collapse it to a single asterisk here
PAYLOAD=$(jq -n --arg emoji "$EMOJI" --arg title "$TITLE" --arg url "$ISSUE_URL" --arg body "$BODY" \
  '($body | gsub("\\*\\*"; "*")) as $b
   | {text: ($emoji + " *" + $title + "*\n*Issue:* " + $url + "\n\n" + $b)}')

# Always check the result, so that a failure is never silently swallowed.
# The time limits keep an unresponsive endpoint from holding the flow (a notification never stops it, but a hang would)
HTTP_CODE=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 10 --max-time 30 \
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
