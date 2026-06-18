"""
Sprint E — WhatsApp Business API Integration.

Runs the full sprint_e_whatsapp.yaml workflow:
  list settings → read whatsapp.meta.api_key → update phone_id →
  test whatsapp endpoint (graceful failure in test env).

Run with:
    pytest tests/workflows/e2e/test_sprint_e_whatsapp.py -v
"""
from __future__ import annotations

from pathlib import Path

import pytest
from httpx import AsyncClient

import tests.workflows  # noqa: F401
from tests.workflows.engine import WorkflowRunner, WORKFLOWS_DIR



@pytest.mark.asyncio
async def test_sprint_e_whatsapp(client: AsyncClient, tmp_path):
    """
    Validates WhatsApp Meta Cloud API wiring:
    - Settings CRUD for whatsapp keys works.
    - Test endpoint returns 200 with channel="whatsapp" even when unconfigured
      (graceful degradation, not a 500).
    """
    runner = WorkflowRunner(client, debug=False, snapshot_dir=tmp_path)
    ctx = await runner.run(WORKFLOWS_DIR / "sprint_e_whatsapp.yaml")

    # Settings read/write
    assert ctx.get("wa_key_setting.key") == "whatsapp.meta.api_key"
    assert ctx.get("updated_phone_id.key") == "whatsapp.meta.phone_id"

    # Test endpoint: must respond with channel=whatsapp and a message
    wa_result = ctx.get("wa_test_result")
    assert wa_result is not None
    assert wa_result.get("channel") == "whatsapp", (
        f"Expected channel='whatsapp', got {wa_result.get('channel')!r}"
    )
    assert wa_result.get("message") is not None, "No message in WhatsApp test response"

    # In test env, api_key is blank → success must be False (graceful fallback)
    # But if someone has set api_key in test settings, success=True is also fine.
    assert "success" in wa_result, "Response missing 'success' field"

    print("\n" + runner.summary())

