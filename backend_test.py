#!/usr/bin/env python3
"""
PropIQ Backend API Testing - Reports Endpoints
Testing the Reports endpoints as specified in the review request.
"""

import requests
import json
import base64
import csv
import io
import sys
from typing import Dict, Any, Optional

# Configuration
BACKEND_URL = "https://propiq-test.preview.emergentagent.com"
AUTH_HEADER = {"Authorization": "Bearer test_session_propiq_123"}
TEST_YEAR = 2026

class PropIQTester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.headers = AUTH_HEADER
        self.test_results = []
        self.property_id = None
        
    def log_result(self, test_name: str, success: bool, message: str, details: Dict = None):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "details": details or {}
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name} - {message}")
        if details and not success:
            print(f"   Details: {details}")
    
    def test_health_endpoint(self):
        """Test the health endpoint"""
        try:
            response = requests.get(f"{self.base_url}/api/health", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "healthy":
                    self.log_result("Health Endpoint", True, "Health endpoint working correctly")
                    return True
                else:
                    self.log_result("Health Endpoint", False, f"Unexpected response: {data}")
                    return False
            else:
                self.log_result("Health Endpoint", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_result("Health Endpoint", False, f"Request failed: {str(e)}")
            return False
    
    def get_test_property_id(self):
        """Get a valid property_id from the properties list"""
        try:
            response = requests.get(f"{self.base_url}/api/properties", headers=self.headers, timeout=10)
            
            if response.status_code == 200:
                properties = response.json()
                if properties and len(properties) > 0:
                    self.property_id = properties[0]["property_id"]
                    self.log_result("Get Properties", True, f"Found {len(properties)} properties, using property_id: {self.property_id}")
                    return True
                else:
                    self.log_result("Get Properties", False, "No properties found in account")
                    return False
            elif response.status_code == 401:
                self.log_result("Get Properties", False, "Authentication failed - invalid test token")
                return False
            else:
                self.log_result("Get Properties", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_result("Get Properties", False, f"Request failed: {str(e)}")
            return False
    
    def test_csv_report_endpoint(self):
        """Test CSV report endpoint"""
        if not self.property_id:
            self.log_result("CSV Report", False, "No property_id available for testing")
            return False
            
        try:
            url = f"{self.base_url}/api/reports/csv/{self.property_id}?year={TEST_YEAR}"
            response = requests.get(url, headers=self.headers, timeout=15)
            
            if response.status_code == 200:
                data = response.json()
                
                # Validate response structure
                required_fields = ["filename", "content_base64", "content_type"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_result("CSV Report", False, f"Missing required fields: {missing_fields}")
                    return False
                
                # Validate filename (no special chars)
                filename = data["filename"]
                if not filename or not filename.endswith(".csv"):
                    self.log_result("CSV Report", False, f"Invalid filename: {filename}")
                    return False
                
                # Validate content_type
                if data["content_type"] != "text/csv":
                    self.log_result("CSV Report", False, f"Invalid content_type: {data['content_type']}")
                    return False
                
                # Validate base64 content
                try:
                    csv_content = base64.b64decode(data["content_base64"]).decode('utf-8')
                    
                    # Try to parse as CSV
                    csv_reader = csv.reader(io.StringIO(csv_content))
                    rows = list(csv_reader)
                    
                    if len(rows) < 5:  # Should have header, property info, financial summary, etc.
                        self.log_result("CSV Report", False, f"CSV content too short: {len(rows)} rows")
                        return False
                    
                    # Check for expected content
                    csv_text = csv_content.lower()
                    expected_content = ["propiq report", "property summary", "financial summary"]
                    missing_content = [content for content in expected_content if content not in csv_text]
                    
                    if missing_content:
                        self.log_result("CSV Report", False, f"Missing expected CSV content: {missing_content}")
                        return False
                    
                    self.log_result("CSV Report", True, f"CSV report generated successfully. Filename: {filename}, Rows: {len(rows)}")
                    return True
                    
                except Exception as decode_error:
                    self.log_result("CSV Report", False, f"Failed to decode base64 content: {str(decode_error)}")
                    return False
                    
            elif response.status_code == 404:
                self.log_result("CSV Report", False, f"Property not found: {self.property_id}")
                return False
            else:
                self.log_result("CSV Report", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_result("CSV Report", False, f"Request failed: {str(e)}")
            return False
    
    def test_csv_report_404(self):
        """Test CSV report endpoint with non-existent property_id"""
        try:
            fake_property_id = "prop_nonexistent123"
            url = f"{self.base_url}/api/reports/csv/{fake_property_id}?year={TEST_YEAR}"
            response = requests.get(url, headers=self.headers, timeout=10)
            
            if response.status_code == 404:
                self.log_result("CSV Report 404", True, "Correctly returns 404 for non-existent property")
                return True
            else:
                self.log_result("CSV Report 404", False, f"Expected 404, got HTTP {response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("CSV Report 404", False, f"Request failed: {str(e)}")
            return False
    
    def test_report_summary_endpoint(self):
        """Test report summary endpoint"""
        if not self.property_id:
            self.log_result("Report Summary", False, "No property_id available for testing")
            return False
            
        try:
            url = f"{self.base_url}/api/reports/summary/{self.property_id}?year={TEST_YEAR}"
            response = requests.get(url, headers=self.headers, timeout=15)
            
            if response.status_code == 200:
                data = response.json()
                
                # Validate required fields
                required_fields = [
                    "property", "year", "total_income", "total_expenses", 
                    "net_profit_loss", "capital_growth_pct", "expense_by_category",
                    "income_entries", "expense_entries"
                ]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_result("Report Summary", False, f"Missing required fields: {missing_fields}")
                    return False
                
                # Validate data types
                if not isinstance(data["property"], dict):
                    self.log_result("Report Summary", False, "Property field should be a dict")
                    return False
                
                if data["year"] != TEST_YEAR:
                    self.log_result("Report Summary", False, f"Year mismatch: expected {TEST_YEAR}, got {data['year']}")
                    return False
                
                numeric_fields = ["total_income", "total_expenses", "net_profit_loss", "capital_growth_pct"]
                for field in numeric_fields:
                    if not isinstance(data[field], (int, float)):
                        self.log_result("Report Summary", False, f"Field {field} should be numeric, got {type(data[field])}")
                        return False
                
                if not isinstance(data["expense_by_category"], dict):
                    self.log_result("Report Summary", False, "expense_by_category should be a dict")
                    return False
                
                if not isinstance(data["income_entries"], list):
                    self.log_result("Report Summary", False, "income_entries should be a list")
                    return False
                
                if not isinstance(data["expense_entries"], list):
                    self.log_result("Report Summary", False, "expense_entries should be a list")
                    return False
                
                self.log_result("Report Summary", True, 
                    f"Report summary working correctly. Income: ${data['total_income']}, "
                    f"Expenses: ${data['total_expenses']}, Net: ${data['net_profit_loss']}")
                return True
                
            elif response.status_code == 404:
                self.log_result("Report Summary", False, f"Property not found: {self.property_id}")
                return False
            else:
                self.log_result("Report Summary", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_result("Report Summary", False, f"Request failed: {str(e)}")
            return False
    
    def test_year_comparison_endpoint(self):
        """Test year comparison endpoint"""
        if not self.property_id:
            self.log_result("Year Comparison", False, "No property_id available for testing")
            return False
            
        try:
            url = f"{self.base_url}/api/reports/comparison/{self.property_id}"
            response = requests.get(url, headers=self.headers, timeout=15)
            
            if response.status_code == 200:
                data = response.json()
                
                # Validate required fields
                required_fields = ["property_id", "property_name", "purchase_price", "current_value", "years"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_result("Year Comparison", False, f"Missing required fields: {missing_fields}")
                    return False
                
                # Validate data types
                if data["property_id"] != self.property_id:
                    self.log_result("Year Comparison", False, f"Property ID mismatch: expected {self.property_id}, got {data['property_id']}")
                    return False
                
                if not isinstance(data["property_name"], str):
                    self.log_result("Year Comparison", False, "property_name should be a string")
                    return False
                
                numeric_fields = ["purchase_price", "current_value"]
                for field in numeric_fields:
                    if not isinstance(data[field], (int, float)):
                        self.log_result("Year Comparison", False, f"Field {field} should be numeric, got {type(data[field])}")
                        return False
                
                if not isinstance(data["years"], list):
                    self.log_result("Year Comparison", False, "years should be a list")
                    return False
                
                # Validate years array structure
                if len(data["years"]) > 0:
                    year_entry = data["years"][0]
                    year_required_fields = ["year", "income", "expenses", "net_cashflow", "repairs", "expense_categories", "entry_count"]
                    year_missing_fields = [field for field in year_required_fields if field not in year_entry]
                    
                    if year_missing_fields:
                        self.log_result("Year Comparison", False, f"Missing fields in year entry: {year_missing_fields}")
                        return False
                
                self.log_result("Year Comparison", True, 
                    f"Year comparison working correctly. Property: {data['property_name']}, "
                    f"Years data: {len(data['years'])} years")
                return True
                
            elif response.status_code == 404:
                self.log_result("Year Comparison", False, f"Property not found: {self.property_id}")
                return False
            else:
                self.log_result("Year Comparison", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_result("Year Comparison", False, f"Request failed: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all tests in sequence"""
        print(f"🚀 Starting PropIQ Backend API Tests")
        print(f"Backend URL: {self.base_url}")
        print(f"Test Year: {TEST_YEAR}")
        print("=" * 60)
        
        # Test health endpoint first
        health_ok = self.test_health_endpoint()
        
        # Get property ID for testing
        properties_ok = self.get_test_property_id()
        
        # Run reports tests if we have a property
        if properties_ok:
            csv_ok = self.test_csv_report_endpoint()
            csv_404_ok = self.test_csv_report_404()
            summary_ok = self.test_report_summary_endpoint()
            comparison_ok = self.test_year_comparison_endpoint()
        else:
            print("⚠️  Skipping reports tests - no properties available")
            csv_ok = csv_404_ok = summary_ok = comparison_ok = False
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.test_results if result["success"])
        total = len(self.test_results)
        
        for result in self.test_results:
            status = "✅" if result["success"] else "❌"
            print(f"{status} {result['test']}: {result['message']}")
        
        print(f"\n🎯 Results: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 ALL TESTS PASSED!")
            return True
        else:
            print("💥 SOME TESTS FAILED!")
            return False

def main():
    """Main test runner"""
    tester = PropIQTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()