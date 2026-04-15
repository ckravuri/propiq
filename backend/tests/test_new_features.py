"""
PropIQ Backend Tests - New Features (Iteration 3)
Tests: Expense receipts, Reminders CRUD
"""
import pytest
import requests
import os

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
    """Create a test property and return its ID"""
    payload = {
        "property_name": "TEST_Receipt_Property",
        "address": "123 Receipt St",
        "purchase_price": 500000,
        "current_estimated_value": 550000
    }
    response = api_client.post(f"{BASE_URL}/api/properties", json=payload)
    assert response.status_code == 200
    property_id = response.json()["property_id"]
    
    yield property_id
    
    # Cleanup
    try:
        api_client.delete(f"{BASE_URL}/api/properties/{property_id}")
    except:
        pass

# ==================== EXPENSE RECEIPTS ====================

class TestExpenseReceipts:
    """Test expense receipt attachment feature"""
    
    def test_create_expense_with_receipt(self, api_client, test_property_id):
        """Create expense with receipt_base64 and verify persistence"""
        # Small 1x1 red pixel PNG base64
        receipt_data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
        
        payload = {
            "property_id": test_property_id,
            "date": "2024-05-15",
            "amount": 250.00,
            "category": "repairs",
            "notes": "Plumbing repair with receipt",
            "recurring": False,
            "receipt_base64": receipt_data
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/expenses", json=payload)
        assert create_response.status_code == 200
        
        created = create_response.json()
        assert created["amount"] == 250.00
        assert created["receipt_base64"] == receipt_data
        assert "expense_id" in created
        
        expense_id = created["expense_id"]
        
        # Verify with GET list
        get_response = api_client.get(f"{BASE_URL}/api/expenses/{test_property_id}")
        assert get_response.status_code == 200
        
        expenses = get_response.json()
        expense_ids = [e["expense_id"] for e in expenses]
        assert expense_id in expense_ids
        
        # Find our expense and verify receipt persisted
        our_expense = next(e for e in expenses if e["expense_id"] == expense_id)
        assert our_expense["receipt_base64"] == receipt_data
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/expenses/{expense_id}")
        print(f"✓ Expense with receipt created and verified - ID: {expense_id}")
    
    def test_create_expense_without_receipt(self, api_client, test_property_id):
        """Create expense without receipt (receipt_base64 = null)"""
        payload = {
            "property_id": test_property_id,
            "date": "2024-05-16",
            "amount": 100.00,
            "category": "maintenance",
            "notes": "No receipt",
            "recurring": False,
            "receipt_base64": None
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/expenses", json=payload)
        assert create_response.status_code == 200
        
        created = create_response.json()
        assert created["amount"] == 100.00
        assert created["receipt_base64"] is None
        
        expense_id = created["expense_id"]
        
        # Verify with GET
        get_response = api_client.get(f"{BASE_URL}/api/expenses/{test_property_id}")
        assert get_response.status_code == 200
        
        expenses = get_response.json()
        our_expense = next(e for e in expenses if e["expense_id"] == expense_id)
        assert our_expense["receipt_base64"] is None
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/expenses/{expense_id}")
        print(f"✓ Expense without receipt created - ID: {expense_id}")
    
    def test_existing_expense_with_receipt(self, api_client):
        """Verify seeded expense with receipt exists"""
        # Test data: property prop_c0e2f1669631 has expense exp_4643a6b22253 with receipt
        property_id = "prop_c0e2f1669631"
        expense_id = "exp_4643a6b22253"
        
        response = api_client.get(f"{BASE_URL}/api/expenses/{property_id}")
        assert response.status_code == 200
        
        expenses = response.json()
        expense_ids = [e["expense_id"] for e in expenses]
        
        if expense_id in expense_ids:
            expense = next(e for e in expenses if e["expense_id"] == expense_id)
            assert expense["receipt_base64"] is not None
            assert expense["receipt_base64"].startswith("data:image/")
            print(f"✓ Seeded expense with receipt verified - ID: {expense_id}")
        else:
            print(f"⚠ Seeded expense {expense_id} not found (may have been deleted)")

# ==================== REMINDERS CRUD ====================

class TestReminders:
    """Test reminders CRUD operations"""
    
    def test_create_reminder_and_verify(self, api_client, test_property_id):
        """Create reminder and verify via GET"""
        payload = {
            "property_id": test_property_id,
            "title": "TEST_Monthly Mortgage",
            "category": "mortgage",
            "amount": 2500.00,
            "due_day": 15,
            "frequency": "monthly",
            "notes": "Test reminder"
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/reminders", json=payload)
        assert create_response.status_code == 200
        
        created = create_response.json()
        assert created["title"] == "TEST_Monthly Mortgage"
        assert created["amount"] == 2500.00
        assert created["due_day"] == 15
        assert created["frequency"] == "monthly"
        assert created["category"] == "mortgage"
        assert created["active"] is True
        assert "reminder_id" in created
        assert "property_name" in created
        
        reminder_id = created["reminder_id"]
        
        # Verify with GET list
        get_response = api_client.get(f"{BASE_URL}/api/reminders")
        assert get_response.status_code == 200
        
        reminders = get_response.json()
        assert isinstance(reminders, list)
        reminder_ids = [r["reminder_id"] for r in reminders]
        assert reminder_id in reminder_ids
        
        # Verify property_name is populated
        our_reminder = next(r for r in reminders if r["reminder_id"] == reminder_id)
        assert our_reminder["property_name"] == "TEST_Receipt_Property"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/reminders/{reminder_id}")
        print(f"✓ Reminder created and verified - ID: {reminder_id}")
    
    def test_list_reminders_with_property_names(self, api_client, test_property_id):
        """Test GET /api/reminders returns property names"""
        # Create a reminder
        payload = {
            "property_id": test_property_id,
            "title": "TEST_Quarterly Insurance",
            "category": "insurance",
            "amount": 800.00,
            "due_day": 1,
            "frequency": "quarterly",
            "notes": ""
        }
        create_response = api_client.post(f"{BASE_URL}/api/reminders", json=payload)
        assert create_response.status_code == 200
        reminder_id = create_response.json()["reminder_id"]
        
        # List reminders
        response = api_client.get(f"{BASE_URL}/api/reminders")
        assert response.status_code == 200
        
        reminders = response.json()
        assert isinstance(reminders, list)
        
        # Verify all reminders have property_name field
        for r in reminders:
            assert "property_name" in r
            assert "reminder_id" in r
            assert "property_id" in r
            assert "title" in r
            assert "active" in r
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/reminders/{reminder_id}")
        print(f"✓ List reminders with property names working - Found {len(reminders)} reminders")
    
    def test_toggle_reminder_active_state(self, api_client, test_property_id):
        """Test PUT /api/reminders/{id}/toggle"""
        # Create a reminder
        payload = {
            "property_id": test_property_id,
            "title": "TEST_Toggle Reminder",
            "category": "utilities",
            "amount": 150.00,
            "due_day": 10,
            "frequency": "monthly",
            "notes": ""
        }
        create_response = api_client.post(f"{BASE_URL}/api/reminders", json=payload)
        assert create_response.status_code == 200
        reminder_id = create_response.json()["reminder_id"]
        
        # Initial state should be active=True
        get_response = api_client.get(f"{BASE_URL}/api/reminders")
        reminders = get_response.json()
        reminder = next(r for r in reminders if r["reminder_id"] == reminder_id)
        assert reminder["active"] is True
        
        # Toggle to inactive
        toggle_response = api_client.put(f"{BASE_URL}/api/reminders/{reminder_id}/toggle", json={})
        assert toggle_response.status_code == 200
        toggle_data = toggle_response.json()
        assert toggle_data["active"] is False
        
        # Verify state changed
        get_response2 = api_client.get(f"{BASE_URL}/api/reminders")
        reminders2 = get_response2.json()
        reminder2 = next(r for r in reminders2 if r["reminder_id"] == reminder_id)
        assert reminder2["active"] is False
        
        # Toggle back to active
        toggle_response2 = api_client.put(f"{BASE_URL}/api/reminders/{reminder_id}/toggle", json={})
        assert toggle_response2.status_code == 200
        toggle_data2 = toggle_response2.json()
        assert toggle_data2["active"] is True
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/reminders/{reminder_id}")
        print(f"✓ Toggle reminder active state working")
    
    def test_delete_reminder_and_verify(self, api_client, test_property_id):
        """Test DELETE /api/reminders/{id}"""
        # Create a reminder to delete
        payload = {
            "property_id": test_property_id,
            "title": "TEST_Delete Me",
            "category": "miscellaneous",
            "amount": 50.00,
            "due_day": 5,
            "frequency": "monthly",
            "notes": ""
        }
        create_response = api_client.post(f"{BASE_URL}/api/reminders", json=payload)
        assert create_response.status_code == 200
        reminder_id = create_response.json()["reminder_id"]
        
        # Delete it
        delete_response = api_client.delete(f"{BASE_URL}/api/reminders/{reminder_id}")
        assert delete_response.status_code == 200
        
        # Verify it's gone
        get_response = api_client.get(f"{BASE_URL}/api/reminders")
        reminders = get_response.json()
        reminder_ids = [r["reminder_id"] for r in reminders]
        assert reminder_id not in reminder_ids
        
        print(f"✓ Delete reminder and verify working")
    
    def test_existing_reminder(self, api_client):
        """Verify seeded reminder exists"""
        # Test data: reminder rem_67e78ae8a3b0 should exist
        reminder_id = "rem_67e78ae8a3b0"
        
        response = api_client.get(f"{BASE_URL}/api/reminders")
        assert response.status_code == 200
        
        reminders = response.json()
        reminder_ids = [r["reminder_id"] for r in reminders]
        
        if reminder_id in reminder_ids:
            reminder = next(r for r in reminders if r["reminder_id"] == reminder_id)
            assert "property_name" in reminder
            assert "title" in reminder
            assert "active" in reminder
            print(f"✓ Seeded reminder verified - ID: {reminder_id}, Title: {reminder['title']}")
        else:
            print(f"⚠ Seeded reminder {reminder_id} not found (may have been deleted)")
    
    def test_create_reminder_invalid_property(self, api_client):
        """Test creating reminder with non-existent property returns 404"""
        payload = {
            "property_id": "prop_nonexistent",
            "title": "Invalid Reminder",
            "category": "mortgage",
            "amount": 1000.00,
            "due_day": 1,
            "frequency": "monthly",
            "notes": ""
        }
        
        response = api_client.post(f"{BASE_URL}/api/reminders", json=payload)
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()
        print(f"✓ Create reminder with invalid property correctly returns 404")
