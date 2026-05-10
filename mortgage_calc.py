"""
Mortgage calculator + amortization engine for PropIQ Track.

Supports:
  * Principal & Interest (P&I) loans — standard amortization formula
  * Interest-Only (IO) loans — flat monthly interest, no principal reduction
  * Mixed IO→P&I loans (via `interest_only_until` cutover date inside a single period)
  * Multiple loan periods over time (refinancing, rate changes) — schedule
    seamlessly walks through periods, carrying balance forward.

Each loan period record (stored on Property.loan_history):
{
  "loan_id": "loan_xxx",
  "start_date": "YYYY-MM-DD",          # period start
  "end_date": "YYYY-MM-DD" or None,    # period end (None = active)
  "lender": "Westpac",
  "initial_balance": 500000.00,        # balance at period start
  "interest_rate": 5.2,                 # annual %, e.g. 5.2 = 5.2%
  "loan_term_years": 30,
  "repayment_type": "P&I" | "Interest-Only",
  "repayment_frequency": "monthly",     # currently only monthly drives math
  "interest_only_until": "YYYY-MM-DD" | None,  # only meaningful for P&I that has an IO sub-period
}
"""

from __future__ import annotations
from datetime import date, datetime, timedelta
from typing import Iterable, List, Optional


def _parse_date(s) -> Optional[date]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s)[:10]).date()
    except Exception:
        return None


def _add_months(d: date, months: int) -> date:
    """Add N calendar months to a date, clamping day-of-month to month length."""
    m = d.month - 1 + months
    y = d.year + m // 12
    m = m % 12 + 1
    # Clamp day to last day of target month
    day = min(d.day, [31, 29 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 28,
                      31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1])
    return date(y, m, day)


def monthly_payment_pi(principal: float, annual_rate_pct: float, term_years: int) -> float:
    """Standard P&I monthly payment formula. Handles 0% rate edge case."""
    if principal <= 0 or term_years <= 0:
        return 0.0
    r = (annual_rate_pct / 100.0) / 12.0
    n = term_years * 12
    if r <= 0:
        return principal / n
    return principal * (r * (1 + r) ** n) / ((1 + r) ** n - 1)


def monthly_payment_io(balance: float, annual_rate_pct: float) -> float:
    """Interest-only monthly payment: balance × monthly rate."""
    if balance <= 0:
        return 0.0
    return balance * (annual_rate_pct / 100.0) / 12.0


def calculate_period_payment(
    balance: float,
    annual_rate_pct: float,
    term_years: int,
    repayment_type: str,
    on_date: Optional[date] = None,
    interest_only_until: Optional[date] = None,
) -> dict:
    """
    Calculate one month's payment for a given loan state.
    Returns: { payment, interest, principal, repayment_type_used }

    If interest_only_until is in the future relative to on_date AND repayment_type is P&I,
    we charge interest-only for that month (used for mixed IO→P&I loans).
    """
    interest_due = balance * (annual_rate_pct / 100.0) / 12.0

    # Determine whether this month is IO or P&I
    use_io = False
    if repayment_type.lower() in ("interest-only", "io", "interest only"):
        use_io = True
    elif interest_only_until and on_date and on_date < interest_only_until:
        use_io = True

    if use_io:
        return {
            "payment": round(interest_due, 2),
            "interest": round(interest_due, 2),
            "principal": 0.0,
            "repayment_type_used": "Interest-Only",
        }

    # P&I path — compute remaining term in months for proper amortization
    # We use the original term_years for stable monthly payment unless balance is fully paid.
    pi = monthly_payment_pi(balance, annual_rate_pct, term_years)
    if pi <= 0:
        return {
            "payment": 0.0,
            "interest": 0.0,
            "principal": 0.0,
            "repayment_type_used": "P&I",
        }
    principal_paid = max(0.0, pi - interest_due)
    # Don't overpay the principal in the last month
    if principal_paid > balance:
        principal_paid = balance
        pi = principal_paid + interest_due
    return {
        "payment": round(pi, 2),
        "interest": round(interest_due, 2),
        "principal": round(principal_paid, 2),
        "repayment_type_used": "P&I",
    }


def build_amortization_schedule(
    loan_history: List[dict],
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> List[dict]:
    """
    Walk through loan_history chronologically and produce a month-by-month schedule.

    Output is a list of records, one per month:
    {
      "month": "YYYY-MM",
      "loan_id": <which loan period was active>,
      "lender": str,
      "interest_rate": float,
      "payment": float,
      "interest": float,
      "principal": float,
      "balance_after": float,
      "repayment_type": str,
    }

    If start_date / end_date is provided, schedule is clipped to that window.
    """
    if not loan_history:
        return []

    # Sort by start_date — ensure stable order
    periods = sorted(
        [p for p in loan_history if _parse_date(p.get("start_date"))],
        key=lambda p: _parse_date(p["start_date"]),
    )
    if not periods:
        return []

    schedule = []

    for idx, period in enumerate(periods):
        p_start = _parse_date(period.get("start_date"))
        p_end = _parse_date(period.get("end_date"))
        # If this is the last period and no end_date, assume "today + 1 year horizon"
        # for forecasting purposes (capped further by `end_date` arg if provided).
        if p_end is None:
            if idx + 1 < len(periods):
                # Period ends day before next one starts
                next_start = _parse_date(periods[idx + 1].get("start_date"))
                if next_start:
                    p_end = next_start - timedelta(days=1)
            if p_end is None:
                p_end = end_date or (date.today())

        lender = period.get("lender", "")
        rate = float(period.get("interest_rate", 0) or 0)
        term_years = int(period.get("loan_term_years", 30) or 30)
        repayment_type = period.get("repayment_type", "P&I")
        io_until = _parse_date(period.get("interest_only_until"))
        balance = float(period.get("initial_balance", 0) or 0)
        loan_id = period.get("loan_id", "")

        # Walk month by month from p_start to min(p_end, end_date)
        cursor = date(p_start.year, p_start.month, 1)
        period_cap = p_end if p_end else end_date
        if end_date and period_cap and period_cap > end_date:
            period_cap = end_date

        # Safety: cap total iterations at 12*60 = 60 years
        max_months = 12 * 60
        count = 0
        while period_cap and cursor <= period_cap and balance > 0 and count < max_months:
            month_key = cursor.strftime("%Y-%m")
            calc = calculate_period_payment(
                balance=balance,
                annual_rate_pct=rate,
                term_years=term_years,
                repayment_type=repayment_type,
                on_date=cursor,
                interest_only_until=io_until,
            )
            balance = max(0.0, balance - calc["principal"])

            in_window = True
            if start_date and cursor < date(start_date.year, start_date.month, 1):
                in_window = False
            if end_date and cursor > end_date:
                in_window = False

            if in_window:
                schedule.append({
                    "month": month_key,
                    "loan_id": loan_id,
                    "lender": lender,
                    "interest_rate": rate,
                    "payment": calc["payment"],
                    "interest": calc["interest"],
                    "principal": calc["principal"],
                    "balance_after": round(balance, 2),
                    "repayment_type": calc["repayment_type_used"],
                })

            cursor = _add_months(cursor, 1)
            count += 1

    return schedule


def current_loan_summary(loan_history: List[dict], on_date: Optional[date] = None) -> Optional[dict]:
    """
    Return the active loan period as of `on_date` (default: today), with computed
    current monthly payment + current balance (forward-walked from initial_balance).
    """
    on_date = on_date or date.today()
    if not loan_history:
        return None

    # Walk schedule up to on_date so we get the most recent balance.
    sched = build_amortization_schedule(loan_history, start_date=None, end_date=on_date)
    if not sched:
        # No payments yet — return the initial state of whatever period contains on_date.
        active = None
        for p in loan_history:
            s = _parse_date(p.get("start_date"))
            e = _parse_date(p.get("end_date"))
            if s and s <= on_date and (not e or on_date <= e):
                active = p
                break
        if not active:
            return None
        balance = float(active.get("initial_balance", 0) or 0)
        return {
            "loan_id": active.get("loan_id"),
            "lender": active.get("lender", ""),
            "interest_rate": float(active.get("interest_rate", 0) or 0),
            "loan_term_years": int(active.get("loan_term_years", 30) or 30),
            "repayment_type": active.get("repayment_type", "P&I"),
            "current_balance": balance,
            "monthly_payment": calculate_period_payment(
                balance=balance,
                annual_rate_pct=float(active.get("interest_rate", 0) or 0),
                term_years=int(active.get("loan_term_years", 30) or 30),
                repayment_type=active.get("repayment_type", "P&I"),
                on_date=on_date,
                interest_only_until=_parse_date(active.get("interest_only_until")),
            )["payment"],
        }

    last = sched[-1]
    return {
        "loan_id": last["loan_id"],
        "lender": last["lender"],
        "interest_rate": last["interest_rate"],
        "current_balance": last["balance_after"],
        "monthly_payment": last["payment"],
        "interest_portion": last["interest"],
        "principal_portion": last["principal"],
        "repayment_type": last["repayment_type"],
    }


def synthesize_loan_history_from_legacy(prop: dict) -> List[dict]:
    """
    Migration helper. If a Property has legacy loan_amount/interest_rate/lender fields
    but no loan_history, build a single active loan period from those fields starting
    at the purchase_date.

    Returns [] if there's no loan_amount.
    """
    loan_amount = float(prop.get("loan_amount", 0) or 0)
    if loan_amount <= 0:
        return []
    purchase_date = prop.get("purchase_date") or prop.get("created_date") or ""
    if not _parse_date(purchase_date):
        purchase_date = date.today().isoformat()
    return [{
        "loan_id": f"loan_legacy_{prop.get('property_id','x')[:12]}",
        "start_date": str(purchase_date)[:10],
        "end_date": None,
        "lender": prop.get("lender", "") or "",
        "initial_balance": loan_amount,
        "interest_rate": float(prop.get("interest_rate", 0) or 0),
        "loan_term_years": 30,
        "repayment_type": "P&I",
        "repayment_frequency": "monthly",
        "interest_only_until": None,
    }]


def interest_paid_in_window(
    loan_history: List[dict],
    start_date: date,
    end_date: date,
) -> dict:
    """
    Total interest, principal, and payments paid within [start_date, end_date].
    Used by reports (tax summary, deductible interest).
    """
    sched = build_amortization_schedule(loan_history, start_date=start_date, end_date=end_date)
    total_interest = sum(s["interest"] for s in sched)
    total_principal = sum(s["principal"] for s in sched)
    total_payment = sum(s["payment"] for s in sched)
    return {
        "total_interest": round(total_interest, 2),
        "total_principal": round(total_principal, 2),
        "total_payment": round(total_payment, 2),
        "months_count": len(sched),
        "schedule": sched,
    }
