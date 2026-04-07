"""
Ugandan Residential House Lease Agreement template (28 clauses).

Usage:
    from app.core.agreement_template import render_agreement

    html = render_agreement(
        landlord_name="John Mukasa",
        tenant_name="Alice Smith",
        tenant_nin="CM12345678AGBCD",
        property_address="12 Kampala Road, Kampala, Uganda",
        unit_name="Unit 3B",
        start_date="1 January 2026",
        end_date="31 December 2026",         # None for rolling
        monthly_rent=700_000,
        currency="UGX",
        deposit_amount=700_000,
        rent_day_of_month=1,
        notice_period_days=30,
        grace_period_days=5,
        late_fee_type="flat",
        late_fee_value=50_000,
        agreement_date="1 January 2026",
    )

All monetary values are floats; the template formats them internally.
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


# ── Agreement HTML template (28 clauses) ─────────────────────────────────────

_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  body {{ font-family: Georgia, serif; font-size: 14px; line-height: 1.8;
         color: #111; padding: 32px 28px; }}
  h1 {{ text-align: center; font-size: 18px; text-transform: uppercase;
        letter-spacing: 1px; margin-bottom: 6px; }}
  .subtitle {{ text-align: center; font-size: 13px; color: #555; margin-bottom: 28px; }}
  .preamble {{ margin-bottom: 22px; text-align: justify; }}
  h2 {{ font-size: 14px; font-weight: bold; margin-top: 22px; margin-bottom: 4px;
        text-transform: uppercase; }}
  p {{ margin: 0 0 10px 0; text-align: justify; }}
  .sub {{ margin-left: 22px; }}
  .financial-box {{ border: 1px solid #ccc; padding: 14px 18px; margin: 18px 0;
                    background: #fafafa; }}
  .financial-box table {{ width: 100%; border-collapse: collapse; }}
  .financial-box td {{ padding: 4px 8px; }}
  .financial-box td:first-child {{ width: 220px; color: #555; font-size: 13px; }}
  .financial-box td:last-child {{ font-weight: bold; }}
  .signature-block {{ margin-top: 48px; page-break-inside: avoid; }}
  .sig-row {{ display: flex; gap: 60px; margin-top: 20px; }}
  .sig-col {{ flex: 1; }}
  .sig-line {{ border-bottom: 1px solid #333; margin-bottom: 6px; height: 56px;
               display: flex; align-items: flex-end; padding-bottom: 4px; }}
  .sig-label {{ font-size: 12px; color: #555; }}
  .sig-img {{ max-width: 200px; max-height: 80px; border: 1px solid #ddd;
              display: block; margin: 8px 0; }}
  .stamp {{ font-size: 11px; color: #999; text-align: center; margin-top: 40px; }}
  .date-line {{ margin: 28px 0 8px 0; }}
</style>
</head>
<body>

<h1>Residential House Lease Agreement</h1>
<p class="subtitle">This Residential House Lease Agreement (&ldquo;Lease&rdquo;) is made and
effective this <strong>{agreement_date}</strong>, by and between
<strong>{landlord_name}</strong> (&ldquo;Landlord&rdquo;) and
<strong>{tenant_name}</strong> (&ldquo;Tenant,&rdquo; whether one or more)
of NIN&nbsp;<strong>{tenant_nin}</strong>.&nbsp; This Lease creates joint and several
liability in the case of multiple Tenants.</p>

<div class="financial-box">
<table>
  <tr><td>Monthly Rent</td><td>{currency} {monthly_rent} ({monthly_rent_words} Uganda Shillings only)</td></tr>
  <tr><td>Security Deposit</td><td>{currency} {deposit_amount} ({deposit_amount_words} Uganda Shillings only)</td></tr>
  <tr><td>Rent Due Date</td><td>Day {rent_day_of_month} of each calendar month</td></tr>
  <tr><td>Grace Period</td><td>{grace_period_days} days</td></tr>
  <tr><td>Late Payment Fee</td><td>{late_fee_description}</td></tr>
  <tr><td>Tenancy Period</td><td>{start_date} &ndash; {end_date_display}</td></tr>
  <tr><td>Notice Period</td><td>{notice_period_days} days written notice by either party</td></tr>
</table>
</div>

<h2>1.&nbsp; Premises.</h2>
<p>Landlord hereby rents to Tenant and Tenant accepts in its present condition the house at
the following address: <strong>{property_address}</strong> &mdash;
<strong>{unit_name}</strong> (the &ldquo;House&rdquo;).</p>

<h2>2.&nbsp; Term.</h2>
<p>The term of this Lease shall start on <strong>{start_date}</strong>.&nbsp; In the event
that Landlord is unable to provide the House on the exact start date, then Landlord shall
provide the House as soon as possible, and Tenant&rsquo;s obligation to pay rent shall abate
during such period.&nbsp; Tenant shall not be entitled to any other remedy for any delay in
providing the House.</p>
<p>A minimum of six months tenancy, monthly rolling thereafter from <strong>{start_date}</strong>
to rent the house specified only.&nbsp; <strong>{notice_period_days} days&rsquo;</strong> notice
needs to be given if the Tenant or Landlord wishes to end the agreement.</p>

<h2>3.&nbsp; Rent.</h2>
<p>Tenant agrees to pay, without demand, to Landlord as rent for the House the sum of
<strong>{currency}&nbsp;{monthly_rent}</strong> ({monthly_rent_words} Uganda Shillings only)
per month in advance on the <strong>{rent_day_of_month}{rent_day_suffix}</strong> day of each
calendar month.&nbsp; Landlord may impose a late payment charge of
<strong>{late_fee_description}</strong> for any amount that is more than
<strong>{grace_period_days}</strong> days late.&nbsp; Rent will be prorated if the term does
not start on the first day of the month or for any other partial month of the term.</p>
<p>Initial advance rent ({advance_months} month{advance_months_plural}) is to be paid by the
Tenant on or before the signing of this agreement.</p>

<h2>4.&nbsp; Security Deposit.</h2>
<p>Upon execution of this Lease, Tenant deposits with Landlord
<strong>{currency}&nbsp;{deposit_amount}</strong> ({deposit_amount_words} Uganda Shillings only),
as security for the performance by Tenant of the terms of this Lease to be returned to Tenant
without interest, following the full and faithful performance by Tenant of this Lease.&nbsp; In
the event of damage to the House caused by Tenant or Tenant&rsquo;s family, agents or visitors,
Landlord may use funds from the deposit to repair, but is not limited to this fund and Tenant
remains liable.</p>

<h2>5.&nbsp; Quiet Enjoyment.</h2>
<p>Landlord agrees that if Tenant timely pays the rent and performs the other obligations in
this Lease, Landlord will not interfere with Tenant&rsquo;s peaceful use and enjoyment of the
House.</p>

<h2>6.&nbsp; Use of Premises.</h2>
<p class="sub">A.&nbsp; The House shall be used and occupied by Tenant exclusively as a private
single-family residence.&nbsp; Neither the House nor any part of the House or yard shall be used
at any time during the term of this Lease for the purpose of carrying on any business, profession,
or trade of any kind, or for any purpose other than as a private single-family residence.</p>
<p class="sub">B.&nbsp; Tenant shall comply with all the health and sanitary laws, ordinances,
rules, and orders of appropriate governmental authorities and homes associations, if any, with
respect to the House.</p>

<h2>7.&nbsp; Number of Occupants.</h2>
<p>Tenant agrees that the House shall be occupied by no more than two persons without the prior
written consent of Landlord.</p>

<h2>8.&nbsp; Condition of Premises.</h2>
<p class="sub">A.&nbsp; Tenant agrees that Tenant has examined the House, including the grounds
and all buildings and improvements, and that they are, at the time of this Lease, in good order,
good repair, safe, clean, and tenantable condition.</p>
<p class="sub">B.&nbsp; Landlord and Tenant agree that a copy of the &ldquo;Joint Inspection,&rdquo;
the original of which is maintained by Landlord and a copy provided to Tenant, attached hereto
reflects the condition of the House at the commencement of Tenant&rsquo;s occupancy.</p>

<h2>9.&nbsp; Assignment and Subletting.</h2>
<p class="sub">A.&nbsp; Tenant shall not assign this Lease or sublet or grant any concession or
license to use the House or any part of the House without Landlord&rsquo;s prior written
consent.</p>
<p class="sub">B.&nbsp; Any assignment, subletting, concession, or license without the prior
written consent of Landlord, or an assignment or subletting by operation of law, shall be void
and, at Landlord&rsquo;s option, terminate this Lease.</p>

<h2>10.&nbsp; Alterations and Improvements.</h2>
<p class="sub">A.&nbsp; Tenant shall make no alterations to the House or construct any building
or make other improvements without the prior written consent of Landlord.</p>
<p class="sub">B.&nbsp; All alterations, changes, and improvements built, constructed, or placed
on or around the House by Tenant, with the exception of fixtures properly removable without damage
to the House and movable personal property, shall, unless otherwise provided by written agreement
between Landlord and Tenant, be the property of Landlord and remain at the expiration or earlier
termination of this Lease.</p>

<h2>11.&nbsp; Damage to Premises.</h2>
<p>If the House, or any part of the House, shall be partially damaged by fire or other casualty
not due to Tenant&rsquo;s negligence or willful act, or that of Tenant&rsquo;s family, agent,
or visitor, there shall be an abatement of rent corresponding with the time during which, and
the extent to which, the House is untenantable.&nbsp; If Landlord shall decide not to rebuild or
repair, the term of this Lease shall end and the rent shall be prorated up to the time of the
damage.</p>

<h2>12.&nbsp; Dangerous Materials.</h2>
<p>Tenant shall not keep or have on or around the House any article or thing of a dangerous,
inflammable, or explosive character that might unreasonably increase the danger of fire on or
around the House or that might be considered hazardous.</p>

<h2>13.&nbsp; Utilities.</h2>
<p>Tenant shall be responsible for arranging and paying for all utility services required on the
premises, except Landlord will provide a security guard for opening and closing the gate.&nbsp;
Tenant shall not default on any obligation to a utility provider for utility services at the
House.</p>

<h2>14.&nbsp; Maintenance and Repair.</h2>
<p class="sub">A.&nbsp; Tenant will, at Tenant&rsquo;s sole expense, keep and maintain the House
and appurtenances in good and sanitary condition and repair during the term of this Lease.&nbsp;
In particular, Tenant shall keep the fixtures in the House in good order and repair; keep the
veranda and gardens clean; and keep the walks free from dirt and debris.&nbsp; Tenant shall, at
Tenant&rsquo;s sole expense, make all required repairs to the plumbing, electric and gas fixtures
if on the premises, other mechanical devices and systems, floors, ceilings and walls whenever
damage to such items shall have resulted from Tenant&rsquo;s misuse, waste, or neglect, or that
of the Tenant&rsquo;s family, agent, or visitor.</p>
<p class="sub">B.&nbsp; Tenant agrees that no signs shall be placed, or painting done on or
about the House by Tenant without the prior written consent of Landlord.</p>
<p class="sub">C.&nbsp; Tenant agrees to promptly notify Landlord in the event of any damage,
defect or destruction of the House, or the failure of any of Landlord&rsquo;s appliances or
mechanical systems, and except for repairs or replacements that are the obligation of Tenant
pursuant to Subsection A above, Landlord shall use its best efforts to repair or replace such
damaged or defective area, appliance, or mechanical system.</p>

<h2>15.&nbsp; Animals.</h2>
<p>Tenant shall keep no domestic or other animals in or about the House without the prior written
consent of Landlord.</p>

<h2>16.&nbsp; Right of Inspection.</h2>
<p>Landlord and Landlord&rsquo;s agents shall have the right at all reasonable times during the
term of this Lease and any renewal of this Lease to enter the House for the purpose of inspecting
the premises and/or making any repairs to the premises or other item as required under this
Lease.</p>

<h2>17.&nbsp; Display of Signs.</h2>
<p>During the last thirty (30) days of this Lease, Landlord or Landlord&rsquo;s agent may display
&ldquo;For Sale&rdquo; or &ldquo;For Rent&rdquo; or &ldquo;Vacancy&rdquo; or similar signs on
or about the House and enter to show the House to prospective purchasers or tenants.</p>

<h2>18.&nbsp; Holdover by Tenant.</h2>
<p>Should Tenant remain in possession of the House with the consent of Landlord after the
expiration of the Term of this Lease, tenancy will automatically switch to monthly rolling
thereafter from month to month which shall be subject to all the terms and conditions of this
Lease but shall be terminable on thirty (30) days by either party or longer notice if required
by law.&nbsp; If Tenant holds over without Landlord&rsquo;s consent, Landlord is entitled to
double rent, pro-rated per each day of the holdover, lasting until Tenant leaves the House.</p>

<h2>19.&nbsp; Surrender of Premises.</h2>
<p>At the expiration of the Lease, Tenant shall quit and surrender the House in as good a
condition as it was at the commencement of this Lease, reasonable wear and tear and damages by
the elements excepted.</p>

<h2>20.&nbsp; Forfeiture of Security Deposit &mdash; Default.</h2>
<p>It is understood and agreed that Tenant shall not attempt to apply or deduct any portion of
any security deposit from the last or any month&rsquo;s rent or use or apply any such security
deposit at any time in lieu of payment of rent.&nbsp; If Tenant fails to comply, such security
deposit shall be forfeited, and Landlord may recover the rent due as if any such deposit had not
been applied or deducted from the rent due.&nbsp; For the purposes of this paragraph, it shall
be conclusively presumed that a Tenant leaving the Premises while owing rent is making an
attempted deduction of deposits.&nbsp; Furthermore, any deposit shall be held as a guarantee that
Tenant shall perform the obligations of the Lease and shall be forfeited by the Tenant should
Tenant breach any of the terms and conditions of this Lease.&nbsp; In the event of default, by
Tenant, of any obligation in this Lease which is not cured by Tenant within fifteen (15) days&rsquo;
notice from Landlord, then in addition to forfeiture of the Security Deposit, Landlord may pursue
any other remedy available at law, equity or otherwise.</p>

<h2>21.&nbsp; Abandonment.</h2>
<p>If at any time during the term of this Lease, Tenant abandons the House or any of Tenant&rsquo;s
personal property in or about the House, Landlord shall have the following rights: Landlord may,
at Landlord&rsquo;s option, enter the House by any means without liability to Tenant for damages
and may relet the House, for the whole or any part of the then unexpired term, and may receive
and collect all rent payable by virtue of such reletting; Also, at Landlord&rsquo;s option,
Landlord may hold Tenant liable for any difference between the rent that would have been payable
under this Lease during the balance of the unexpired term, if this Lease had continued in force,
and the net rent for such period realized by Landlord by means of such reletting.&nbsp; Landlord
may also dispose of any of Tenant&rsquo;s abandoned personal property as Landlord deems
appropriate, without liability to Tenant.&nbsp; Landlord is entitled to presume that Tenant has
abandoned the House if Tenant removes substantially all of Tenant&rsquo;s furnishings from the
House, if the House is unoccupied for a period of two (2) consecutive weeks, or if it would
otherwise be reasonable for Landlord to presume under the circumstances that the Tenant has
abandoned the House.</p>

<h2>22.&nbsp; Security.</h2>
<p>Tenant acknowledges that Landlord does not provide a security alarm system or any security
for the House or for Tenant and that any such alarm system or security service, if provided, is
not represented, or warranted to be complete in all respects or to protect Tenant from all
harm.&nbsp; Tenant hereby releases Landlord from any loss, suit, claim, charge, damage, or
injury resulting from lack of security or failure of security.</p>

<h2>23.&nbsp; Severability.</h2>
<p>If any part or parts of this Lease shall be held unenforceable for any reason, the remainder
of this Agreement shall continue in full force and effect.</p>

<h2>24.&nbsp; Insurance.</h2>
<p>Tenant acknowledges that Landlord will not provide insurance coverage for Tenant&rsquo;s
property, nor shall Landlord be responsible for any loss of Tenant&rsquo;s property, whether by
theft, fire, acts of God, or otherwise.</p>

<h2>25.&nbsp; Binding Effect.</h2>
<p>The covenants and conditions contained in the Lease shall apply to and bind the heirs, legal
representatives, and permitted assigns of the parties.</p>

<h2>26.&nbsp; Governing Law.</h2>
<p>It is agreed that this Lease shall be governed by, construed, and enforced in accordance with
the laws of Uganda.&nbsp; Any dispute arising from this Lease shall be resolved first by
negotiation and, if unresolved, by the Rent Restriction Tribunal or courts of competent
jurisdiction in Uganda.</p>

<h2>27.&nbsp; Entire Agreement.</h2>
<p>This Lease shall constitute the entire agreement between the parties.&nbsp; Any prior
understanding or representation of any kind preceding the date of this Lease is hereby
superseded.&nbsp; This Lease may be modified only by a writing signed by both Landlord and
Tenant.</p>

<h2>28.&nbsp; Notices.</h2>
<p>Any notice required or otherwise given pursuant to this Lease shall be in writing; hand
delivered, mailed certified return receipt requested, postage prepaid, or delivered by overnight
delivery service, if to Tenant, at the House and if to Landlord, at the address for payment of
rent.</p>

<!-- ═══════════════════════════════ SIGNATURES ═══════════════════════════════ -->
<p class="date-line">Date: <strong>{agreement_date}</strong></p>
<p>IN WITNESS WHEREOF, the parties have caused this Lease to be executed the day and year first
above written.</p>

<div class="signature-block">
  <div class="sig-row">
    <!-- Tenant -->
    <div class="sig-col">
      <p><strong>Tenant</strong></p>
      <div class="sig-line">{tenant_sig_img}</div>
      <div class="sig-label">Signature</div>
      <p style="margin-top:10px;">
        Name: <strong>{tenant_name}</strong><br/>
        NIN: {tenant_nin}<br/>
        Contact Phone: ___________________________<br/>
        Date: {tenant_signed_at_display}
      </p>
    </div>

    <!-- Landlord -->
    <div class="sig-col">
      <p><strong>Landlord</strong></p>
      <div class="sig-line">{landlord_sig_img}</div>
      <div class="sig-label">Signature</div>
      <p style="margin-top:10px;">
        Name: <strong>{landlord_signer_name_display}</strong><br/>
        Organisation: {landlord_name}<br/>
        Contact Phone: ___________________________<br/>
        Date: {landlord_signed_at_display}
      </p>
    </div>
  </div>
</div>

<p class="stamp">
  This document was generated electronically by Crib Property Management on {agreement_date}.
  Electronic signatures are legally binding under the Electronic Transactions Act, 2011 (Uganda).
</p>

</body>
</html>
"""


def _ordinal_suffix(n: int) -> str:
    if 11 <= (n % 100) <= 13:
        return "th"
    return {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")


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
    advance_months: int = 1,
    # Signature fields — optional at generation time; filled in as parties sign
    tenant_signature_data_url: str | None = None,
    tenant_signed_at: str | None = None,
    landlord_signature_data_url: str | None = None,
    landlord_signed_at: str | None = None,
    landlord_signer_name: str | None = None,
) -> str:
    """Render the full residential lease HTML with all variables substituted."""
    monthly_rent_words = number_to_words(monthly_rent)
    deposit_amount_words = number_to_words(deposit_amount)

    if late_fee_type == "flat":
        late_fee_description = f"{currency} {format_amount(late_fee_value)} flat fee per month"
    elif late_fee_type == "percentage":
        late_fee_description = f"{late_fee_value:.1f}% of outstanding rent per day"
    else:
        late_fee_description = f"{format_amount(late_fee_value)}"

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
    tenant_signed_at_display = tenant_signed_at or "___________________________"
    landlord_signed_at_display = landlord_signed_at or "___________________________"
    landlord_signer_name_display = landlord_signer_name or landlord_name
    advance_months_plural = "s" if advance_months != 1 else ""

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
        rent_day_suffix=_ordinal_suffix(rent_day_of_month),
        notice_period_days=notice_period_days,
        grace_period_days=grace_period_days,
        late_fee_description=late_fee_description,
        agreement_date=agreement_date,
        advance_months=advance_months,
        advance_months_plural=advance_months_plural,
        tenant_sig_img=tenant_sig_img,
        landlord_sig_img=landlord_sig_img,
        tenant_signed_at_display=tenant_signed_at_display,
        landlord_signed_at_display=landlord_signed_at_display,
        landlord_signer_name_display=landlord_signer_name_display,
    )
