from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import HTMLResponse, StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
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

# Configure logging FIRST so startup messages are captured
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME', 'propiq_track')
# Redact credentials in logged URL for security
_safe_mongo = re.sub(r'://[^@]+@', '://***:***@', mongo_url) if '@' in mongo_url else mongo_url
logger.info(f"[INIT] MongoDB connecting to: {_safe_mongo} | db_name={db_name}")
client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
db = client[db_name]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# Google OAuth — accepted audiences for native Google Sign-In ID tokens.
# The web client ID is shared by iOS and Android native flows when `webClientId` is configured in
# the frontend GoogleSignin.configure() call — that's why both iOS/Android tokens end up with
# the web client ID as their `aud` claim. We still allow the platform-specific client IDs as
# a safety net in case any future code path issues native-audience tokens.
GOOGLE_WEB_CLIENT_ID = os.environ.get(
    'GOOGLE_WEB_CLIENT_ID',
    '523301849570-u5vs3u4k031secaq9b7ovl5ksjvid10n.apps.googleusercontent.com',
)
GOOGLE_IOS_CLIENT_ID = os.environ.get(
    'GOOGLE_IOS_CLIENT_ID',
    '523301849570-dd81ull5lno640g9vuhk1r7406n81s94.apps.googleusercontent.com',
)
GOOGLE_ANDROID_CLIENT_ID = os.environ.get(
    'GOOGLE_ANDROID_CLIENT_ID',
    '523301849570-3hfq7ud39lvdn9ja38pupfk45nit4bei.apps.googleusercontent.com',
)
GOOGLE_ALLOWED_AUDIENCES = {
    GOOGLE_WEB_CLIENT_ID,
    GOOGLE_IOS_CLIENT_ID,
    GOOGLE_ANDROID_CLIENT_ID,
}

# Apple Sign-In — the client_id is the app's Bundle ID for native sign-ins.
# Apple IDs the `aud` claim in the identity token with the Bundle ID.
APPLE_BUNDLE_ID = os.environ.get(
    'APPLE_BUNDLE_ID',
    'app.emergent.propiqtestb2da5181',
)
APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys'
APPLE_ISSUER = 'https://appleid.apple.com'
# Cache JWKS in memory for 1 hour
_apple_jwks_cache: dict = {"fetched_at": 0, "keys": []}

app = FastAPI()
api_router = APIRouter(prefix="/api")

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

# ==================== AUTH ROUTES (Native Google Sign-In) ====================

class GoogleAuthRequest(BaseModel):
    id_token: str


@api_router.post("/auth/google")
async def google_auth(payload: GoogleAuthRequest, response: Response):
    """Verify a Google ID token from the native @react-native-google-signin SDK and create a session.

    The token is minted by Google for one of our configured OAuth client IDs. We verify the
    signature against Google's public keys and check the audience is one of our allowed client IDs.
    """
    id_token_str = (payload.id_token or "").strip()
    if not id_token_str:
        raise HTTPException(status_code=400, detail="id_token required")

    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests
    except ImportError:
        logger.error("[AUTH] google-auth library not installed")
        raise HTTPException(status_code=500, detail="Auth backend misconfigured")

    # Verify against Google without a fixed audience, then check audience ourselves
    # (v2 SDK on iOS/Android signs tokens with the web client ID as the audience, but a small
    # subset of library versions may use the platform client ID).
    try:
        idinfo = google_id_token.verify_oauth2_token(
            id_token_str,
            google_requests.Request(),
            # Pass None so google-auth doesn't reject on mismatch — we handle aud below
            audience=None,
            clock_skew_in_seconds=10,
        )
    except ValueError as e:
        logger.warning(f"[AUTH] Google ID token invalid: {e}")
        raise HTTPException(status_code=401, detail="Invalid Google ID token")
    except Exception as e:
        logger.error(f"[AUTH] Google token verification error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Could not verify Google token")

    # Audience check
    aud = idinfo.get("aud")
    if aud not in GOOGLE_ALLOWED_AUDIENCES:
        logger.warning(f"[AUTH] Google ID token audience mismatch: {aud}")
        raise HTTPException(status_code=401, detail="Token audience not allowed")

    # Issuer check (google-auth does this too, but be defensive)
    iss = idinfo.get("iss", "")
    if iss not in ("accounts.google.com", "https://accounts.google.com"):
        logger.warning(f"[AUTH] Google ID token bad issuer: {iss}")
        raise HTTPException(status_code=401, detail="Invalid token issuer")

    # Email must be present and verified
    email = idinfo.get("email")
    email_verified = idinfo.get("email_verified", False)
    if not email or not email_verified:
        raise HTTPException(status_code=401, detail="Google account email not verified")

    name = idinfo.get("name", "") or idinfo.get("given_name", "")
    picture = idinfo.get("picture", "")

    # Find or create user
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    now_iso = datetime.now(timezone.utc).isoformat()
    if existing_user:
        user_id = existing_user["user_id"]
        await db.users.update_one(
            {"email": email},
            {"$set": {"name": name, "picture": picture, "updated_at": now_iso}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "created_at": now_iso,
            "updated_at": now_iso,
        })

    # Create a fresh 30-day session
    session_token = str(uuid.uuid4())
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        "created_at": now_iso,
    })

    # Set cookie as well for any future web use, but mobile app uses Bearer token auth
    response.set_cookie(
        key="session_token",
        value=session_token,
        path="/",
        secure=True,
        httponly=True,
        samesite="none",
        max_age=30 * 24 * 3600,
    )

    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    logger.info(f"[AUTH] Google sign-in OK user_id={user_id} email={email}")
    return {
        "session_token": session_token,
        "user": user_doc,
    }


class AppleAuthRequest(BaseModel):
    identity_token: str
    full_name: Optional[str] = None  # Sent by iOS SDK only on FIRST sign-in


async def _fetch_apple_jwks() -> list:
    """Fetch + cache Apple's JWKS (rotated periodically by Apple)."""
    import time
    now = time.time()
    if _apple_jwks_cache["keys"] and (now - _apple_jwks_cache["fetched_at"]) < 3600:
        return _apple_jwks_cache["keys"]
    async with httpx.AsyncClient(timeout=10.0) as http_client:
        resp = await http_client.get(APPLE_JWKS_URL)
        resp.raise_for_status()
        keys = resp.json().get("keys", [])
    _apple_jwks_cache["keys"] = keys
    _apple_jwks_cache["fetched_at"] = now
    return keys


@api_router.post("/auth/apple")
async def apple_auth(payload: AppleAuthRequest, response: Response):
    """Verify an Apple identity token from expo-apple-authentication / native Apple SDK.

    Apple signs tokens with a rotating RSA key published at https://appleid.apple.com/auth/keys.
    We:
    - Decode token header to get `kid`
    - Fetch Apple JWKS (cached 1h), find matching key
    - Verify signature + standard claims
    - Check audience = our Bundle ID, issuer = https://appleid.apple.com
    - Use the stable `sub` claim as the unique user identifier (Option A — no email matching)
    """
    id_token_str = (payload.identity_token or "").strip()
    if not id_token_str:
        raise HTTPException(status_code=400, detail="identity_token required")

    try:
        import jwt as pyjwt
        from jwt.algorithms import RSAAlgorithm
    except ImportError:
        logger.error("[AUTH] PyJWT library not installed")
        raise HTTPException(status_code=500, detail="Auth backend misconfigured")

    # 1. Get kid from token header
    try:
        unverified_header = pyjwt.get_unverified_header(id_token_str)
        kid = unverified_header.get("kid")
        if not kid:
            raise HTTPException(status_code=401, detail="Invalid Apple token header")
    except Exception as e:
        logger.warning(f"[AUTH] Apple token header parse error: {e}")
        raise HTTPException(status_code=401, detail="Malformed Apple token")

    # 2. Fetch Apple's public keys and find the one matching kid
    try:
        keys = await _fetch_apple_jwks()
    except Exception as e:
        logger.error(f"[AUTH] Could not fetch Apple JWKS: {type(e).__name__}: {e}")
        raise HTTPException(status_code=502, detail="Could not verify Apple token (JWKS fetch)")

    matching_key = next((k for k in keys if k.get("kid") == kid), None)
    if not matching_key:
        logger.warning(f"[AUTH] Apple JWKS has no key for kid={kid}")
        raise HTTPException(status_code=401, detail="Apple token signing key not found")

    # 3. Verify signature + audience + issuer
    try:
        public_key = RSAAlgorithm.from_jwk(matching_key)
        claims = pyjwt.decode(
            id_token_str,
            public_key,
            algorithms=["RS256"],
            audience=APPLE_BUNDLE_ID,
            issuer=APPLE_ISSUER,
            options={"require": ["sub", "aud", "iss", "exp"]},
        )
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Apple token has expired")
    except pyjwt.InvalidAudienceError:
        logger.warning(f"[AUTH] Apple token audience mismatch (expected {APPLE_BUNDLE_ID})")
        raise HTTPException(status_code=401, detail="Apple token audience not allowed")
    except pyjwt.InvalidIssuerError:
        raise HTTPException(status_code=401, detail="Invalid Apple token issuer")
    except pyjwt.PyJWTError as e:
        logger.warning(f"[AUTH] Apple token signature invalid: {e}")
        raise HTTPException(status_code=401, detail="Invalid Apple identity token")
    except Exception as e:
        logger.error(f"[AUTH] Apple token verification error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Could not verify Apple token")

    apple_sub = claims.get("sub")
    if not apple_sub:
        raise HTTPException(status_code=401, detail="Apple token missing user identifier")

    # Apple gives us email only on FIRST sign-in (or if user re-consented).
    # If hidden relay address, it'll look like xxx@privaterelay.appleid.com — that's fine.
    email = claims.get("email", "")
    email_verified = claims.get("email_verified", False)
    if isinstance(email_verified, str):
        email_verified = email_verified.lower() == "true"

    # Name is passed separately by the iOS SDK only on first sign-in (not in the token).
    full_name_input = (payload.full_name or "").strip()

    # Option A: match users by apple_sub only (no auto-merge with Google on matching email).
    now_iso = datetime.now(timezone.utc).isoformat()
    existing_user = await db.users.find_one({"apple_sub": apple_sub}, {"_id": 0})
    if existing_user:
        user_id = existing_user["user_id"]
        updates: dict = {"updated_at": now_iso}
        if full_name_input and not existing_user.get("name"):
            updates["name"] = full_name_input
        if email and not existing_user.get("email"):
            updates["email"] = email
        await db.users.update_one({"user_id": user_id}, {"$set": updates})
    else:
        # First Apple sign-in: create new user. Use a stable synthetic email if Apple didn't
        # give us one (happens on subsequent sign-ins without consent reset).
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_email = email or f"apple_{apple_sub[:16]}@privaterelay.appleid.invalid"
        user_name = full_name_input or "Apple User"
        await db.users.insert_one({
            "user_id": user_id,
            "apple_sub": apple_sub,
            "email": user_email,
            "name": user_name,
            "picture": "",
            "email_verified": bool(email_verified),
            "auth_provider": "apple",
            "created_at": now_iso,
            "updated_at": now_iso,
        })

    session_token = str(uuid.uuid4())
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        "created_at": now_iso,
    })

    response.set_cookie(
        key="session_token",
        value=session_token,
        path="/",
        secure=True,
        httponly=True,
        samesite="none",
        max_age=30 * 24 * 3600,
    )

    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    logger.info(f"[AUTH] Apple sign-in OK user_id={user_id} apple_sub={apple_sub[:8]}...")
    return {
        "session_token": session_token,
        "user": user_doc,
    }


@api_router.delete("/users/me")
async def delete_my_account(request: Request):
    """Permanently delete the signed-in user's account and all associated data.

    Required by Apple Guideline 5.1.1(v). Cascade-deletes:
    - user document
    - all sessions
    - all properties (+ their income, expense, reminder, snapshot records)
    - all auth_polls (legacy, harmless if absent)
    """
    user = await get_current_user(request)
    user_id = user["user_id"]

    # Delete all data for this user. Order doesn't really matter since each collection
    # is filtered by user_id, but we do the parent last so partial failures don't orphan.
    await db.properties.delete_many({"user_id": user_id})
    await db.income_entries.delete_many({"user_id": user_id})
    await db.expense_entries.delete_many({"user_id": user_id})
    await db.reminders.delete_many({"user_id": user_id})
    try:
        await db.portfolio_snapshots.delete_many({"user_id": user_id})
    except Exception:
        pass
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.users.delete_one({"user_id": user_id})

    logger.info(f"[AUTH] Account deleted user_id={user_id}")
    return {"message": "Account and all associated data permanently deleted"}


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
    # Batch load property names to avoid N+1 queries
    properties = await db.properties.find({"user_id": user["user_id"]}, {"_id": 0, "property_id": 1, "property_name": 1}).to_list(1000)
    prop_map = {p["property_id"]: p.get("property_name", "") for p in properties}
    for r in reminders:
        r["property_name"] = prop_map.get(r.get("property_id"), "")
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

    # Run 3 Mongo queries in parallel — saves ~2/3 of the round-trip latency on
    # managed Mongo Atlas where each query has ~200ms ping overhead.
    properties, all_income, all_expenses = await asyncio.gather(
        db.properties.find({"user_id": user_id}, {"_id": 0}).to_list(1000),
        db.income_entries.find({"user_id": user_id}, {"_id": 0}).to_list(10000),
        db.expense_entries.find({"user_id": user_id}, {"_id": 0}).to_list(10000),
    )

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
    return {"filename": f"PropIQ_Track_{safe_name}_{year}.csv", "content_base64": csv_b64, "content_type": "text/csv"}


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
    filename = f"PropIQ_Track_{safe_name}_{year}.csv"
    
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


async def _search_property_details(street: str, suburb: str, state: str, postcode: str) -> Optional[dict]:
    """Search for real property details using web search + AI extraction"""
    full_addr = f"{street}, {suburb} {state} {postcode}"
    
    # Step 1: Search for the property using DuckDuckGo Lite
    snippets_text = ""
    try:
        search_query = f'"{street}" {suburb} {state} {postcode} bedrooms bathrooms property'
        async with httpx.AsyncClient(timeout=8.0) as http_client:
            resp = await http_client.get(
                "https://lite.duckduckgo.com/lite/",
                params={"q": search_query},
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
            )
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, 'html.parser')
            snippets = soup.find_all('td', class_='result-snippet')
            snippets_text = "\n".join([s.get_text(strip=True)[:300] for s in snippets[:6]])
            logger.info(f"Search found {len(snippets)} snippets for: {full_addr}")
    except Exception as e:
        logger.warning(f"Web search error: {type(e).__name__}")
    
    if not snippets_text:
        return None
    
    # Step 2: Try to extract property data directly from snippets using regex
    beds_match = re.search(r'(\d+)\s*(?:bed(?:room)?s?)', snippets_text, re.IGNORECASE)
    baths_match = re.search(r'(\d+)\s*(?:bath(?:room)?s?)', snippets_text, re.IGNORECASE)
    parking_match = re.search(r'(\d+)\s*(?:parking|car\s*(?:space|port|garage)s?)', snippets_text, re.IGNORECASE)
    land_match = re.search(r'(?:land\s*(?:size|area)?\s*(?:of|is)?\s*)?(\d[\d,]*)\s*m[²2]', snippets_text, re.IGNORECASE)
    
    # Determine property type - look for explicit statements like "is a House" or "property type: house"
    prop_type = "house"
    text_lower = snippets_text.lower()
    # Look for strong indicators first (e.g. "is a house", "is a townhouse")
    type_match = re.search(r'is\s+(?:a|an)\s+(house|apartment|unit|townhouse|villa|duplex|flat)', text_lower)
    if type_match:
        t = type_match.group(1)
        if t in ("unit", "flat"):
            prop_type = "apartment"
        else:
            prop_type = t
    elif "townhouse" in text_lower and "house" not in text_lower.replace("townhouse", ""):
        prop_type = "townhouse"
    elif ("apartment" in text_lower or "unit" in text_lower or "flat" in text_lower) and "house" not in text_lower:
        prop_type = "apartment"
    
    if beds_match or baths_match:
        result = {
            "bedrooms": int(beds_match.group(1)) if beds_match else 0,
            "bathrooms": int(baths_match.group(1)) if baths_match else 0,
            "parking": int(parking_match.group(1)) if parking_match else 0,
            "land_size": float(land_match.group(1).replace(',', '')) if land_match else 0,
            "property_type": prop_type,
            "source": "property_data",
        }
        logger.info(f"Extracted property data: {result}")
        return result
    
    # Step 3: If regex extraction failed, use AI to parse the snippets
    if EMERGENT_LLM_KEY:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            import json as json_module
            
            prompt = f"""Extract the property details from these search results about {full_addr}:

{snippets_text}

Return ONLY a JSON object with the ACTUAL data found (not estimates):
{{"bedrooms": <number>, "bathrooms": <number>, "parking": <number>, "land_size": <number in m²>, "property_type": "<house|apartment|townhouse|unit|villa|duplex>"}}

If the data is not in the search results, return: {{"error": "not_found"}}"""

            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"prop_extract_{uuid.uuid4().hex[:8]}",
                system_message="Extract structured property data from search result snippets. Return JSON only."
            )
            chat.with_model("openai", "gpt-5.2")
            response = await chat.send_message(UserMessage(text=prompt))
            
            response_text = response.strip()
            if response_text.startswith("```"):
                response_text = re.sub(r'^```(?:json)?\s*', '', response_text)
                response_text = re.sub(r'\s*```$', '', response_text)
            
            data = json_module.loads(response_text)
            if data.get("error") == "not_found":
                return None
            
            return {
                "bedrooms": int(data.get("bedrooms", 0)),
                "bathrooms": int(data.get("bathrooms", 0)),
                "parking": int(data.get("parking", 0)),
                "land_size": float(data.get("land_size", 0)),
                "property_type": str(data.get("property_type", "house")),
                "source": "property_data",
            }
        except Exception as e:
            logger.warning(f"AI extraction error: {type(e).__name__}")
    
    return None


@api_router.get("/property/lookup")
async def lookup_property_details(
    street: str = Query(""),
    suburb: str = Query(""),
    state: str = Query(""),
    postcode: str = Query(""),
):
    """Look up real property details by searching property websites"""
    if not suburb and not street:
        raise HTTPException(status_code=400, detail="At least suburb or street required")
    
    full_address = f"{street}, {suburb} {state} {postcode}".strip(", ")
    logger.info(f"Looking up property details for: {full_address}")
    
    # Search web for real property data
    result = await _search_property_details(street, suburb, state, postcode)
    
    if result:
        logger.info(f"Found real property data: {result}")
        return result
    
    # Return sensible defaults if search fails
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
    
    # Extract house number from query if user typed one (e.g. "13 ainsworth street mawson")
    user_house_number = ""
    query_match = re.match(r'^(\d+[a-zA-Z]?)\s+(.+)', q.strip())
    if query_match:
        user_house_number = query_match.group(1)
    
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
                
                # If Photon didn't return a house number but user typed one, use user's number
                if not house_number and user_house_number and street_name:
                    house_number = user_house_number
                
                # In Australian data: district = suburb, city = sub-locality
                district = props.get("district", "")
                city = props.get("city", props.get("locality", ""))
                suburb = district if district else city
                
                state = props.get("state", "")
                postcode = props.get("postcode", "")
                
                street_full = f"{house_number} {street_name}".strip()
                
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
                    
                    # If Nominatim didn't return a house number but user typed one, use user's number
                    if not house_number and user_house_number and road:
                        house_number = user_house_number
                    
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
    
    # Deduplicate by normalizing — remove duplicates where street+suburb+postcode match
    seen = set()
    unique_results = []
    for r in results:
        key = f"{r['street']}|{r['suburb']}|{r['postcode']}".lower()
        if key not in seen:
            seen.add(key)
            unique_results.append(r)
    
    # Return top 6 unique results
    return unique_results[:6]

@api_router.get("/")
async def root():
    return {"message": "PropIQ Track API", "status": "running"}

@api_router.api_route("/health", methods=["GET", "HEAD"])
async def health():
    """Basic health check — accepts GET and HEAD (ingress health probes use HEAD)"""
    return {"status": "healthy"}

@api_router.get("/health/detailed")
async def health_detailed():
    """Detailed health: DB connectivity, session counts, poll queue depth"""
    result = {"status": "healthy", "checks": {}}
    # DB ping
    try:
        await client.admin.command('ping')
        result["checks"]["mongodb"] = "ok"
    except Exception as e:
        result["status"] = "degraded"
        result["checks"]["mongodb"] = f"error: {type(e).__name__}"
    # Counts (safe to expose, no PII)
    try:
        result["checks"]["users"] = await db.users.count_documents({})
        result["checks"]["active_sessions"] = await db.user_sessions.count_documents({})
    except Exception as e:
        result["checks"]["counts"] = f"error: {type(e).__name__}"
    return result

@api_router.get("/admin/stats")
async def admin_stats(token: str = Query(...), format: str = Query(default="html")):
    """Protected admin endpoint to view aggregate usage stats.
    Access via ?token=<ADMIN_TOKEN> (set as Railway env var).
    Defaults to an HTML dashboard; pass ?format=json for raw JSON.
    No PII is exposed beyond partially-masked emails of the 10 most recent signups.
    """
    admin_token = os.environ.get("ADMIN_TOKEN", "")
    if not admin_token or token != admin_token:
        raise HTTPException(status_code=403, detail="Forbidden")

    now = datetime.now(timezone.utc)
    seven_days_ago_iso = (now - timedelta(days=7)).isoformat()
    thirty_days_ago_iso = (now - timedelta(days=30)).isoformat()
    today_start_iso = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

    # Parallel count queries for speed
    (
        total_users,
        new_users_today,
        new_users_7d,
        new_users_30d,
        apple_users,
        total_properties,
        total_income,
        total_expenses,
        total_reminders,
        sessions_last_7d,
        sessions_last_30d,
    ) = await asyncio.gather(
        db.users.count_documents({}),
        db.users.count_documents({"created_at": {"$gte": today_start_iso}}),
        db.users.count_documents({"created_at": {"$gte": seven_days_ago_iso}}),
        db.users.count_documents({"created_at": {"$gte": thirty_days_ago_iso}}),
        db.users.count_documents({"apple_sub": {"$exists": True}}),
        db.properties.count_documents({}),
        db.income_entries.count_documents({}),
        db.expense_entries.count_documents({}),
        db.reminders.count_documents({}),
        db.user_sessions.count_documents({"created_at": {"$gte": seven_days_ago_iso}}),
        db.user_sessions.count_documents({"created_at": {"$gte": thirty_days_ago_iso}}),
    )

    # Active users = distinct user_id among recent sessions
    active_7d_ids = await db.user_sessions.distinct(
        "user_id", {"created_at": {"$gte": seven_days_ago_iso}}
    )
    active_30d_ids = await db.user_sessions.distinct(
        "user_id", {"created_at": {"$gte": thirty_days_ago_iso}}
    )
    google_users = total_users - apple_users

    # 10 most recent signups (email partially masked)
    recent = await db.users.find(
        {}, {"_id": 0, "name": 1, "email": 1, "apple_sub": 1, "created_at": 1}
    ).sort("created_at", -1).limit(10).to_list(length=10)

    def _mask_email(e: str) -> str:
        if not e or "@" not in e:
            return e or ""
        local, domain = e.split("@", 1)
        if len(local) <= 2:
            return local[0] + "***@" + domain
        return local[:2] + "***@" + domain

    recent_users = [
        {
            "name": u.get("name", "") or "—",
            "email": _mask_email(u.get("email", "") or ""),
            "provider": "apple" if u.get("apple_sub") else "google",
            "joined": u.get("created_at", ""),
        }
        for u in recent
    ]

    payload = {
        "generated_at": now.isoformat(),
        "totals": {
            "users": total_users,
            "properties": total_properties,
            "income_entries": total_income,
            "expense_entries": total_expenses,
            "reminders": total_reminders,
        },
        "users": {
            "new_today": new_users_today,
            "new_last_7d": new_users_7d,
            "new_last_30d": new_users_30d,
            "active_last_7d": len(active_7d_ids),
            "active_last_30d": len(active_30d_ids),
            "by_provider": {"google": google_users, "apple": apple_users},
        },
        "sessions": {
            "last_7d": sessions_last_7d,
            "last_30d": sessions_last_30d,
        },
        "recent_users": recent_users,
    }

    if format.lower() == "json":
        return payload

    # Mobile-friendly HTML dashboard
    def _stat_card(label: str, value, hint: str = "") -> str:
        hint_html = f'<div class="hint">{hint}</div>' if hint else ""
        return (
            f'<div class="card"><div class="label">{label}</div>'
            f'<div class="value">{value}</div>{hint_html}</div>'
        )

    recent_rows = "".join(
        f'<tr><td>{u["name"]}</td><td>{u["email"]}</td>'
        f'<td><span class="chip chip-{u["provider"]}">{u["provider"]}</span></td>'
        f'<td>{(u["joined"] or "")[:10]}</td></tr>'
        for u in recent_users
    ) or '<tr><td colspan="4" class="empty">No users yet</td></tr>'

    html = f"""<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="robots" content="noindex,nofollow">
<title>PropIQ Admin Stats</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F5F5F4;color:#1C1917;padding:16px;max-width:720px;margin:0 auto;padding-bottom:48px}}
h1{{color:#1C3F35;font-size:24px;margin-bottom:4px}}
.sub{{color:#78716C;font-size:13px;margin-bottom:20px}}
h2{{color:#1C3F35;font-size:16px;margin:24px 0 12px;font-weight:600}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:10px}}
.grid-3{{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}}
.card{{background:#fff;border-radius:12px;padding:14px 12px;border:1px solid #E7E5E4}}
.label{{color:#78716C;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600}}
.value{{color:#1C3F35;font-size:26px;font-weight:700;margin-top:4px}}
.hint{{color:#A8A29E;font-size:11px;margin-top:2px}}
table{{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E7E5E4}}
th,td{{padding:10px 8px;text-align:left;font-size:13px;border-bottom:1px solid #F5F5F4}}
th{{background:#FAFAF9;color:#57534E;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600}}
tr:last-child td{{border-bottom:none}}
.empty{{text-align:center;color:#A8A29E;padding:20px;font-style:italic}}
.chip{{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;text-transform:capitalize}}
.chip-google{{background:#DBEAFE;color:#1E40AF}}
.chip-apple{{background:#E7E5E4;color:#1C1917}}
.footer{{margin-top:24px;color:#A8A29E;font-size:11px;text-align:center}}
.refresh{{display:inline-block;background:#1C3F35;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;margin-top:12px}}
</style></head><body>
<h1>📊 PropIQ Admin Stats</h1>
<div class="sub">Generated {now.strftime('%Y-%m-%d %H:%M UTC')}</div>

<h2>Portfolio Totals</h2>
<div class="grid">
  {_stat_card("Users", total_users)}
  {_stat_card("Properties", total_properties)}
  {_stat_card("Income entries", total_income)}
  {_stat_card("Expense entries", total_expenses)}
</div>

<h2>Signups</h2>
<div class="grid-3">
  {_stat_card("Today", new_users_today)}
  {_stat_card("Last 7 days", new_users_7d)}
  {_stat_card("Last 30 days", new_users_30d)}
</div>

<h2>Active Users (via sessions)</h2>
<div class="grid">
  {_stat_card("Active 7d", len(active_7d_ids), f"{sessions_last_7d} session starts")}
  {_stat_card("Active 30d", len(active_30d_ids), f"{sessions_last_30d} session starts")}
</div>

<h2>Sign-in Provider</h2>
<div class="grid">
  {_stat_card("Google", google_users)}
  {_stat_card("Apple", apple_users)}
</div>

<h2>Recent Signups (last 10)</h2>
<table>
<thead><tr><th>Name</th><th>Email</th><th>Via</th><th>Joined</th></tr></thead>
<tbody>{recent_rows}</tbody>
</table>

<div class="footer">
  <a class="refresh" href="?token={token}">🔄 Refresh</a><br/><br/>
  For raw JSON: append <code>&amp;format=json</code>
</div>
</body></html>"""
    return HTMLResponse(content=html)


@api_router.get("/privacy-policy", response_class=HTMLResponse)
async def privacy_policy_web():
    """Web-accessible privacy policy page (required for App Store / Play Store)"""
    return HTMLResponse(content="""<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>PropIQ - Privacy Policy</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:0 auto;padding:20px 24px;color:#1C1917;line-height:1.7}h1{color:#1C3F35;border-bottom:2px solid #1C3F35;padding-bottom:10px}h2{color:#1C3F35;margin-top:28px}p,ul{font-size:15px;color:#44403C}.updated{color:#78716C;font-style:italic;font-size:13px}</style></head><body>
<h1>PropIQ Track Privacy Policy</h1><p class="updated">Last Updated: April 2026</p>
<h2>1. Introduction</h2><p>PropIQ Track ("we", "our", "us") is committed to protecting the privacy and security of your personal information. This Privacy Policy explains how we collect, use, store, and protect your data when you use the PropIQ Track mobile application ("App").</p>
<h2>2. Information We Collect</h2><ul><li><b>Account Information:</b> Name and email via Google Sign-In</li><li><b>Property Data:</b> Addresses, prices, valuations, specifications, photos</li><li><b>Financial Data:</b> Income, expenses, receipts, bill reminders</li><li><b>Usage Data:</b> App interaction logs, device type, crash reports</li></ul><p>We do NOT collect passwords, location data, contacts, or data from other apps.</p>
<h2>3. How We Use Your Data</h2><p>Your data is used solely to provide property tracking, financial calculations, reporting, and bill reminders. We do NOT sell or share your data with third parties for marketing.</p>
<h2>4. Data Storage & Security</h2><p>All data is encrypted in transit (TLS/SSL) and at rest (AES-256). We use session-based authentication, access controls, and regular security audits.</p>
<h2>5. Third-Party Services</h2><ul><li>Google Sign-In (authentication)</li><li>Google AdMob (advertising)</li><li>OpenStreetMap/Photon (address autocomplete)</li></ul>
<h2>6. Data Retention</h2><p>Data is retained while your account is active. Upon deletion request, all data is permanently removed within 30 days.</p>
<h2>7. Your Rights</h2><p>You may access, export (CSV/PDF), correct, or request deletion of your data. Contact: privacy@propiq.app</p>
<h2>8. Children's Privacy</h2><p>PropIQ is not intended for individuals under 18.</p>
<h2>9. Advertising</h2><p>PropIQ uses Google AdMob. You can opt out of personalized ads via device settings. We do not share property/financial data with advertisers.</p>
<h2>10. Changes</h2><p>We may update this policy. Changes will be posted within the App.</p>
<h2>11. Contact</h2><p>Privacy: privacy@propiq.app | Data Deletion: delete@propiq.app</p>
</body></html>""")

@api_router.get("/security-policy", response_class=HTMLResponse)
async def security_policy_web():
    """Web-accessible security policy page"""
    return HTMLResponse(content="""<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>PropIQ - Security Policy</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:0 auto;padding:20px 24px;color:#1C1917;line-height:1.7}h1{color:#1C3F35;border-bottom:2px solid #1C3F35;padding-bottom:10px}h2{color:#1C3F35;margin-top:28px}p,ul{font-size:15px;color:#44403C}.updated{color:#78716C;font-style:italic;font-size:13px}</style></head><body>
<h1>PropIQ Track Security Policy</h1><p class="updated">Last Updated: April 2026</p>
<h2>1. Overview</h2><p>PropIQ implements industry-standard cybersecurity measures to ensure confidentiality, integrity, and availability of all user data.</p>
<h2>2. Authentication</h2><ul><li>OAuth 2.0 via Google Sign-In</li><li>Session tokens with 24-hour expiration</li><li>No passwords stored</li><li>Server-side validation on every request</li></ul>
<h2>3. Encryption</h2><ul><li>TLS 1.2+ for all data in transit</li><li>AES-256 for data at rest</li><li>HTTPS enforced on all endpoints</li></ul>
<h2>4. Infrastructure</h2><ul><li>Enterprise-grade cloud hosting</li><li>Network isolation and firewalls</li><li>DDoS protection</li><li>Automated encrypted backups</li></ul>
<h2>5. Application Security</h2><ul><li>Input validation and sanitization</li><li>Protection against SQL injection, XSS, CSRF</li><li>Rate limiting on API endpoints</li><li>Regular dependency vulnerability scanning</li></ul>
<h2>6. Incident Response</h2><p>Immediate containment, user notification within 72 hours of confirmed breach, root cause analysis, and post-incident review.</p>
<h2>7. Compliance</h2><ul><li>Australian Privacy Act 1988 & APPs</li><li>OWASP Top 10 guidelines</li><li>App Store & Play Store security requirements</li></ul>
<h2>8. Contact</h2><p>Report vulnerabilities: security@propiq.app (48-hour response time)</p>
</body></html>""")

# Include router
app.include_router(api_router)


# Root-level static files served outside /api/ prefix.
# AdMob requires app-ads.txt at the root of the developer's domain (i.e.
# https://backend-production-960d.up.railway.app/app-ads.txt) so that it can
# verify ownership of the iOS / Android apps after crawling the Privacy Policy
# URL listed in App Store Connect / Play Console.
@app.get("/app-ads.txt", response_class=Response)
async def app_ads_txt():
    content = "google.com, pub-9480363771925708, DIRECT, f08c47fec0942fa0\n"
    return Response(content=content, media_type="text/plain")


# Optional: also serve ads.txt for any web inventory (harmless if unused; some
# crawlers probe both filenames).
@app.get("/ads.txt", response_class=Response)
async def ads_txt():
    content = "google.com, pub-9480363771925708, DIRECT, f08c47fec0942fa0\n"
    return Response(content=content, media_type="text/plain")


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_init():
    """Ping DB and create indexes for auth performance + auto-cleanup"""
    try:
        await client.admin.command('ping')
        logger.info("[INIT] MongoDB ping OK — connection verified")
    except Exception as e:
        logger.error(f"[INIT] MongoDB ping FAILED: {type(e).__name__}: {e}")
    try:
        # Fast lookups on session token
        await db.user_sessions.create_index("session_token", unique=True, background=True)
        await db.user_sessions.create_index("user_id", background=True)
        # Fast user lookups
        await db.users.create_index("user_id", unique=True, background=True)
        await db.users.create_index("email", unique=True, background=True)
        # Auth polls: unique poll_token + TTL cleanup via completed_at field (expire after 10 min)
        await db.auth_polls.create_index("poll_token", unique=True, background=True)
        # Property/income/expense indexes for dashboard speed
        await db.properties.create_index([("user_id", 1), ("created_date", -1)], background=True)
        await db.income_entries.create_index([("user_id", 1), ("property_id", 1), ("date", -1)], background=True)
        await db.expense_entries.create_index([("user_id", 1), ("property_id", 1), ("date", -1)], background=True)
        logger.info("[INIT] MongoDB indexes ensured")
    except Exception as e:
        logger.warning(f"[INIT] Index creation warning: {type(e).__name__}: {e}")

    # Background keep-alive: ping MongoDB every 60s to prevent container idle cycling
    # that causes intermittent 404s at the ingress layer on Emergent preview/production URLs.
    import asyncio
    async def _keepalive_loop():
        while True:
            try:
                await asyncio.sleep(60)
                await client.admin.command('ping')
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"[KEEPALIVE] ping failed: {type(e).__name__}")
    asyncio.create_task(_keepalive_loop())
    logger.info("[INIT] Keep-alive background task started (60s interval)")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
