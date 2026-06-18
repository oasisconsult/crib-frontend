"""
Import all action modules to self-register into the shared registry.

Import this module once before running any workflow.
The WorkflowRunner imports it automatically.
"""
from . import assertions       # noqa: F401
from . import contractors      # noqa: F401
from . import maintenance      # noqa: F401
from . import properties       # noqa: F401
# Sprint-specific action modules (Sprints A–I)
from . import leases           # noqa: F401
from . import announcements    # noqa: F401
from . import utilities        # noqa: F401
from . import documents        # noqa: F401
from . import settings_actions # noqa: F401
from . import geobox_actions   # noqa: F401
from . import listings_actions # noqa: F401
from . import screenings         # noqa: F401
from . import cicd_actions       # noqa: F401
from . import inspector_actions  # noqa: F401
from . import http_actions       # noqa: F401  — generic http_request for neg tests
