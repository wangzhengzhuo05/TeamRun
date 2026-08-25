#!/bin/bash
# Why: remove only the TeamRun PATH symlink created by after-install.sh.
set -e

link="/usr/bin/teamrun"

if [ -L "$link" ]; then
  target="$(readlink "$link" || true)"
  case "$target" in
    /opt/TeamRun/*|/opt/teamrun/*)
      rm -f "$link"
      ;;
  esac
fi

exit 0
