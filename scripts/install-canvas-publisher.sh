#!/usr/bin/env bash
# Install the BIOL 45 Canvas calendar publisher on the Mac as a LaunchAgent.
#
# ☠ It MUST run as a LaunchAgent, not over ssh. `gh` keeps its token in the login
# keychain, which a plain ssh session cannot read — `gh auth status` will report the
# token as invalid there while the same command works fine in the GUI session. The
# 40C publisher has run this way for days; reads succeed over ssh only because the
# repo is public.
set -euo pipefail
HOST="${OTA_HOST:-mac}"
LABEL="com.david.bio45-canvas-calendar"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

scp -q "$REPO/scripts/publish-canvas-calendar.py" "$HOST:/tmp/pub45.py"
ssh "$HOST" "set -e
  D=\"\$HOME/Library/Application Support/Bio45Nutrition\"
  mkdir -p \"\$D\"
  mv /tmp/pub45.py \"\$D/publish_calendar.py\"
  cat > \"\$HOME/Library/LaunchAgents/$LABEL.plist\" <<PLIST
<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/Applications/Xcode.app/Contents/Developer/usr/bin/python3</string>
    <string>\$HOME/Library/Application Support/Bio45Nutrition/publish_calendar.py</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>1800</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>\$HOME/Library/Application Support/Bio45Nutrition/publisher.log</string>
  <key>StandardErrorPath</key><string>\$HOME/Library/Application Support/Bio45Nutrition/publisher-error.log</string>
</dict></plist>
PLIST
  launchctl bootout gui/\$(id -u)/$LABEL 2>/dev/null || true
  launchctl bootstrap gui/\$(id -u) \"\$HOME/Library/LaunchAgents/$LABEL.plist\"
  launchctl kickstart -k gui/\$(id -u)/$LABEL
  echo 'agent installed and kicked'"
echo "→ verify with: ssh $HOST 'tail -3 ~/Library/Application\\ Support/Bio45Nutrition/publisher.log'"
