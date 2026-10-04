#!/bin/zsh
# Install (or reinstall) the review runner as a per-user launchd agent: every 2 minutes it asks the server for
# submissions waiting for review and lets Claude Code judge them (01 §4.17). Log: ~/Library/Logs/proofmarket-review-runner.log
# Stop: launchctl bootout gui/$(id -u)/com.proofmarket.review-runner
set -e
REPO=$(cd "$(dirname "$0")/../.." && pwd)
DEST=$HOME/Library/LaunchAgents/com.proofmarket.review-runner.plist
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
sed -e "s#__HOME__#$HOME#g" -e "s#__REPO__#$REPO#g" "$(dirname "$0")/com.proofmarket.review-runner.plist" > "$DEST"
launchctl bootout "gui/$(id -u)/com.proofmarket.review-runner" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DEST"
echo "installed: $DEST"
