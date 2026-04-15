"""
PropIQ Backend API Tests
Tests: Health, Auth, Properties CRUD, Income CRUD, Expense CRUD, Dashboard, Reports
"""
import pytest
import requests
import os
from datetime import datetime

# Read from frontend .env file
def get_backend_url():
    try:
        with open('/app/frontend/.env', 'r') as f:
            for line in f:
                if line.startswith('EXPO_PUBLIC_BACKEND_URL='):
                    return line.split('=', 1)[1].strip()
    except:
        pass
    return ''

BASE_URL = get_backend_url().rstrip('/')
SESSION_TOKEN = "test_session_propiq_123"

@pytest.fixture
def api_client():
    """Shared requests session with auth"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {SESSION_TOKEN}"
    })
    return session

@pytest.fixture
def test_property_id(api_client):
    """Create a test property and return its ID for use in tests"""
    payload = {
        "property_name": "TEST_Pytest_Property",
        "address": "123 Test St",
        "suburb": "Testville",
        "state": "VIC",
        "postcode": "3000",
        "purchase_price": 500000,
        "purchase_date": "2023-01-15",
        "loan_amount": 400000,
        "interest_rate": 5.5,
        "current_estimated_value": 550000,
        "property_type": "house",
        "bedrooms": 3,
        "bathrooms": 2,
        "parking": 2,
        "land_size": 600,
        "notes": "Test property for pytest"
    }
    response = api_client.post(f"{BASE_URL}/api/properties", json=payload)
    assert response.status_code == 200
    data = response.json()
    property_id = data["property_id"]
    
    yield property_id
    
    # Cleanup
    try:
        api_client.delete(f"{BASE_URL}/api/properties/{property_id}")
    except:
        pass

# ==================== HEALTH CHECKS ====================

class TestHealth:
    """Health check endpoints"""
    
    def test_root_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert data["message"] == "PropIQ API"
        assert data["status"] == "running"
        print("✓ Root endpoint working")
    
    def test_health_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("✓ Health endpoint working")

# ==================== AUTH TESTS ====================

class TestAuth:
    """Authentication endpoints"""
    
    def test_auth_me_with_bearer_token(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        
        data = response.json()
        assert "user_id" in data
        assert data["user_id"] == "test-user-propiq"
        assert data["email"] == "test@propiq.com"
        assert data["name"] == "Test Investor"
        print(f"✓ Auth /me working - User: {data['name']}")
    
    def test_auth_me_without_token(self):
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("✓ Auth correctly rejects unauthenticated requests")

# ==================== PROPERTIES CRUD ====================

class TestProperties:
    """Property CRUD operations"""
    
    def test_create_property_and_verify(self, api_client):
        """Create property and verify via GET"""
        payload = {
            "property_name": "TEST_Create_Property",
            "address": "456 Create Ave",
            "suburb": "Melbourne",
            "state": "VIC",
            "postcode": "3001",
            "purchase_price": 600000,
            "purchase_date": "2024-01-01",
            "loan_amount": 480000,
            "interest_rate": 6.0,
            "current_estimated_value": 620000,
            "property_type": "apartment",
            "bedrooms": 2,
            "bathrooms": 1,
            "parking": 1,
            "land_size": 0,
            "notes": "Test apartment"
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/properties", json=payload)
        assert create_response.status_code == 200
        
        created = create_response.json()
        assert created["property_name"] == payload["property_name"]
        assert created["purchase_price"] == payload["purchase_price"]
        assert "property_id" in created
        assert "user_id" in created
        
        property_id = created["property_id"]
        
        # Verify persistence with GET
        get_response = api_client.get(f"{BASE_URL}/api/properties/{property_id}")
        assert get_response.status_code == 200
        
        fetched = get_response.json()
        assert fetched["property_id"] == property_id
        assert fetched["property_name"] == payload["property_name"]
        assert fetched["purchase_price"] == payload["purchase_price"]
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/properties/{property_id}")
        print(f"✓ Property create and verify working - ID: {property_id}")
    
    def test_list_properties(self, api_client, test_property_id):
        """List all properties for user"""
        response = api_client.get(f"{BASE_URL}/api/properties")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        
        # Verify our test property is in the list
        property_ids = [p["property_id"] for p in data]
        assert test_property_id in property_ids
        print(f"✓ List properties working - Found {len(data)} properties")
    
    def test_get_property_detail(self, api_client, test_property_id):
        """Get single property detail"""
        response = api_client.get(f"{BASE_URL}/api/properties/{test_property_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["property_id"] == test_property_id
        assert data["property_name"] == "TEST_Pytest_Property"
        assert data["purchase_price"] == 500000
        print(f"✓ Get property detail working")
    
    def test_update_property_and_verify(self, api_client, test_property_id):
        """Update property and verify changes"""
        update_payload = {
            "property_name": "TEST_Updated_Property",
            "address": "123 Test St",
            "suburb": "Testville",
            "state": "VIC",
            "postcode": "3000",
            "purchase_price": 500000,
            "purchase_date": "2023-01-15",
            "loan_amount": 400000,
            "interest_rate": 5.5,
            "current_estimated_value": 600000,
            "property_type": "house",
            "bedrooms": 4,
            "bathrooms": 2,
            "parking": 2,
            "land_size": 600,
            "notes": "Updated notes"
        }
        
        update_response = api_client.put(f"{BASE_URL}/api/properties/{test_property_id}", json=update_payload)
        assert update_response.status_code == 200
        
        updated = update_response.json()
        assert updated["property_name"] == "TEST_Updated_Property"
        assert updated["current_estimated_value"] == 600000
        assert updated["bedrooms"] == 4
        
        # Verify with GET
        get_response = api_client.get(f"{BASE_URL}/api/properties/{test_property_id}")
        assert get_response.status_code == 200
        
        fetched = get_response.json()
        assert fetched["property_name"] == "TEST_Updated_Property"
        assert fetched["current_estimated_value"] == 600000
        print(f"✓ Update property and verify working")
    
    def test_delete_property_and_verify(self, api_client):
        """Delete property and verify it's gone"""
        # Create a property to delete
        payload = {
            "property_name": "TEST_Delete_Me",
            "address": "999 Delete St",
            "purchase_price": 100000,
            "current_estimated_value": 100000
        }
        create_response = api_client.post(f"{BASE_URL}/api/properties", json=payload)
        assert create_response.status_code == 200
        property_id = create_response.json()["property_id"]
        
        # Delete it
        delete_response = api_client.delete(f"{BASE_URL}/api/properties/{property_id}")
        assert delete_response.status_code == 200
        
        # Verify it's gone
        get_response = api_client.get(f"{BASE_URL}/api/properties/{property_id}")
        assert get_response.status_code == 404
        print(f"✓ Delete property and verify working")

# ==================== INCOME CRUD ====================

class TestIncome:
    """Income CRUD operations"""
    
    def test_create_income_and_verify(self, api_client, test_property_id):
        """Create income entry and verify via GET"""
        payload = {
            "property_id": test_property_id,
            "date": "2024-03-01",
            "amount": 2500.00,
            "income_type": "rent",
            "tenant_name": "John Doe",
            "notes": "Monthly rent payment"
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/income", json=payload)
        assert create_response.status_code == 200
        
        created = create_response.json()
        assert created["amount"] == 2500.00
        assert created["income_type"] == "rent"
        assert created["tenant_name"] == "John Doe"
        assert "income_id" in created
        
        income_id = created["income_id"]
        
        # Verify with GET list
        get_response = api_client.get(f"{BASE_URL}/api/income/{test_property_id}")
        assert get_response.status_code == 200
        
        income_list = get_response.json()
        assert isinstance(income_list, list)
        income_ids = [i["income_id"] for i in income_list]
        assert income_id in income_ids
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/income/{income_id}")
        print(f"✓ Income create and verify working - ID: {income_id}")
    
    def test_list_income_for_property(self, api_client, test_property_id):
        """List income entries for a property"""
        # Create test income
        payload = {
            "property_id": test_property_id,
            "date": "2024-04-01",
            "amount": 2600.00,
            "income_type": "rent"
        }
        create_response = api_client.post(f"{BASE_URL}/api/income", json=payload)
        assert create_response.status_code == 200
        income_id = create_response.json()["income_id"]
        
        # List income
        response = api_client.get(f"{BASE_URL}/api/income/{test_property_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/income/{income_id}")
        print(f"✓ List income working - Found {len(data)} entries")

# ==================== EXPENSE CRUD ====================

class TestExpenses:
    """Expense CRUD operations"""
    
    def test_create_expense_and_verify(self, api_client, test_property_id):
        """Create expense entry and verify via GET"""
        payload = {
            "property_id": test_property_id,
            "date": "2024-03-15",
            "amount": 350.00,
            "category": "repairs",
            "notes": "Fixed leaking tap",
            "recurring": False
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/expenses", json=payload)
        assert create_response.status_code == 200
        
        created = create_response.json()
        assert created["amount"] == 350.00
        assert created["category"] == "repairs"
        assert created["notes"] == "Fixed leaking tap"
        assert "expense_id" in created
        
        expense_id = created["expense_id"]
        
        # Verify with GET list
        get_response = api_client.get(f"{BASE_URL}/api/expenses/{test_property_id}")
        assert get_response.status_code == 200
        
        expense_list = get_response.json()
        assert isinstance(expense_list, list)
        expense_ids = [e["expense_id"] for e in expense_list]
        assert expense_id in expense_ids
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/expenses/{expense_id}")
        print(f"✓ Expense create and verify working - ID: {expense_id}")
    
    def test_list_expenses_for_property(self, api_client, test_property_id):
        """List expense entries for a property"""
        # Create test expense
        payload = {
            "property_id": test_property_id,
            "date": "2024-04-10",
            "amount": 150.00,
            "category": "maintenance"
        }
        create_response = api_client.post(f"{BASE_URL}/api/expenses", json=payload)
        assert create_response.status_code == 200
        expense_id = create_response.json()["expense_id"]
        
        # List expenses
        response = api_client.get(f"{BASE_URL}/api/expenses/{test_property_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/expenses/{expense_id}")
        print(f"✓ List expenses working - Found {len(data)} entries")

# ==================== DASHBOARD ====================

class TestDashboard:
    """Dashboard endpoint"""
    
    def test_dashboard_structure(self, api_client):
        """Test dashboard returns correct structure"""
        response = api_client.get(f"{BASE_URL}/api/dashboard")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check portfolio section
        assert "portfolio" in data
        portfolio = data["portfolio"]
        assert "total_properties" in portfolio
        assert "total_market_value" in portfolio
        assert "total_equity" in portfolio
        assert "net_yearly_cashflow" in portfolio
        assert "yearly_roi" in portfolio
        
        # Check property_metrics
        assert "property_metrics" in data
        assert isinstance(data["property_metrics"], list)
        
        # Check monthly_trend
        assert "monthly_trend" in data
        assert isinstance(data["monthly_trend"], list)
        
        # Check expense_by_category
        assert "expense_by_category" in data
        assert isinstance(data["expense_by_category"], dict)
        
        print(f"✓ Dashboard working - {portfolio['total_properties']} properties")

# ==================== REPORTS ====================

class TestReports:
    """Report generation endpoints"""
    
    def test_report_summary(self, api_client, test_property_id):
        """Test report summary endpoint"""
        response = api_client.get(f"{BASE_URL}/api/reports/summary/{test_property_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert "property" in data
        assert "year" in data
        assert "total_income" in data
        assert "total_expenses" in data
        assert "net_profit_loss" in data
        assert "expense_by_category" in data
        assert "income_entries" in data
        assert "expense_entries" in data
        
        assert data["property"]["property_id"] == test_property_id
        print(f"✓ Report summary working - Year: {data['year']}")
    
    def test_report_csv(self, api_client, test_property_id):
        """Test CSV report generation"""
        response = api_client.get(f"{BASE_URL}/api/reports/csv/{test_property_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert "filename" in data
        assert "content_base64" in data
        assert "content_type" in data
        assert data["content_type"] == "text/csv"
        assert ".csv" in data["filename"]
        
        # Verify base64 content is not empty
        assert len(data["content_base64"]) > 0
        print(f"✓ CSV report working - File: {data['filename']}")
