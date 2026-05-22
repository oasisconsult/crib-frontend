"""
Patch script — run in WSL to update billing_service.py with real analytics.
Usage: python3 billing_analytics_patch.py
"""
import sys

path = "/home/belac/projects/crib/backend/app/services/billing_service.py"
text = open(path).read()

OLD = '''async def get_billing_analytics(db: AsyncSession) -> dict:
    from sqlalchemy import case
    result = await db.execute(
        select(
            func.count().label("total"),
            func.sum(case((OrganisationSubscription.status == "active", 1), else_=0)).label("active"),
            func.sum(case((OrganisationSubscription.status == "trialing", 1), else_=0)).label("trialing"),
            func.sum(case((OrganisationSubscription.status == "suspended", 1), else_=0)).label("suspended"),
            func.sum(case((OrganisationSubscription.status == "cancelled", 1), else_=0)).label("cancelled"),
        )
    )
    row = result.one()

    pending = (await db.execute(
        select(func.count()).select_from(SubscriptionPayment).where(
            SubscriptionPayment.status == SubscriptionPaymentStatus.pending_verification
        )
    )).scalar_one() or 0

    return {
        "total_active_subscriptions": (row.active or 0) + (row.trialing or 0),
        "total_trialing": row.trialing or 0,
        "total_suspended": row.suspended or 0,
        "total_cancelled": row.cancelled or 0,
        "pending_verifications": pending,
        "mrr_ugx": 0,
        "mrr_usd_cents": 0,
        "plan_breakdown": [],
    }'''

NEW = '''async def get_billing_analytics(db: AsyncSession) -> dict:
    """
    Compute real-time subscription KPIs for the superadmin analytics dashboard.
    MRR  = price_paid sum for active/trialing MONTHLY subscriptions.
    ARR  = MRR*12 + price_paid sum for active/trialing ANNUAL subscriptions.
    """
    from datetime import timedelta
    from sqlalchemy import case, and_

    now = datetime.now(timezone.utc)
    start_of_year  = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    thirty_days_ago = now - timedelta(days=30)

    # ── Status counts ─────────────────────────────────────────────────────────
    res = await db.execute(
        select(
            func.sum(case((OrganisationSubscription.status == SubscriptionStatus.active.value, 1), else_=0)).label("active"),
            func.sum(case((OrganisationSubscription.status == SubscriptionStatus.trialing.value, 1), else_=0)).label("trialing"),
            func.sum(case((OrganisationSubscription.status == SubscriptionStatus.suspended.value, 1), else_=0)).label("suspended"),
            func.sum(case((OrganisationSubscription.status == SubscriptionStatus.cancelled.value, 1), else_=0)).label("cancelled"),
            func.sum(case((OrganisationSubscription.status == SubscriptionStatus.expired.value, 1), else_=0)).label("expired"),
            func.sum(case((OrganisationSubscription.status == SubscriptionStatus.grace_period.value, 1), else_=0)).label("grace_period"),
            func.sum(case((OrganisationSubscription.status == SubscriptionStatus.pending_payment.value, 1), else_=0)).label("pending_payment"),
            func.sum(case((OrganisationSubscription.status == SubscriptionStatus.pending_verification.value, 1), else_=0)).label("pending_verification"),
        ).select_from(OrganisationSubscription)
    )
    row = res.one()

    # ── Pending payment verifications ─────────────────────────────────────────
    pending = (await db.execute(
        select(func.count()).select_from(SubscriptionPayment).where(
            SubscriptionPayment.status == SubscriptionPaymentStatus.pending_verification
        )
    )).scalar_one() or 0

    active_count = (row.active or 0) + (row.trialing or 0)
    paid_statuses = [SubscriptionStatus.active.value, SubscriptionStatus.trialing.value]

    # ── MRR (UGX monthly active subs) ─────────────────────────────────────────
    mrr_ugx = int((await db.execute(
        select(func.coalesce(func.sum(OrganisationSubscription.price_paid), 0)).where(
            OrganisationSubscription.status.in_(paid_statuses),
            OrganisationSubscription.billing_cycle == "monthly",
            OrganisationSubscription.price_currency == "UGX",
        )
    )).scalar_one() or 0)

    mrr_usd_cents = int((await db.execute(
        select(func.coalesce(func.sum(OrganisationSubscription.price_paid), 0)).where(
            OrganisationSubscription.status.in_(paid_statuses),
            OrganisationSubscription.billing_cycle == "monthly",
            OrganisationSubscription.price_currency == "USD",
        )
    )).scalar_one() or 0)

    # ARR = annualise monthly + add annual sub prices
    annual_ugx = int((await db.execute(
        select(func.coalesce(func.sum(OrganisationSubscription.price_paid), 0)).where(
            OrganisationSubscription.status.in_(paid_statuses),
            OrganisationSubscription.billing_cycle == "annual",
            OrganisationSubscription.price_currency == "UGX",
        )
    )).scalar_one() or 0)
    arr_ugx = (mrr_ugx * 12) + annual_ugx

    # ── Revenue YTD & MTD (verified payments) ─────────────────────────────────
    revenue_ytd_ugx = int((await db.execute(
        select(func.coalesce(func.sum(SubscriptionPayment.amount), 0)).where(
            SubscriptionPayment.status == SubscriptionPaymentStatus.verified,
            SubscriptionPayment.verified_at >= start_of_year,
            SubscriptionPayment.currency == "UGX",
        )
    )).scalar_one() or 0)

    revenue_mtd_ugx = int((await db.execute(
        select(func.coalesce(func.sum(SubscriptionPayment.amount), 0)).where(
            SubscriptionPayment.status == SubscriptionPaymentStatus.verified,
            SubscriptionPayment.verified_at >= start_of_month,
            SubscriptionPayment.currency == "UGX",
        )
    )).scalar_one() or 0)

    # ── Churn rate (30-day rolling) ────────────────────────────────────────────
    cancellations_30d = (await db.execute(
        select(func.count()).select_from(OrganisationSubscription).where(
            OrganisationSubscription.status == SubscriptionStatus.cancelled.value,
            OrganisationSubscription.cancelled_at >= thirty_days_ago,
        )
    )).scalar_one() or 0
    base = active_count + cancellations_30d
    churn_rate = round(cancellations_30d / base * 100, 1) if base > 0 else 0.0

    # ── Plan breakdown ─────────────────────────────────────────────────────────
    from app.models.subscription import SubscriptionPlan
    plan_rows = await db.execute(
        select(
            SubscriptionPlan.name,
            SubscriptionPlan.slug,
            func.count(OrganisationSubscription.id).label("count"),
            func.coalesce(func.sum(
                case((OrganisationSubscription.billing_cycle == "monthly",
                      OrganisationSubscription.price_paid), else_=0)
            ), 0).label("monthly_revenue"),
        )
        .outerjoin(OrganisationSubscription, and_(
            OrganisationSubscription.plan_id == SubscriptionPlan.id,
            OrganisationSubscription.status.in_(paid_statuses),
        ))
        .where(SubscriptionPlan.is_active.is_(True))
        .group_by(SubscriptionPlan.id, SubscriptionPlan.name, SubscriptionPlan.slug)
        .order_by(SubscriptionPlan.display_order)
    )
    plan_breakdown = [
        {"name": r.name, "slug": r.slug, "count": r.count or 0,
         "monthly_revenue_ugx": r.monthly_revenue or 0}
        for r in plan_rows.fetchall()
    ]

    return {
        "total_active_subscriptions": active_count,
        "total_trialing":      row.trialing or 0,
        "total_suspended":     row.suspended or 0,
        "total_cancelled":     row.cancelled or 0,
        "total_expired":       row.expired or 0,
        "total_pending":       (row.pending_payment or 0) + (row.pending_verification or 0),
        "total_grace_period":  row.grace_period or 0,
        "pending_verifications": pending,
        "mrr_ugx":             mrr_ugx,
        "mrr_usd_cents":       mrr_usd_cents,
        "arr_ugx":             arr_ugx,
        "revenue_ytd_ugx":     revenue_ytd_ugx,
        "revenue_mtd_ugx":     revenue_mtd_ugx,
        "churn_rate":          churn_rate,
        "plan_breakdown":      plan_breakdown,
    }


async def get_billing_analytics_charts(db: AsyncSession) -> dict:
    """
    Time-series data for the 4 analytics charts:
      1. revenue_trend       — monthly revenue (verified payments, last 12 months)
      2. subscription_growth — new vs. cancelled subs per month
      3. status_distribution — current snapshot pie data
      4. plan_distribution   — active subscriptions per plan (bar chart)
    """
    from datetime import timedelta
    from sqlalchemy import text

    now = datetime.now(timezone.utc)
    # Start of 12 months ago
    months = []
    for i in range(11, -1, -1):
        first = (now.replace(day=1) - timedelta(days=i * 28)).replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        months.append(first)

    def label(dt) -> str:
        return dt.strftime("%b %Y")

    start = months[0]

    # Revenue per month (verified payments)
    rev_rows = (await db.execute(text("""
        SELECT DATE_TRUNC('month', verified_at) AS m, COALESCE(SUM(amount), 0) AS total
        FROM subscription_payments
        WHERE status = 'verified' AND verified_at >= :s AND currency = 'UGX'
        GROUP BY 1 ORDER BY 1
    """), {"s": start})).fetchall()
    rev_map = {r[0].strftime("%b %Y"): int(r[1]) for r in rev_rows if r[0]}

    # New subs per month
    new_rows = (await db.execute(text("""
        SELECT DATE_TRUNC('month', created_at) AS m, COUNT(*) AS total
        FROM organisation_subscriptions
        WHERE billing_cycle != 'none' AND created_at >= :s
        GROUP BY 1 ORDER BY 1
    """), {"s": start})).fetchall()
    new_map = {r[0].strftime("%b %Y"): int(r[1]) for r in new_rows if r[0]}

    # Cancellations per month
    can_rows = (await db.execute(text("""
        SELECT DATE_TRUNC('month', cancelled_at) AS m, COUNT(*) AS total
        FROM organisation_subscriptions
        WHERE cancelled_at IS NOT NULL AND cancelled_at >= :s
        GROUP BY 1 ORDER BY 1
    """), {"s": start})).fetchall()
    can_map = {r[0].strftime("%b %Y"): int(r[1]) for r in can_rows if r[0]}

    # Status distribution (current)
    stat_rows = (await db.execute(text("""
        SELECT status, COUNT(*) AS cnt FROM organisation_subscriptions GROUP BY status
    """))).fetchall()
    status_dist = [{"status": r[0], "count": int(r[1])} for r in stat_rows]

    # Plan distribution (active subs)
    plan_rows = (await db.execute(text("""
        SELECT sp.name, COUNT(os.id) AS cnt
        FROM subscription_plans sp
        LEFT JOIN organisation_subscriptions os
          ON os.plan_id = sp.id AND os.status IN ('active','trialing')
        WHERE sp.is_active = true
        GROUP BY sp.id, sp.name, sp.display_order
        ORDER BY sp.display_order
    """))).fetchall()
    plan_dist = [{"plan": r[0], "count": int(r[1])} for r in plan_rows]

    return {
        "revenue_trend": [
            {"month": label(m), "revenue": rev_map.get(label(m), 0)}
            for m in months
        ],
        "subscription_growth": [
            {"month": label(m), "new": new_map.get(label(m), 0),
             "cancelled": can_map.get(label(m), 0)}
            for m in months
        ],
        "status_distribution": status_dist,
        "plan_distribution": plan_dist,
    }'''

if OLD not in text:
    print("ERROR: anchor not found")
    sys.exit(1)
else:
    text = text.replace(OLD, NEW, 1)
    open(path, "w").write(text)
    print("PATCHED: billing_service.py analytics functions updated")
