"""
Import all action modules to self-register into the shared registry.

Import this module once before running any workflow.
The WorkflowRunner imports it automatically.
"""
from . import assertions   # noqa: F401
from . import contractors  # noqa: F401
from . import maintenance  # noqa: F401
from . import properties   # noqa: F401
