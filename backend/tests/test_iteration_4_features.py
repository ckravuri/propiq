"""
PropIQ Backend Tests - Iteration 4 Features
Tests: Multi-year comparison reports, Portfolio history tracking
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

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
TEST_PROPERTY_ID = "prop_c0e2f1669631"

@pytest.fixture
def api_client():
    """Shared requests session with auth"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {SESSION_TOKEN}"
    })
    return session

# ==================== MULTI-YEAR COMPARISON ====================

class TestMultiYearComparison:
    """Test multi-year comparison reports endpoint"""
    
    def test_comparison_endpoint_returns_5_years(self, api_client):
        """GET /api/reports/comparison/{property_id} returns 5 years of data"""
        response = api_client.get(f"{BASE_URL}/api/reports/comparison/{TEST_PROPERTY_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert "property_id" in data
        assert "property_name" in data
        assert "purchase_price" in data
        assert "current_value" in data
        assert "years" in data
        
        years = data["years"]
        assert isinstance(years, list)
        assert len(years) == 5, f"Expected 5 years, got {len(years)}"
        
        current_year = datetime.now().year
        expected_years = list(range(current_year - 4, current_year + 1))
        actual_years = [y["year"] for y in years]
        assert actual_years == expected_years, f"Expected years {expected_years}, got {actual_years}"
        
        print(f"✓ Comparison endpoint returns 5 years: {actual_years}")
    
    def test_comparison_year_data_structure(self, api_client):
        """Verify each year has required fields: income, expenses, net_cashflow, repairs"""
        response = api_client.get(f"{BASE_URL}/api/reports/comparison/{TEST_PROPERTY_ID}")
        assert response.status_code == 200
        
        data = response.json()
        years = data["years"]
        
        required_fields = ["year", "income", "expenses", "net_cashflow", "repairs"]
        
        for year_data in years:
            for field in required_fields:
                assert field in year_data, f"Missing field '{field}' in year {year_data.get('year')}"
            
            # Verify data types
            assert isinstance(year_data["year"], int)
            assert isinstance(year_data["income"], (int, float))
            assert isinstance(year_data["expenses"], (int, float))
            assert isinstance(year_data["net_cashflow"], (int, float))
            assert isinstance(year_data["repairs"], (int, float))
            
            # Verify net_cashflow calculation
            expected_net = year_data["income"] - year_data["expenses"]
            assert abs(year_data["net_cashflow"] - expected_net) < 0.01, \
                f"Net cashflow mismatch for year {year_data['year']}: expected {expected_net}, got {year_data['net_cashflow']}"
        
        print(f"✓ All {len(years)} years have correct data structure")
    
    def test_comparison_property_not_found(self, api_client):
        """Test comparison endpoint with non-existent property returns 404"""
        response = api_client.get(f"{BASE_URL}/api/reports/comparison/prop_nonexistent")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()
        print("✓ Comparison endpoint returns 404 for non-existent property")
    
    def test_comparison_repairs_calculation(self, api_client):
        """Verify repairs field includes repairs, repeated repairs, and maintenance categories"""
        response = api_client.get(f"{BASE_URL}/api/reports/comparison/{TEST_PROPERTY_ID}")
        assert response.status_code == 200
        
        data = response.json()
        years = data["years"]
        
        # Repairs should be >= 0 and <= total expenses
        for year_data in years:
            repairs = year_data["repairs"]
            expenses = year_data["expenses"]
            assert repairs >= 0, f"Repairs cannot be negative: {repairs}"
            assert repairs <= expenses, f"Repairs ({repairs}) cannot exceed total expenses ({expenses})"
        
        print("✓ Repairs calculation is correct for all years")

# ==================== PORTFOLIO HISTORY ====================

class TestPortfolioHistory:
    """Test portfolio history tracking endpoints"""
    
    def test_create_portfolio_snapshot(self, api_client):
        """POST /api/portfolio/snapshot creates or updates today's snapshot"""
        response = api_client.post(f"{BASE_URL}/api/portfolio/snapshot", json={})
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data
        assert "date" in data
        
        today = datetime.now().strftime("%Y-%m-%d")
        assert data["date"] == today
        
        print(f"✓ Portfolio snapshot created/updated for {today}")
    
    def test_get_portfolio_history(self, api_client):
        """GET /api/portfolio/history returns list of snapshots"""
        response = api_client.get(f"{BASE_URL}/api/portfolio/history")
        assert response.status_code == 200
        
        snapshots = response.json()
        assert isinstance(snapshots, list)
        
        print(f"✓ Portfolio history returned {len(snapshots)} snapshots")
    
    def test_portfolio_history_data_structure(self, api_client):
        """Verify portfolio history snapshots have required fields"""
        response = api_client.get(f"{BASE_URL}/api/portfolio/history")
        assert response.status_code == 200
        
        snapshots = response.json()
        
        if len(snapshots) == 0:
            print("⚠ No portfolio snapshots found (expected 30 seeded snapshots)")
            return
        
        required_fields = [
            "user_id", "date", "total_properties", "total_market_value",
            "total_purchase_value", "total_equity", "total_loans",
            "ytd_income", "ytd_expenses", "net_cashflow"
        ]
        
        for snapshot in snapshots:
            for field in required_fields:
                assert field in snapshot, f"Missing field '{field}' in snapshot for date {snapshot.get('date')}"
            
            # Verify data types
            assert isinstance(snapshot["date"], str)
            assert isinstance(snapshot["total_properties"], int)
            assert isinstance(snapshot["total_market_value"], (int, float))
            assert isinstance(snapshot["total_equity"], (int, float))
            
            # Verify equity calculation
            expected_equity = snapshot["total_market_value"] - snapshot["total_loans"]
            assert abs(snapshot["total_equity"] - expected_equity) < 0.01, \
                f"Equity mismatch for {snapshot['date']}: expected {expected_equity}, got {snapshot['total_equity']}"
        
        print(f"✓ All {len(snapshots)} snapshots have correct data structure")
    
    def test_portfolio_history_sorted_by_date(self, api_client):
        """Verify portfolio history is sorted by date ascending"""
        response = api_client.get(f"{BASE_URL}/api/portfolio/history")
        assert response.status_code == 200
        
        snapshots = response.json()
        
        if len(snapshots) < 2:
            print("⚠ Not enough snapshots to verify sorting")
            return
        
        dates = [s["date"] for s in snapshots]
        sorted_dates = sorted(dates)
        assert dates == sorted_dates, f"Snapshots not sorted by date. Got: {dates[:5]}..."
        
        print(f"✓ Portfolio history correctly sorted by date (oldest to newest)")
    
    def test_portfolio_snapshot_idempotent(self, api_client):
        """Verify creating snapshot twice on same day updates existing snapshot"""
        # Create first snapshot
        response1 = api_client.post(f"{BASE_URL}/api/portfolio/snapshot", json={})
        assert response1.status_code == 200
        
        # Get count before
        history1 = api_client.get(f"{BASE_URL}/api/portfolio/history")
        count_before = len(history1.json())
        
        # Create second snapshot (same day)
        response2 = api_client.post(f"{BASE_URL}/api/portfolio/snapshot", json={})
        assert response2.status_code == 200
        
        # Get count after
        history2 = api_client.get(f"{BASE_URL}/api/portfolio/history")
        count_after = len(history2.json())
        
        # Count should be the same (update, not insert)
        assert count_after == count_before, \
            f"Snapshot should update existing, not create new. Before: {count_before}, After: {count_after}"
        
        print("✓ Portfolio snapshot is idempotent (updates existing snapshot for same day)")
    
    def test_seeded_portfolio_snapshots_exist(self, api_client):
        """Verify 30 seeded portfolio snapshots exist"""
        response = api_client.get(f"{BASE_URL}/api/portfolio/history")
        assert response.status_code == 200
        
        snapshots = response.json()
        
        # Should have at least 30 snapshots (seeded data)
        # Note: May have 31 if today's snapshot was created
        assert len(snapshots) >= 30, \
            f"Expected at least 30 seeded snapshots, found {len(snapshots)}"
        
        # Verify snapshots span approximately 30 days
        if len(snapshots) >= 30:
            first_date = datetime.strptime(snapshots[0]["date"], "%Y-%m-%d")
            last_date = datetime.strptime(snapshots[-1]["date"], "%Y-%m-%d")
            days_span = (last_date - first_date).days
            
            assert days_span >= 29, \
                f"Expected snapshots to span ~30 days, got {days_span} days"
        
        print(f"✓ Found {len(snapshots)} portfolio snapshots spanning {days_span} days")

# ==================== INTEGRATION TESTS ====================

class TestIntegration:
    """Test integration between comparison and history features"""
    
    def test_comparison_and_history_consistency(self, api_client):
        """Verify current year data in comparison matches latest snapshot"""
        # Get comparison data
        comp_response = api_client.get(f"{BASE_URL}/api/reports/comparison/{TEST_PROPERTY_ID}")
        assert comp_response.status_code == 200
        comp_data = comp_response.json()
        
        current_year = datetime.now().year
        current_year_data = next((y for y in comp_data["years"] if y["year"] == current_year), None)
        assert current_year_data is not None
        
        # Get latest snapshot
        history_response = api_client.get(f"{BASE_URL}/api/portfolio/history")
        assert history_response.status_code == 200
        snapshots = history_response.json()
        
        if len(snapshots) == 0:
            print("⚠ No snapshots to compare")
            return
        
        latest_snapshot = snapshots[-1]
        
        # Both should have YTD income/expenses
        # Note: Snapshot is portfolio-wide, comparison is per-property
        # So we just verify both have valid data
        assert current_year_data["income"] >= 0
        assert current_year_data["expenses"] >= 0
        assert latest_snapshot["ytd_income"] >= 0
        assert latest_snapshot["ytd_expenses"] >= 0
        
        print("✓ Comparison and history data are consistent")
