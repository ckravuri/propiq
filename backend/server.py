from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import io
import csv
import base64
import re
from bs4 import BeautifulSoup

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== PYDANTIC MODELS ====================

class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    created_at: Optional[str] = None

class PropertyCreate(BaseModel):
    property_name: str
    address: str = ""
    suburb: str = ""
    state: str = ""
    postcode: str = ""
    purchase_price: float = 0
    purchase_date: str = ""
    loan_amount: float = 0
    interest_rate: float = 0
    current_estimated_value: float = 0
    property_type: str = "house"
    bedrooms: int = 0
    bathrooms: int = 0
    parking: int = 0
    land_size: float = 0
    notes: str = ""
    image_base64: Optional[str] = None

class PropertyOut(BaseModel):
    property_id: str
    user_id: str
    property_name: str
    address: str = ""
    suburb: str = ""
    state: str = ""
    postcode: str = ""
    purchase_price: float = 0
    purchase_date: str = ""
    loan_amount: float = 0
    interest_rate: float = 0
    current_estimated_value: float = 0
    property_type: str = "house"
    bedrooms: int = 0
    bathrooms: int = 0
    parking: int = 0
    land_size: float = 0
    notes: str = ""
    image_base64: Optional[str] = None
    created_date: str = ""
    updated_date: str = ""

class IncomeCreate(BaseModel):
    property_id: str
    date: str
    amount: float
    income_type: str = "rent"
    frequency: str = "weekly"
    tenant_name: str = ""
    notes: str = ""

class IncomeOut(BaseModel):
    income_id: str
    property_id: str
    user_id: str
    date: str
    amount: float
    income_type: str = "rent"
    frequency: str = "weekly"
    tenant_name: str = ""
    notes: str = ""
    created_date: str = ""

class ExpenseCreate(BaseModel):
    property_id: str
    date: str
    amount: float
    category: str = "miscellaneous"
    notes: str = ""
    recurring: bool = False
    frequency: str = "monthly"
    receipt_base64: Optional[str] = None

class ExpenseOut(BaseModel):
    expense_id: str
    property_id: str
    user_id: str
    date: str
    amount: float
    category: str = "miscellaneous"
    notes: str = ""
    recurring: bool = False
    frequency: str = "monthly"
    receipt_base64: Optional[str] = None
    created_date: str = ""

class ReminderCreate(BaseModel):
    property_id: str
    title: str
    category: str = "miscellaneous"
    amount: float = 0
    due_day: int = 1
    frequency: str = "monthly"
    notes: str = ""

class ReminderOut(BaseModel):
    reminder_id: str
    user_id: str
    property_id: str
    property_name: str = ""
    title: str
    category: str = "miscellaneous"
    amount: float = 0
    due_day: int = 1
    frequency: str = "monthly"
    notes: str = ""
    active: bool = True
    created_date: str = ""

# ==================== AUTH HELPERS ====================

async def get_current_user(request: Request) -> dict:
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session_doc = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session_doc:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session_doc.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user_doc = await db.users.find_one({"user_id": session_doc["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    return user_doc

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/session")
async def exchange_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    async with httpx.AsyncClient() as http_client:
        resp = await http_client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    data = resp.json()
    email = data.get("email")
    name = data.get("name", "")
    picture = data.get("picture", "")
    session_token = data.get("session_token", str(uuid.uuid4()))
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    if existing_user:
        user_id = existing_user["user_id"]
        await db.users.update_one({"email": email}, {"$set": {"name": name, "picture": picture, "updated_at": datetime.now(timezone.utc).isoformat()}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        })
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    response.set_cookie(
        key="session_token",
        value=session_token,
        path="/",
        secure=True,
        httponly=True,
        samesite="none",
        max_age=7 * 24 * 3600
    )
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return user_doc

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    return user

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out"}

# ==================== PROPERTY ROUTES ====================

@api_router.get("/properties", response_model=List[PropertyOut])
async def list_properties(request: Request):
    user = await get_current_user(request)
    props = await db.properties.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_date", -1).to_list(1000)
    return props

@api_router.get("/properties/{property_id}", response_model=PropertyOut)
async def get_property(property_id: str, request: Request):
    user = await get_current_user(request)
    prop = await db.properties.find_one({"property_id": property_id, "user_id": user["user_id"]}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop

@api_router.post("/properties", response_model=PropertyOut)
async def create_property(prop: PropertyCreate, request: Request):
    user = await get_current_user(request)
    now = datetime.now(timezone.utc).isoformat()
    prop_dict = prop.dict()
    prop_dict["property_id"] = f"prop_{uuid.uuid4().hex[:12]}"
    prop_dict["user_id"] = user["user_id"]
    prop_dict["created_date"] = now
    prop_dict["updated_date"] = now
    await db.properties.insert_one(prop_dict)
    result = await db.properties.find_one({"property_id": prop_dict["property_id"]}, {"_id": 0})
    return result

@api_router.put("/properties/{property_id}", response_model=PropertyOut)
async def update_property(property_id: str, prop: PropertyCreate, request: Request):
    user = await get_current_user(request)
    existing = await db.properties.find_one({"property_id": property_id, "user_id": user["user_id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Property not found")
    update_data = prop.dict()
    update_data["updated_date"] = datetime.now(timezone.utc).isoformat()
    await db.properties.update_one({"property_id": property_id}, {"$set": update_data})
    result = await db.properties.find_one({"property_id": property_id}, {"_id": 0})
    return result

@api_router.delete("/properties/{property_id}")
async def delete_property(property_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.properties.delete_one({"property_id": property_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Property not found")
    await db.income_entries.delete_many({"property_id": property_id, "user_id": user["user_id"]})
    await db.expense_entries.delete_many({"property_id": property_id, "user_id": user["user_id"]})
    return {"message": "Property deleted"}

# ==================== INCOME ROUTES ====================

@api_router.get("/income/{property_id}", response_model=List[IncomeOut])
async def list_income(property_id: str, request: Request):
    user = await get_current_user(request)
    entries = await db.income_entries.find({"property_id": property_id, "user_id": user["user_id"]}, {"_id": 0}).sort("date", -1).to_list(1000)
    return entries

@api_router.post("/income", response_model=IncomeOut)
async def create_income(income: IncomeCreate, request: Request):
    user = await get_current_user(request)
    prop = await db.properties.find_one({"property_id": income.property_id, "user_id": user["user_id"]})
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    entry = income.dict()
    entry["income_id"] = f"inc_{uuid.uuid4().hex[:12]}"
    entry["user_id"] = user["user_id"]
    entry["created_date"] = datetime.now(timezone.utc).isoformat()
    await db.income_entries.insert_one(entry)
    result = await db.income_entries.find_one({"income_id": entry["income_id"]}, {"_id": 0})
    return result

@api_router.delete("/income/{income_id}")
async def delete_income(income_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.income_entries.delete_one({"income_id": income_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Income entry not found")
    return {"message": "Income deleted"}

# ==================== EXPENSE ROUTES ====================

@api_router.get("/expenses/{property_id}", response_model=List[ExpenseOut])
async def list_expenses(property_id: str, request: Request):
    user = await get_current_user(request)
    entries = await db.expense_entries.find({"property_id": property_id, "user_id": user["user_id"]}, {"_id": 0}).sort("date", -1).to_list(1000)
    return entries

@api_router.post("/expenses", response_model=ExpenseOut)
async def create_expense(expense: ExpenseCreate, request: Request):
    user = await get_current_user(request)
    prop = await db.properties.find_one({"property_id": expense.property_id, "user_id": user["user_id"]})
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    entry = expense.dict()
    entry["expense_id"] = f"exp_{uuid.uuid4().hex[:12]}"
    entry["user_id"] = user["user_id"]
    entry["created_date"] = datetime.now(timezone.utc).isoformat()
    await db.expense_entries.insert_one(entry)
    result = await db.expense_entries.find_one({"expense_id": entry["expense_id"]}, {"_id": 0})
    return result

@api_router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.expense_entries.delete_one({"expense_id": expense_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense entry not found")
    return {"message": "Expense deleted"}

# ==================== REMINDERS ====================

@api_router.get("/reminders", response_model=List[ReminderOut])
async def list_reminders(request: Request):
    user = await get_current_user(request)
    reminders = await db.reminders.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_date", -1).to_list(1000)
    # Enrich with property names
    for r in reminders:
        prop = await db.properties.find_one({"property_id": r.get("property_id"), "user_id": user["user_id"]}, {"_id": 0, "property_name": 1})
        r["property_name"] = prop.get("property_name", "") if prop else ""
    return reminders

@api_router.post("/reminders", response_model=ReminderOut)
async def create_reminder(reminder: ReminderCreate, request: Request):
    user = await get_current_user(request)
    prop = await db.properties.find_one({"property_id": reminder.property_id, "user_id": user["user_id"]}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    entry = reminder.dict()
    entry["reminder_id"] = f"rem_{uuid.uuid4().hex[:12]}"
    entry["user_id"] = user["user_id"]
    entry["active"] = True
    entry["created_date"] = datetime.now(timezone.utc).isoformat()
    entry["property_name"] = prop.get("property_name", "")
    await db.reminders.insert_one(entry)
    result = await db.reminders.find_one({"reminder_id": entry["reminder_id"]}, {"_id": 0})
    return result

@api_router.put("/reminders/{reminder_id}/toggle")
async def toggle_reminder(reminder_id: str, request: Request):
    user = await get_current_user(request)
    rem = await db.reminders.find_one({"reminder_id": reminder_id, "user_id": user["user_id"]})
    if not rem:
        raise HTTPException(status_code=404, detail="Reminder not found")
    new_active = not rem.get("active", True)
    await db.reminders.update_one({"reminder_id": reminder_id}, {"$set": {"active": new_active}})
    return {"message": "Reminder toggled", "active": new_active}

@api_router.delete("/reminders/{reminder_id}")
async def delete_reminder(reminder_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.reminders.delete_one({"reminder_id": reminder_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return {"message": "Reminder deleted"}

# ==================== DASHBOARD ====================

@api_router.get("/dashboard")
async def get_dashboard(request: Request):
    user = await get_current_user(request)
    user_id = user["user_id"]
    now = datetime.now(timezone.utc)
    year_start = datetime(now.year, 1, 1, tzinfo=timezone.utc).isoformat()

    properties = await db.properties.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
    all_income = await db.income_entries.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
    all_expenses = await db.expense_entries.find({"user_id": user_id}, {"_id": 0}).to_list(10000)

    total_market_value = sum(p.get("current_estimated_value", 0) for p in properties)
    total_purchase_value = sum(p.get("purchase_price", 0) for p in properties)
    total_equity = total_market_value - sum(p.get("loan_amount", 0) for p in properties)

    ytd_income = [i for i in all_income if i.get("date", "") >= year_start]
    ytd_expenses = [e for e in all_expenses if e.get("date", "") >= year_start]
    
    # Calculate yearly income using frequency multiplier
    def annualize(entry):
        amt = entry.get("amount", 0)
        freq = entry.get("frequency", "weekly")
        if freq == "weekly":
            return amt * 52
        elif freq == "fortnightly":
            return amt * 26
        elif freq == "monthly":
            return amt * 12
        elif freq == "quarterly":
            return amt * 4
        elif freq == "yearly":
            return amt
        return amt  # one-off
    
    def annualize_expense(entry):
        amt = entry.get("amount", 0)
        if not entry.get("recurring", False):
            return amt  # one-off expense, use as-is
        freq = entry.get("frequency", "monthly")
        if freq == "weekly":
            return amt * 52
        elif freq == "fortnightly":
            return amt * 26
        elif freq == "monthly":
            return amt * 12
        elif freq == "quarterly":
            return amt * 4
        elif freq == "yearly":
            return amt
        return amt
    
    total_yearly_income = sum(annualize(i) for i in ytd_income)
    total_yearly_expenses = sum(annualize_expense(e) for e in ytd_expenses)
    net_cashflow = total_yearly_income - total_yearly_expenses
    monthly_avg_income = total_yearly_income / max(now.month, 1)
    yearly_roi = (net_cashflow / total_purchase_value * 100) if total_purchase_value > 0 else 0

    # Property-level metrics
    property_metrics = []
    for p in properties:
        pid = p["property_id"]
        p_income = [i for i in ytd_income if i["property_id"] == pid]
        p_expenses = [e for e in ytd_expenses if e["property_id"] == pid]
        p_income_total = sum(annualize(i) for i in p_income)
        p_expense_total = sum(annualize_expense(e) for e in p_expenses)
        p_repairs = sum(annualize_expense(e) for e in p_expenses if e.get("category") in ["repairs", "repeated repairs", "maintenance"])
        p_net = p_income_total - p_expense_total
        purchase = p.get("purchase_price", 0)
        current = p.get("current_estimated_value", 0)
        p_roi = (p_net / purchase * 100) if purchase > 0 else 0
        p_growth = ((current - purchase) / purchase * 100) if purchase > 0 else 0
        property_metrics.append({
            "property_id": pid,
            "property_name": p.get("property_name", ""),
            "property_type": p.get("property_type", "house"),
            "current_value": current,
            "income_ytd": p_income_total,
            "expenses_ytd": p_expense_total,
            "net_cashflow": p_net,
            "repair_costs": p_repairs,
            "roi": round(p_roi, 2),
            "capital_growth": round(p_growth, 2)
        })

    # Monthly income trend (last 12 months)
    monthly_income = {}
    monthly_expenses = {}
    for i in range(12):
        m = now.month - i
        y = now.year
        if m <= 0:
            m += 12
            y -= 1
        key = f"{y}-{m:02d}"
        monthly_income[key] = 0
        monthly_expenses[key] = 0
    for inc in all_income:
        month_key = inc.get("date", "")[:7]
        if month_key in monthly_income:
            monthly_income[month_key] += inc.get("amount", 0)
    for exp in all_expenses:
        month_key = exp.get("date", "")[:7]
        if month_key in monthly_expenses:
            monthly_expenses[month_key] += exp.get("amount", 0)

    monthly_trend = []
    for key in sorted(monthly_income.keys()):
        monthly_trend.append({"month": key, "income": monthly_income[key], "expenses": monthly_expenses[key]})

    # Expense by category
    expense_by_category = {}
    for e in ytd_expenses:
        cat = e.get("category", "miscellaneous")
        expense_by_category[cat] = expense_by_category.get(cat, 0) + e.get("amount", 0)

    return {
        "portfolio": {
            "total_properties": len(properties),
            "total_market_value": total_market_value,
            "total_purchase_value": total_purchase_value,
            "total_equity": total_equity,
            "total_yearly_income": total_yearly_income,
            "total_yearly_expenses": total_yearly_expenses,
            "net_yearly_cashflow": net_cashflow,
            "monthly_avg_income": round(monthly_avg_income, 2),
            "yearly_roi": round(yearly_roi, 2)
        },
        "property_metrics": property_metrics,
        "monthly_trend": monthly_trend,
        "expense_by_category": expense_by_category
    }

# ==================== REPORTS ====================

@api_router.get("/reports/csv/{property_id}")
async def generate_csv_report(property_id: str, request: Request, year: int = Query(default=None)):
    user = await get_current_user(request)
    if year is None:
        year = datetime.now(timezone.utc).year
    prop = await db.properties.find_one({"property_id": property_id, "user_id": user["user_id"]}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    year_start = f"{year}-01-01"
    year_end = f"{year}-12-31"
    income = await db.income_entries.find({"property_id": property_id, "user_id": user["user_id"], "date": {"$gte": year_start, "$lte": year_end}}, {"_id": 0}).to_list(10000)
    expenses = await db.expense_entries.find({"property_id": property_id, "user_id": user["user_id"], "date": {"$gte": year_start, "$lte": year_end}}, {"_id": 0}).to_list(10000)
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([f"PropIQ Report - {prop.get('property_name', '')} - {year}"])
    writer.writerow([])
    writer.writerow(["Property Summary"])
    writer.writerow(["Field", "Value"])
    writer.writerow(["Name", prop.get("property_name", "")])
    writer.writerow(["Address", f"{prop.get('address', '')} {prop.get('suburb', '')} {prop.get('state', '')} {prop.get('postcode', '')}"])
    writer.writerow(["Purchase Price", prop.get("purchase_price", 0)])
    writer.writerow(["Current Value", prop.get("current_estimated_value", 0)])
    writer.writerow(["Loan Amount", prop.get("loan_amount", 0)])
    writer.writerow([])
    
    total_income = sum(i.get("amount", 0) for i in income)
    total_expenses = sum(e.get("amount", 0) for e in expenses)
    writer.writerow(["Financial Summary"])
    writer.writerow(["Total Income", total_income])
    writer.writerow(["Total Expenses", total_expenses])
    writer.writerow(["Net Profit/Loss", total_income - total_expenses])
    writer.writerow([])
    
    writer.writerow(["Income Entries"])
    writer.writerow(["Date", "Amount", "Type", "Tenant", "Notes"])
    for i in income:
        writer.writerow([i.get("date", ""), i.get("amount", 0), i.get("income_type", ""), i.get("tenant_name", ""), i.get("notes", "")])
    writer.writerow([])
    
    writer.writerow(["Expense Entries"])
    writer.writerow(["Date", "Amount", "Category", "Recurring", "Notes"])
    for e in expenses:
        writer.writerow([e.get("date", ""), e.get("amount", 0), e.get("category", ""), e.get("recurring", False), e.get("notes", "")])
    
    csv_content = output.getvalue()
    csv_b64 = base64.b64encode(csv_content.encode('utf-8')).decode('ascii')
    # Sanitize filename - remove special chars
    safe_name = re.sub(r'[^\w\s-]', '', prop.get('property_name', 'report')).strip().replace(' ', '_')
    return {"filename": f"PropIQ_{safe_name}_{year}.csv", "content_base64": csv_b64, "content_type": "text/csv"}


@api_router.get("/reports/csv-download/{property_id}")
async def download_csv_report(property_id: str, request: Request, year: int = Query(default=None)):
    """Returns raw CSV file as a direct download"""
    user = await get_current_user(request)
    if year is None:
        year = datetime.now(timezone.utc).year
    prop = await db.properties.find_one({"property_id": property_id, "user_id": user["user_id"]}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    year_start = f"{year}-01-01"
    year_end = f"{year}-12-31"
    income = await db.income_entries.find({"property_id": property_id, "user_id": user["user_id"], "date": {"$gte": year_start, "$lte": year_end}}, {"_id": 0}).to_list(10000)
    expenses = await db.expense_entries.find({"property_id": property_id, "user_id": user["user_id"], "date": {"$gte": year_start, "$lte": year_end}}, {"_id": 0}).to_list(10000)
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([f"PropIQ Report - {prop.get('property_name', '')} - {year}"])
    writer.writerow([])
    writer.writerow(["Property Summary"])
    writer.writerow(["Field", "Value"])
    writer.writerow(["Name", prop.get("property_name", "")])
    writer.writerow(["Address", f"{prop.get('address', '')} {prop.get('suburb', '')} {prop.get('state', '')} {prop.get('postcode', '')}"])
    writer.writerow(["Purchase Price", prop.get("purchase_price", 0)])
    writer.writerow(["Current Value", prop.get("current_estimated_value", 0)])
    writer.writerow(["Loan Amount", prop.get("loan_amount", 0)])
    writer.writerow([])
    total_income = sum(i.get("amount", 0) for i in income)
    total_expenses = sum(e.get("amount", 0) for e in expenses)
    writer.writerow(["Financial Summary"])
    writer.writerow(["Total Income", total_income])
    writer.writerow(["Total Expenses", total_expenses])
    writer.writerow(["Net Profit/Loss", total_income - total_expenses])
    writer.writerow([])
    writer.writerow(["Income Entries"])
    writer.writerow(["Date", "Amount", "Type", "Frequency", "Tenant", "Notes"])
    for i in income:
        writer.writerow([i.get("date", ""), i.get("amount", 0), i.get("income_type", ""), i.get("frequency", ""), i.get("tenant_name", ""), i.get("notes", "")])
    writer.writerow([])
    writer.writerow(["Expense Entries"])
    writer.writerow(["Date", "Amount", "Category", "Recurring", "Frequency", "Notes"])
    for e in expenses:
        writer.writerow([e.get("date", ""), e.get("amount", 0), e.get("category", ""), e.get("recurring", False), e.get("frequency", ""), e.get("notes", "")])
    
    csv_content = output.getvalue()
    safe_name = re.sub(r'[^\w\s-]', '', prop.get('property_name', 'report')).strip().replace(' ', '_')
    filename = f"PropIQ_{safe_name}_{year}.csv"
    
    from starlette.responses import StreamingResponse
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@api_router.get("/reports/summary/{property_id}")
async def get_report_summary(property_id: str, request: Request, year: int = Query(default=None)):
    user = await get_current_user(request)
    if year is None:
        year = datetime.now(timezone.utc).year
    prop = await db.properties.find_one({"property_id": property_id, "user_id": user["user_id"]}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    year_start = f"{year}-01-01"
    year_end = f"{year}-12-31"
    income = await db.income_entries.find({"property_id": property_id, "user_id": user["user_id"], "date": {"$gte": year_start, "$lte": year_end}}, {"_id": 0}).to_list(10000)
    expenses = await db.expense_entries.find({"property_id": property_id, "user_id": user["user_id"], "date": {"$gte": year_start, "$lte": year_end}}, {"_id": 0}).to_list(10000)
    
    total_income = sum(i.get("amount", 0) for i in income)
    total_expenses = sum(e.get("amount", 0) for e in expenses)
    repair_total = sum(e.get("amount", 0) for e in expenses if e.get("category") in ["repairs", "repeated repairs", "maintenance"])
    expense_by_cat = {}
    for e in expenses:
        cat = e.get("category", "miscellaneous")
        expense_by_cat[cat] = expense_by_cat.get(cat, 0) + e.get("amount", 0)
    
    purchase = prop.get("purchase_price", 0)
    current = prop.get("current_estimated_value", 0)
    growth = ((current - purchase) / purchase * 100) if purchase > 0 else 0
    
    return {
        "property": prop,
        "year": year,
        "total_income": total_income,
        "total_expenses": total_expenses,
        "net_profit_loss": total_income - total_expenses,
        "repair_total": repair_total,
        "capital_growth_pct": round(growth, 2),
        "expense_by_category": expense_by_cat,
        "income_entries": income,
        "expense_entries": expenses
    }

# ==================== MULTI-YEAR COMPARISON ====================

@api_router.get("/reports/comparison/{property_id}")
async def get_year_comparison(property_id: str, request: Request):
    user = await get_current_user(request)
    prop = await db.properties.find_one({"property_id": property_id, "user_id": user["user_id"]}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    
    now = datetime.now(timezone.utc)
    current_year = now.year
    years_data = []
    
    for y in range(current_year - 4, current_year + 1):
        ys = f"{y}-01-01"
        ye = f"{y}-12-31"
        inc = await db.income_entries.find({"property_id": property_id, "user_id": user["user_id"], "date": {"$gte": ys, "$lte": ye}}, {"_id": 0}).to_list(10000)
        exp = await db.expense_entries.find({"property_id": property_id, "user_id": user["user_id"], "date": {"$gte": ys, "$lte": ye}}, {"_id": 0}).to_list(10000)
        total_inc = sum(i.get("amount", 0) for i in inc)
        total_exp = sum(e.get("amount", 0) for e in exp)
        repairs = sum(e.get("amount", 0) for e in exp if e.get("category") in ["repairs", "repeated repairs", "maintenance"])
        exp_cats = {}
        for e in exp:
            cat = e.get("category", "miscellaneous")
            exp_cats[cat] = exp_cats.get(cat, 0) + e.get("amount", 0)
        years_data.append({
            "year": y,
            "income": total_inc,
            "expenses": total_exp,
            "net_cashflow": total_inc - total_exp,
            "repairs": repairs,
            "expense_categories": exp_cats,
            "entry_count": len(inc) + len(exp)
        })
    
    return {
        "property_id": property_id,
        "property_name": prop.get("property_name", ""),
        "purchase_price": prop.get("purchase_price", 0),
        "current_value": prop.get("current_estimated_value", 0),
        "years": years_data
    }

# ==================== PORTFOLIO HISTORY ====================

@api_router.get("/portfolio/history")
async def get_portfolio_history(request: Request):
    user = await get_current_user(request)
    snapshots = await db.portfolio_snapshots.find({"user_id": user["user_id"]}, {"_id": 0}).sort("date", 1).to_list(1000)
    return snapshots

@api_router.post("/portfolio/snapshot")
async def create_portfolio_snapshot(request: Request):
    user = await get_current_user(request)
    user_id = user["user_id"]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    existing = await db.portfolio_snapshots.find_one({"user_id": user_id, "date": today})
    
    properties = await db.properties.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
    total_market = sum(p.get("current_estimated_value", 0) for p in properties)
    total_purchase = sum(p.get("purchase_price", 0) for p in properties)
    total_equity = total_market - sum(p.get("loan_amount", 0) for p in properties)
    total_loans = sum(p.get("loan_amount", 0) for p in properties)
    
    now = datetime.now(timezone.utc)
    year_start = f"{now.year}-01-01"
    all_income = await db.income_entries.find({"user_id": user_id, "date": {"$gte": year_start}}, {"_id": 0}).to_list(10000)
    all_expenses = await db.expense_entries.find({"user_id": user_id, "date": {"$gte": year_start}}, {"_id": 0}).to_list(10000)
    ytd_income = sum(i.get("amount", 0) for i in all_income)
    ytd_expenses = sum(e.get("amount", 0) for e in all_expenses)
    
    snapshot = {
        "user_id": user_id,
        "date": today,
        "total_properties": len(properties),
        "total_market_value": total_market,
        "total_purchase_value": total_purchase,
        "total_equity": total_equity,
        "total_loans": total_loans,
        "ytd_income": ytd_income,
        "ytd_expenses": ytd_expenses,
        "net_cashflow": ytd_income - ytd_expenses,
    }
    
    if existing:
        await db.portfolio_snapshots.update_one({"user_id": user_id, "date": today}, {"$set": snapshot})
    else:
        snapshot["snapshot_id"] = f"snap_{uuid.uuid4().hex[:12]}"
        await db.portfolio_snapshots.insert_one(snapshot)
    
    return {"message": "Snapshot saved", "date": today}

# ==================== AI INSIGHTS ====================

@api_router.post("/ai/insights")
async def get_ai_insights(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    property_id = body.get("property_id")
    model = body.get("model", "gpt-5.2")
    
    prop = await db.properties.find_one({"property_id": property_id, "user_id": user["user_id"]}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    
    now = datetime.now(timezone.utc)
    year_start = f"{now.year}-01-01"
    income = await db.income_entries.find({"property_id": property_id, "user_id": user["user_id"], "date": {"$gte": year_start}}, {"_id": 0}).to_list(10000)
    expenses = await db.expense_entries.find({"property_id": property_id, "user_id": user["user_id"], "date": {"$gte": year_start}}, {"_id": 0}).to_list(10000)
    
    total_income = sum(i.get("amount", 0) for i in income)
    total_expenses = sum(e.get("amount", 0) for e in expenses)
    
    prompt_text = f"""Analyze this investment property and provide actionable insights:
Property: {prop.get('property_name', '')}
Address: {prop.get('address', '')} {prop.get('suburb', '')} {prop.get('state', '')}
Type: {prop.get('property_type', '')} | Bedrooms: {prop.get('bedrooms', 0)} | Bathrooms: {prop.get('bathrooms', 0)}
Purchase Price: ${prop.get('purchase_price', 0):,.2f}
Current Value: ${prop.get('current_estimated_value', 0):,.2f}
Loan: ${prop.get('loan_amount', 0):,.2f} at {prop.get('interest_rate', 0)}%
YTD Income: ${total_income:,.2f} | YTD Expenses: ${total_expenses:,.2f}
Net Cashflow: ${total_income - total_expenses:,.2f}

Provide:
1. Performance assessment (2-3 sentences)
2. Key risks to watch
3. Optimization suggestions for income
4. Expense reduction opportunities
5. Market outlook consideration
Keep it concise and actionable. Format with bullet points."""

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        if model == "gemini-3-flash":
            chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"insights_{property_id}_{uuid.uuid4().hex[:6]}", system_message="You are a professional property investment analyst.")
            chat.with_model("gemini", "gemini-3-flash-preview")
        else:
            chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"insights_{property_id}_{uuid.uuid4().hex[:6]}", system_message="You are a professional property investment analyst.")
            chat.with_model("openai", "gpt-5.2")
        
        user_message = UserMessage(text=prompt_text)
        response = await chat.send_message(user_message)
        return {"insights": response, "model": model}
    except Exception as e:
        logger.error(f"AI insights error: {e}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")

# ==================== PROPERTY LOOKUP (Domain.com.au + AI Fallback) ====================

async def _scrape_domain_for_property(full_address: str) -> Optional[dict]:
    """Try to find property details on domain.com.au via suburb search"""
    try:
        import urllib.parse
        # Clean the address for domain.com.au URL format
        clean = full_address.lower().strip().replace(' ', '-').replace(',', '')
        url = f"https://www.domain.com.au/sale/{clean}/"
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-AU,en;q=0.5",
        }
        
        async with httpx.AsyncClient(timeout=8.0) as http_client:
            resp = await http_client.get(url, headers=headers, follow_redirects=True)
            
            if resp.status_code != 200:
                return None
            
            soup = BeautifulSoup(resp.text, 'html.parser')
            text = soup.get_text(separator=' ', strip=True)
            
            # Look for property feature patterns
            beds_match = re.search(r'(\d+)\s*Beds?', text)
            baths_match = re.search(r'(\d+)\s*Baths?', text)
            parking_match = re.search(r'(\d+)\s*Parking', text)
            size_match = re.search(r'(\d+)\s*m²', text)
            
            # Property type detection
            property_type = "house"
            text_lower = text.lower()
            if "apartment" in text_lower or "unit" in text_lower or "flat" in text_lower:
                property_type = "apartment"
            elif "townhouse" in text_lower:
                property_type = "townhouse"
            elif "land" in text_lower and "vacant" in text_lower:
                property_type = "land"
            
            if beds_match or baths_match:
                return {
                    "bedrooms": int(beds_match.group(1)) if beds_match else 0,
                    "bathrooms": int(baths_match.group(1)) if baths_match else 0,
                    "parking": int(parking_match.group(1)) if parking_match else 0,
                    "land_size": int(size_match.group(1)) if size_match else 0,
                    "property_type": property_type,
                    "source": "domain.com.au",
                }
            
            return None
    except Exception as e:
        logger.warning(f"Domain.com.au scrape unavailable: {type(e).__name__}")
        return None


async def _ai_estimate_property(street: str, suburb: str, state: str, postcode: str) -> Optional[dict]:
    """Use GPT-5.2 via Emergent LLM Key to estimate property details"""
    if not EMERGENT_LLM_KEY:
        return None
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        full_addr = f"{street}, {suburb}, {state} {postcode}, Australia"
        prompt = f"""Given this Australian property address, provide your best estimate of the property specifications.

Address: {full_addr}

IMPORTANT RULES:
- This is an EXISTING residential property in Australia at the given address
- Consider the specific suburb "{suburb}" in {state} (postcode {postcode}) and what type of housing is typical there
- Inner city suburbs (CBD, close to city) tend to have apartments/units with fewer bedrooms
- Outer suburbs and regional areas tend to have houses with more bedrooms and land
- New estates (postcodes 3000s-3100s in VIC, 2700s-2900s in NSW) often have 3-4 bedroom houses on small blocks (300-450m²)  
- Older established suburbs often have 3 bedroom houses on larger blocks (500-800m²)
- If street name contains "Circuit", "Crescent", "Way", "Drive" it is likely a newer housing estate
- If street name contains "Road", "Street", "Avenue" it could be older or mixed
- Units/apartments have 0 land size and typically 1-2 bedrooms

Respond with ONLY a valid JSON object:
{{"bedrooms": <int>, "bathrooms": <int>, "parking": <int>, "land_size": <int in m², 0 for apartments>, "property_type": "<house|apartment|townhouse|unit|villa|duplex>"}}"""

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"prop_lookup_{uuid.uuid4().hex[:8]}",
            system_message="You are an Australian real estate data assistant. You provide accurate property specifications based on address location. Respond with JSON only, no explanation."
        )
        chat.with_model("openai", "gpt-5.2")
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        # Parse the JSON response
        import json
        response_text = response.strip()
        # Remove markdown code blocks if present
        if response_text.startswith("```"):
            response_text = re.sub(r'^```(?:json)?\s*', '', response_text)
            response_text = re.sub(r'\s*```$', '', response_text)
        
        data = json.loads(response_text)
        return {
            "bedrooms": int(data.get("bedrooms", 3)),
            "bathrooms": int(data.get("bathrooms", 1)),
            "parking": int(data.get("parking", 1)),
            "land_size": float(data.get("land_size", 0)),
            "property_type": str(data.get("property_type", "house")),
            "source": "ai_estimate",
        }
    except Exception as e:
        logger.error(f"AI property estimate error: {e}")
        return None


@api_router.get("/property/lookup")
async def lookup_property_details(
    street: str = Query(""),
    suburb: str = Query(""),
    state: str = Query(""),
    postcode: str = Query(""),
):
    """Look up property details using AI estimation based on address"""
    if not suburb and not street:
        raise HTTPException(status_code=400, detail="At least suburb or street required")
    
    full_address = f"{street}, {suburb} {state} {postcode}".strip(", ")
    logger.info(f"Looking up property details for: {full_address}")
    
    # Use AI estimation (domain.com.au scraping removed - always blocked/timed out)
    ai_result = await _ai_estimate_property(street, suburb, state, postcode)
    
    if ai_result:
        logger.info(f"AI estimated property data: {ai_result}")
        return ai_result
    
    # Return sensible defaults if AI fails
    return {
        "bedrooms": 3,
        "bathrooms": 1,
        "parking": 1,
        "land_size": 0,
        "property_type": "house",
        "source": "default",
    }


# ==================== ADDRESS SEARCH ====================

@api_router.get("/address/search")
async def search_address(q: str = Query(..., min_length=3)):
    """Australian address autocomplete using multiple sources for accuracy"""
    results = []
    
    # Source 1: Photon (Komoot) - better autocomplete behavior
    try:
        async with httpx.AsyncClient() as http_client:
            resp = await http_client.get(
                "https://photon.komoot.io/api/",
                params={
                    "q": q,
                    "limit": 6,
                    "lang": "en",
                    "lat": -25.2744,  # Australia center bias
                    "lon": 133.7751,
                },
                headers={"User-Agent": "PropIQ/1.0"},
                timeout=4.0,
            )
        if resp.status_code == 200:
            data = resp.json()
            for f in data.get("features", []):
                props = f.get("properties", {})
                country = props.get("country", "")
                if country and "Australia" not in country:
                    continue  # Skip non-Australian results
                
                house_number = props.get("housenumber", "")
                street_name = props.get("street", props.get("name", ""))
                
                # In Australian data: district = suburb (e.g. Sebastopol), city = sub-locality (e.g. Bonshaw)
                district = props.get("district", "")
                city = props.get("city", props.get("locality", ""))
                # Use district as suburb if available (more recognizable to users), fallback to city
                suburb = district if district else city
                
                state = props.get("state", "")
                postcode = props.get("postcode", "")
                
                street_full = f"{house_number} {street_name}".strip()
                if not street_full or street_full == street_name:
                    # Skip results with no house number if user typed a number
                    if q and q[0].isdigit() and not house_number:
                        continue
                
                # Build clean display
                parts = [p for p in [street_full, suburb, state, postcode] if p]
                display = ", ".join(parts)
                
                if display and display not in [r.get("display") for r in results]:
                    results.append({
                        "display": display,
                        "street": street_full,
                        "suburb": suburb,
                        "state": state,
                        "postcode": postcode,
                        "lat": str(f.get("geometry", {}).get("coordinates", [0, 0])[1]),
                        "lon": str(f.get("geometry", {}).get("coordinates", [0, 0])[0]),
                    })
    except Exception as e:
        logger.warning(f"Photon search error: {type(e).__name__}")
    
    # Source 2: Nominatim (OpenStreetMap) - more structured results
    if len(results) < 4:
        try:
            async with httpx.AsyncClient() as http_client:
                resp = await http_client.get(
                    "https://nominatim.openstreetmap.org/search",
                    params={
                        "q": q,
                        "format": "json",
                        "addressdetails": 1,
                        "countrycodes": "au",
                        "limit": 5,
                        "dedupe": 1,
                    },
                    headers={"User-Agent": "PropIQ/1.0"},
                    timeout=4.0,
                )
            if resp.status_code == 200:
                for r in resp.json():
                    addr = r.get("address", {})
                    house_number = addr.get("house_number", "")
                    road = addr.get("road", "")
                    street_full = f"{house_number} {road}".strip()
                    suburb = addr.get("suburb", addr.get("town", addr.get("city", addr.get("village", ""))))
                    state = addr.get("state", "")
                    postcode = addr.get("postcode", "")
                    
                    parts = [p for p in [street_full, suburb, state, postcode] if p]
                    display = ", ".join(parts)
                    
                    # Avoid duplicates
                    if display and display not in [r.get("display") for r in results]:
                        results.append({
                            "display": display,
                            "street": street_full,
                            "suburb": suburb,
                            "state": state,
                            "postcode": postcode,
                            "lat": r.get("lat"),
                            "lon": r.get("lon"),
                        })
        except Exception as e:
            logger.warning(f"Nominatim search error: {type(e).__name__}")
    
    # Return top 6 unique results
    return results[:6]

@api_router.get("/")
async def root():
    return {"message": "PropIQ API", "status": "running"}

@api_router.get("/health")
async def health():
    return {"status": "healthy"}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
