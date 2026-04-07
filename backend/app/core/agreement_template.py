"""
Ugandan Residential Tenancy Agreement template.

Usage:
    from app.core.agreement_template import render_agreement

    html = render_agreement(
        landlord_name="John Mukasa",
        tenant_name="Alice Smith",
        tenant_nin="CM12345678AGBCD",
        property_address="12 Kampala Road, Kampala, Uganda",
        unit_name="Unit 3B",
        start_date="1 January 2026",
        end_date="31 December 2026",
        monthly_rent="500,000",
        monthly_rent_words="Five Hundred Thousand",
        currency="UGX",
        deposit_amount="500,000",
        deposit_amount_words="Five Hundred Thousand",
        rent_day_of_month=1,
        notice_period_days=30,
        grace_period_days=5,
        late_fee_type="flat",
        late_fee_value="50,000",
        agreement_date="1 January 2026",
    )

All values are pre-formatted strings — callers are responsible for formatting
numbers with commas and converting amounts to words before calling this function.
"""

from __future__ import annotations

import math

# ── Number to words (Uganda-safe, up to ~1 billion) ──────────────────────────

_ONES = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _three_to_words(n: int) -> str:
    if n == 0:
        return ""
    elif n < 20:
        return _ONES[n]
    elif n < 100:
        return _TENS[n // 10] + ("" if n % 10 == 0 else " " + _ONES[n % 10])
    else:
        rest = _three_to_words(n % 100)
        return _ONES[n // 100] + " Hundred" + (" " + rest if rest else "")


def number_to_words(n: float) -> str:
    """Convert a non-negative number to English words (ignores cents)."""
    n = int(math.floor(n))
    if n == 0:
        return "Zero"
    parts: list[str] = []
    billions = n // 1_000_000_000
    millions = (n % 1_000_000_000) // 1_000_000
    thousands = (n % 1_000_000) // 1_000
    remainder = n % 1_000
    if billions:
        parts.append(_three_to_words(billions) + " Billion")
    if millions:
        parts.append(_three_to_words(millions) + " Million")
    if thousands:
        parts.append(_three_to_words(thousands) + " Thousand")
    if remainder:
        parts.append(_three_to_words(remainder))
    return " ".join(parts)


def format_amount(n: float) -> str:
    """Format a number with comma separators, no decimal places."""
    return f"{int(n):,}"


# ── Agreement HTML template ───────────────────────────────────────────────────

_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  body {{ font-family: Georgia, serif; font-size: 14px; line-height: 1.8;
         color: #111; max-width: 800px; margin: 0 auto; padding: 40px 20px; }}
  h1 {{ text-align: center; font-size: 20px; text-transform: uppercase;
        letter-spacing: 1px; margin-bottom: 4px; }}
  h2 {{ font-size: 15px; margin-top: 28px; margin-bottom: 8px;
        text-transform: uppercase; border-bottom: 1px solid #ccc;
        padding-bottom: 4px; }}
  .parties {{ border: 1px solid #ccc; padding: 16px 20px; margin: 20px 0;
              background: #fafafa; }}
  .parties table {{ width: 100%; border-collapse: collapse; }}
  .parties td {{ padding: 4px 8px; vertical-align: top; }}
  .parties td:first-child {{ width: 200px; font-weight: bold; }}
  .financial {{ border: 1px solid #ccc; padding: 12px 20px; margin: 16px 0;
                background: #f9f9f9; }}
  .financial table {{ width: 100%; border-collapse: collapse; }}
  .financial td {{ padding: 5px 8px; border-bottom: 1px solid #eee; }}
  .financial td:first-child {{ width: 220px; color: #555; }}
  .financial td:last-child {{ font-weight: bold; }}
  .clause {{ margin-bottom: 14px; }}
  .clause p {{ margin: 0 0 8px 0; text-align: justify; }}
  ol.clauses {{ padding-left: 24px; }}
  ol.clauses > li {{ margin-bottom: 10px; }}
  .signature-block {{ margin-top: 40px; page-break-inside: avoid; }}
  .sig-row {{ display: flex; gap: 60px; margin-top: 20px; }}
  .sig-col {{ flex: 1; }}
  .sig-line {{ border-bottom: 1px solid #333; margin-bottom: 6px; height: 50px;
               display: flex; align-items: flex-end; padding-bottom: 4px; }}
  .sig-label {{ font-size: 12px; color: #555; }}
  .sig-img {{ max-width: 200px; max-height: 80px; border: 1px solid #ddd;
              display: block; margin: 8px 0; }}
  .stamp {{ font-size: 11px; color: #888; margin-top: 6px; }}
  .page-break {{ page-break-before: always; }}
</style>
</head>
<body>

<h1>Residential Tenancy Agreement</h1>
<p style="text-align:center; font-size:13px; color:#555;">
  Made and entered into on <strong>{agreement_date}</strong>,
  in Kampala, Republic of Uganda
</p>

<!-- ═══════════════════════════════ PARTIES ════════════════════════════════ -->
<h2>1. Parties</h2>
<div class="parties">
<table>
  <tr>
    <td>LANDLORD:</td>
    <td><strong>{landlord_name}</strong></td>
  </tr>
  <tr>
    <td>TENANT:</td>
    <td>
      <strong>{tenant_name}</strong><br/>
      National ID / Passport No.: <strong>{tenant_nin}</strong>
    </td>
  </tr>
  <tr>
    <td>PREMISES:</td>
    <td>{property_address} — <strong>{unit_name}</strong></td>
  </tr>
</table>
</div>

<!-- ═══════════════════════════════ FINANCIAL TERMS ══════════════════════ -->
<h2>2. Financial Terms</h2>
<div class="financial">
<table>
  <tr>
    <td>Monthly Rent</td>
    <td>{currency} {monthly_rent} ({monthly_rent_words} Shillings only)</td>
  </tr>
  <tr>
    <td>Security Deposit</td>
    <td>{currency} {deposit_amount} ({deposit_amount_words} Shillings only)</td>
  </tr>
  <tr>
    <td>Rent Due Date</td>
    <td>Day {rent_day_of_month} of each month</td>
  </tr>
  <tr>
    <td>Grace Period</td>
    <td>{grace_period_days} days after due date</td>
  </tr>
  <tr>
    <td>Late Payment Fee</td>
    <td>{late_fee_description}</td>
  </tr>
  <tr>
    <td>Currency</td>
    <td>{currency}</td>
  </tr>
</table>
</div>

<!-- ═══════════════════════════════ LEASE TERM ════════════════════════════ -->
<h2>3. Lease Term</h2>
<div class="clause">
  <p>
    This Agreement shall commence on <strong>{start_date}</strong> and shall
    continue until <strong>{end_date_display}</strong>
    (<strong>&ldquo;the Term&rdquo;</strong>), unless sooner determined
    in accordance with the provisions hereof.
  </p>
  <p>
    Either party may terminate this Agreement by giving not less than
    <strong>{notice_period_days} days&rsquo; written notice</strong>
    to the other party.
  </p>
</div>

<!-- ═══════════════════════════════ RENT & DEPOSIT ════════════════════════ -->
<h2>4. Rent and Security Deposit</h2>
<ol class="clauses">
  <li>
    The Tenant shall pay the monthly rent of <strong>{currency} {monthly_rent}</strong>
    on or before day <strong>{rent_day_of_month}</strong> of each calendar month.
  </li>
  <li>
    Rent shall be paid by bank transfer, mobile money (MTN or Airtel), cash, or
    any other method agreed in writing between the parties.
  </li>
  <li>
    A grace period of <strong>{grace_period_days} days</strong> is allowed
    after the due date.  Rent unpaid after the grace period shall attract
    a late payment fee of <strong>{late_fee_description}</strong>.
  </li>
  <li>
    A refundable security deposit of <strong>{currency} {deposit_amount}</strong>
    shall be paid before or at the commencement of this Agreement.
    The deposit shall be held by the Landlord and returned within
    30 days of the termination of this Agreement, subject to any lawful deductions
    for rent arrears, damages beyond fair wear and tear, or unpaid utilities.
  </li>
  <li>
    The Landlord shall issue written receipts for all payments received.
  </li>
</ol>

<!-- ═══════════════════════════════ TENANT OBLIGATIONS ═══════════════════ -->
<h2>5. Tenant&rsquo;s Obligations</h2>
<ol class="clauses">
  <li>
    To pay rent and all lawful charges on the dates stipulated in this Agreement.
  </li>
  <li>
    To use the Premises solely for residential purposes and not to carry out
    any trade, business, or commercial activity without the prior written
    consent of the Landlord.
  </li>
  <li>
    To keep the Premises and all fixtures, fittings, and appliances therein
    in a clean and habitable condition and in good repair, reasonable wear
    and tear excepted.
  </li>
  <li>
    Not to make any structural alterations, additions, or improvements to the
    Premises without the prior written consent of the Landlord.
  </li>
  <li>
    Not to sub-let, assign, or otherwise part with possession of the Premises
    or any part thereof without the prior written consent of the Landlord.
  </li>
  <li>
    To promptly report to the Landlord any damage, defect, or disrepair
    requiring attention.
  </li>
  <li>
    Not to keep animals or pets on the Premises without the prior written
    consent of the Landlord.
  </li>
  <li>
    Not to carry on any activity that constitutes a nuisance, annoyance, or
    disturbance to neighbouring occupiers or that is contrary to law.
  </li>
  <li>
    To permit the Landlord or its duly authorised agents to enter the Premises
    at all reasonable times, having given not less than 24 hours&rsquo; prior notice
    (except in an emergency), for the purposes of inspection, repair, or showing
    the Premises to prospective tenants or purchasers.
  </li>
  <li>
    Not to smoke inside the Premises.
  </li>
  <li>
    To pay all water, electricity, and other utility charges attributable to
    the Premises during the Term, unless otherwise agreed in writing.
  </li>
  <li>
    On expiry or termination of this Agreement, to vacate the Premises, return
    all keys, and leave the Premises in the same condition as at the commencement
    of the Term, reasonable wear and tear excepted.
  </li>
</ol>

<!-- ═══════════════════════════════ LANDLORD OBLIGATIONS ═════════════════ -->
<h2>6. Landlord&rsquo;s Obligations</h2>
<ol class="clauses">
  <li>
    To ensure that the Premises are in a habitable condition at the commencement
    of the Term.
  </li>
  <li>
    To maintain the structural integrity, roofing, external walls, and shared
    areas of the building.
  </li>
  <li>
    To carry out repairs and maintenance of the Premises within a reasonable time
    upon notification by the Tenant.
  </li>
  <li>
    Not to interfere with the Tenant&rsquo;s quiet enjoyment of the Premises during
    the Term, provided the Tenant is not in breach of this Agreement.
  </li>
  <li>
    To give the Tenant reasonable notice before entering the Premises except in
    case of emergency.
  </li>
  <li>
    To return the security deposit (less any lawful deductions) within 30 days
    of the termination or expiry of this Agreement.
  </li>
</ol>

<!-- ═══════════════════════════════ TERMINATION ══════════════════════════ -->
<h2>7. Termination</h2>
<ol class="clauses">
  <li>
    Either party may terminate this Agreement by giving
    <strong>{notice_period_days} days&rsquo; written notice</strong> to the other.
  </li>
  <li>
    The Landlord may terminate this Agreement immediately upon material breach
    by the Tenant, including but not limited to: non-payment of rent for more
    than 30 days, causing serious damage to the Premises, sub-letting without
    consent, or engaging in illegal activities on the Premises.
  </li>
  <li>
    On termination, the Tenant shall peacefully surrender possession of the
    Premises and all keys to the Landlord.
  </li>
</ol>

<!-- ═══════════════════════════════ GENERAL ══════════════════════════════ -->
<h2>8. General Provisions</h2>
<ol class="clauses">
  <li>
    <strong>Governing Law.</strong>  This Agreement shall be governed by and
    construed in accordance with the laws of the Republic of Uganda.  Any
    dispute arising from this Agreement shall be resolved first by negotiation
    and, if unresolved, by the Rent Restriction Tribunal or courts of competent
    jurisdiction in Uganda.
  </li>
  <li>
    <strong>Entire Agreement.</strong>  This Agreement constitutes the entire
    agreement between the parties with respect to the Premises and supersedes
    all prior negotiations, representations, warranties, and understandings.
  </li>
  <li>
    <strong>Amendments.</strong>  No amendment, variation, or modification of
    this Agreement shall be effective unless made in writing and signed by both
    parties.
  </li>
  <li>
    <strong>Severability.</strong>  If any provision of this Agreement is found
    to be unlawful, void, or unenforceable, that provision shall be severed and
    shall not affect the validity and enforceability of the remaining provisions.
  </li>
  <li>
    <strong>Notices.</strong>  All notices under this Agreement shall be in writing
    and delivered by hand, email, or registered post to the last known address of
    the respective party.
  </li>
  <li>
    <strong>Inventory.</strong>  An inventory of fixtures, fittings, and appliances
    shall be prepared and agreed by both parties at the commencement of the Term.
    Any such inventory forms part of this Agreement.
  </li>
</ol>

<!-- ═══════════════════════════════ SIGNATURES ═══════════════════════════ -->
<h2>9. Signatures</h2>
<p>
  By signing below, both parties confirm they have read and understood this
  Agreement and agree to be bound by its terms.
</p>

<div class="signature-block">
  <div class="sig-row">
    <!-- Tenant -->
    <div class="sig-col">
      <p><strong>TENANT</strong></p>
      <div class="sig-line">
        {tenant_sig_img}
      </div>
      <div class="sig-label">Signature</div>
      <p style="margin-top:12px;">
        Name: <strong>{tenant_name}</strong><br/>
        NIN: {tenant_nin}<br/>
        Date: {tenant_signed_at_display}
      </p>
    </div>

    <!-- Landlord / Manager -->
    <div class="sig-col">
      <p><strong>LANDLORD / AUTHORISED REPRESENTATIVE</strong></p>
      <div class="sig-line">
        {landlord_sig_img}
      </div>
      <div class="sig-label">Signature</div>
      <p style="margin-top:12px;">
        Name: <strong>{landlord_signer_name_display}</strong><br/>
        Organisation: {landlord_name}<br/>
        Date: {landlord_signed_at_display}
      </p>
    </div>
  </div>
</div>

<p class="stamp" style="margin-top:40px; font-size:11px; color:#999; text-align:center;">
  This document was generated electronically by Crib Property Management
  on {agreement_date}.  Electronic signatures are legally binding under
  the Electronic Transactions Act, 2011 (Uganda).
</p>

</body>
</html>
"""


def render_agreement(
    *,
    landlord_name: str,
    tenant_name: str,
    tenant_nin: str,
    property_address: str,
    unit_name: str,
    start_date: str,
    end_date: str | None,
    monthly_rent: float,
    currency: str,
    deposit_amount: float,
    rent_day_of_month: int,
    notice_period_days: int,
    grace_period_days: int,
    late_fee_type: str,
    late_fee_value: float,
    agreement_date: str,
    # Signature fields — optional at generation time; filled in as parties sign
    tenant_signature_data_url: str | None = None,
    tenant_signed_at: str | None = None,
    landlord_signature_data_url: str | None = None,
    landlord_signed_at: str | None = None,
    landlord_signer_name: str | None = None,
) -> str:
    """Render the full tenancy agreement HTML with all variables substituted."""
    monthly_rent_words = number_to_words(monthly_rent)
    deposit_amount_words = number_to_words(deposit_amount)

    if late_fee_type == "flat":
        late_fee_description = f"{currency} {format_amount(late_fee_value)} flat fee"
    elif late_fee_type == "percentage":
        late_fee_description = f"{late_fee_value:.1f}% of outstanding rent"
    else:
        late_fee_description = f"{late_fee_type}: {format_amount(late_fee_value)}"

    end_date_display = end_date if end_date else "month-to-month (rolling)"

    tenant_sig_img = (
        f'<img src="{tenant_signature_data_url}" class="sig-img" alt="Tenant signature"/>'
        if tenant_signature_data_url
        else '<em style="color:#bbb">Pending tenant signature</em>'
    )
    landlord_sig_img = (
        f'<img src="{landlord_signature_data_url}" class="sig-img" alt="Landlord signature"/>'
        if landlord_signature_data_url
        else '<em style="color:#bbb">Pending landlord/manager countersignature</em>'
    )
    tenant_signed_at_display = tenant_signed_at or "—"
    landlord_signed_at_display = landlord_signed_at or "—"
    landlord_signer_name_display = landlord_signer_name or landlord_name

    return _TEMPLATE.format(
        landlord_name=landlord_name,
        tenant_name=tenant_name,
        tenant_nin=tenant_nin or "N/A",
        property_address=property_address,
        unit_name=unit_name,
        start_date=start_date,
        end_date_display=end_date_display,
        monthly_rent=format_amount(monthly_rent),
        monthly_rent_words=monthly_rent_words,
        currency=currency,
        deposit_amount=format_amount(deposit_amount),
        deposit_amount_words=deposit_amount_words,
        rent_day_of_month=rent_day_of_month,
        notice_period_days=notice_period_days,
        grace_period_days=grace_period_days,
        late_fee_description=late_fee_description,
        agreement_date=agreement_date,
        tenant_sig_img=tenant_sig_img,
        landlord_sig_img=landlord_sig_img,
        tenant_signed_at_display=tenant_signed_at_display,
        landlord_signed_at_display=landlord_signed_at_display,
        landlord_signer_name_display=landlord_signer_name_display,
    )
