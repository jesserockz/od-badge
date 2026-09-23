"""Entry point for ``python -m od_badge``."""

from __future__ import annotations

import sys

from od_badge.cli import main

if __name__ == "__main__":
    sys.exit(main())
