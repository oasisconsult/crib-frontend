"""
Example: Receive and validate GeoBox webhooks in a FastAPI app.

Run:
    pip install fastapi uvicorn geobox-sdk
    uvicorn examples.webhook_handler:app --reload
"""

from fastapi import FastAPI, Header, HTTPException, Request
from geobox.services.webhooks import WebhookHandler
from geobox.exceptions import GeoBoxError

app = FastAPI()

WEBHOOK_SECRET = "whsec_YOUR_SECRET_HERE"
handler = WebhookHandler(secret=WEBHOOK_SECRET)


@app.post("/webhooks/geobox")
async def receive_webhook(
    request: Request,
    x_geobox_signature: str = Header(...),
    x_geobox_timestamp: str = Header(...),
):
    body = await request.body()

    try:
        event = handler.verify_and_parse(body, x_geobox_signature, x_geobox_timestamp)
    except GeoBoxError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Route by event type
    if event.event_type == "address.created":
        geocode = event.payload.get("geocode")
        print(f"New address: {geocode}")

    elif event.event_type == "address.verified":
        geocode = event.payload.get("geocode")
        status  = event.payload.get("verification_status")
        print(f"Address {geocode} verified: {status}")

    elif event.event_type == "address.updated":
        geocode = event.payload.get("geocode")
        print(f"Address updated: {geocode}")

    return {"received": True, "event_id": event.event_id}
