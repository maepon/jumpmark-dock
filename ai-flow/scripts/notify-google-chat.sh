#!/bin/bash
# Google Chat notification. The default NOTIFY_CMD when GOOGLE_CHAT_WEBHOOK_URL is set and SLACK_WEBHOOK_URL is not (see the Makefile).
# Usage: AI_FLOW_NOTIFY_KIND=<kind> AI_FLOW_NOTIFY_TITLE=<title> AI_FLOW_NOTIFY_ISSUE_URL=<url> ./scripts/notify-google-chat.sh < body
#
# It follows the notification contract every NOTIFY_CMD gets (docs/setup.md): the body on stdin,
# the rest in AI_FLOW_NOTIFY_* environment variables, success reported by the exit code.
# It is notify-slack.sh with what Google Chat needs changed (#17, checked against a real space):
#   - Unicode emoji are sent rather than Slack's shortcodes (:x:); whether Google Chat turns shortcodes into emoji was not checked
#   - A message that is too large is refused (HTTP 400), so the body is cut and the reader is sent to the Issue
#   - Content-Type carries charset=UTF-8, as in Google Chat's own examples
# The payload is built with jq so that quotes, newlines, and backslashes in the body
# do not break it (essential, since review text is passed through as is).

set -uo pipefail

KIND="${AI_FLOW_NOTIFY_KIND:-}"
TITLE="${AI_FLOW_NOTIFY_TITLE:?AI_FLOW_NOTIFY_TITLE is required}"
ISSUE_URL="${AI_FLOW_NOTIFY_ISSUE_URL:?AI_FLOW_NOTIFY_ISSUE_URL is required}"
BODY=$(cat)

if [ -z "${GOOGLE_CHAT_WEBHOOK_URL:-}" ]; then
  echo "Error: the GOOGLE_CHAT_WEBHOOK_URL environment variable is not set. See .env." >&2
  exit 1
fi

case "$KIND" in
  done)     EMOJI="✅" ;;
  waiting)  EMOJI="🙋" ;;
  aborted)  EMOJI="❌" ;;
  progress) EMOJI="🔨" ;;
  *)        EMOJI="🤖" ;;
esac

# Google Chat also uses *x* for bold, so **x** is turned into *x* the same way as in notify-slack.sh
# (with a zero-width space on both sides; bold next to Japanese text was checked with it).
# The limit is on size, not on a number of characters: 8000 Japanese characters (about 24 KB in UTF-8) went through,
# 11000 Japanese characters and 32000 ASCII characters were refused with HTTP 400 (2026-10). So the whole text, heading
# and the note about the cut included, is kept within 8000 characters, which passes even when every one is multi-byte.
LIMIT=8000
PAYLOAD=$(jq -n --arg emoji "$EMOJI" --arg title "$TITLE" --arg url "$ISSUE_URL" --arg body "$BODY" --argjson limit "$LIMIT" \
  '($body
    | gsub("\\*\\*(?<t>[^*\\s](?:[^*\n]*[^*\\s])?)\\*\\*"; "​*\(.t)*​")
    | gsub("\\*\\*"; "*")) as $b
   | ($emoji + " *" + $title + "*\n*Issue:* " + $url + "\n\n") as $head
   | "\n\n… (cut: too long for Google Chat; read the rest on the Issue)" as $more
   | {text: (if ($head + $b | length) > $limit
             then $head + $b[0:($limit - ($head | length) - ($more | length))] + $more
             else $head + $b end)}')

# Always check the result, so that a failure is never silently swallowed.
# The time limits keep an unresponsive endpoint from holding the flow (a notification never stops it, but a hang would)
HTTP_CODE=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 10 --max-time 30 \
  -X POST -H 'Content-Type: application/json; charset=UTF-8' \
  --data "$PAYLOAD" "$GOOGLE_CHAT_WEBHOOK_URL" 2>/dev/null)
CURL_STATUS=$?

if [ $CURL_STATUS -ne 0 ]; then
  echo "Error: sending to Google Chat failed (curl exit code ${CURL_STATUS})." >&2
  exit 1
fi

if [ "$HTTP_CODE" != "200" ]; then
  echo "Error: Google Chat returned HTTP $HTTP_CODE. Check the webhook URL (a body that is too large is also refused)." >&2
  exit 1
fi
