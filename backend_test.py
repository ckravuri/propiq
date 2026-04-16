#!/usr/bin/env python3
"""
PropIQ Backend API Testing Script
Tests the property lookup endpoint and existing endpoints
"""

import requests
import json
import sys
from typing import Dict, Any

# Backend URL from frontend .env
BASE_URL = "https://propiq-test.preview.emergentagent.com/api"

# Test auth header as specified in review request
TEST_AUTH_HEADER = {"Authorization": "Bearer test_session_propiq_123"}

def test_health_endpoint():
    """Test the health endpoint"""
    print("🔍 Testing health endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=10)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"   Response: {data}")
            if data.get("status") == "healthy":
                print("   ✅ Health endpoint working correctly")
                return True
            else:
                print("   ❌ Health endpoint returned unexpected response")
                return False
        else:
            print(f"   ❌ Health endpoint failed with status {response.status_code}")
            return False
    except Exception as e:
        print(f"   ❌ Health endpoint error: {e}")
        return False

def test_address_search_endpoint():
    """Test the address search endpoint"""
    print("\n🔍 Testing address search endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/address/search", 
                              params={"q": "parramatta"}, 
                              timeout=10)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"   Response type: {type(data)}")
            print(f"   Number of results: {len(data) if isinstance(data, list) else 'Not a list'}")
            
            if isinstance(data, list) and len(data) > 0:
                print(f"   Sample result: {data[0] if data else 'No results'}")
                print("   ✅ Address search endpoint working correctly")
                return True
            else:
                print("   ⚠️  Address search returned empty results (may be normal)")
                return True  # Empty results can be normal
        else:
            print(f"   ❌ Address search failed with status {response.status_code}")
            return False
    except Exception as e:
        print(f"   ❌ Address search error: {e}")
        return False

def test_property_lookup_full_params():
    """Test property lookup with full parameters"""
    print("\n🔍 Testing property lookup with full parameters...")
    try:
        params = {
            "street": "10 George Street",
            "suburb": "Parramatta", 
            "state": "NSW",
            "postcode": "2150"
        }
        
        response = requests.get(f"{BASE_URL}/property/lookup", 
                              params=params, 
                              timeout=15)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"   Response: {json.dumps(data, indent=2)}")
            
            # Check required fields
            required_fields = ["bedrooms", "bathrooms", "parking", "land_size", "property_type", "source"]
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                print(f"   ❌ Missing required fields: {missing_fields}")
                return False
            
            # Validate field values
            bedrooms = data.get("bedrooms")
            bathrooms = data.get("bathrooms")
            source = data.get("source")
            
            if not isinstance(bedrooms, int) or not (1 <= bedrooms <= 6):
                print(f"   ❌ Invalid bedrooms value: {bedrooms} (should be 1-6)")
                return False
                
            if not isinstance(bathrooms, int) or not (1 <= bathrooms <= 6):
                print(f"   ❌ Invalid bathrooms value: {bathrooms} (should be 1-6)")
                return False
                
            if source not in ["domain.com.au", "ai_estimate", "default"]:
                print(f"   ❌ Invalid source value: {source}")
                return False
            
            print("   ✅ Property lookup with full parameters working correctly")
            return True
        else:
            print(f"   ❌ Property lookup failed with status {response.status_code}")
            try:
                error_data = response.json()
                print(f"   Error details: {error_data}")
            except:
                print(f"   Error text: {response.text}")
            return False
    except Exception as e:
        print(f"   ❌ Property lookup error: {e}")
        return False

def test_property_lookup_minimal_params():
    """Test property lookup with minimal parameters"""
    print("\n🔍 Testing property lookup with minimal parameters...")
    try:
        params = {
            "suburb": "Sydney",
            "state": "NSW", 
            "postcode": "2000"
        }
        
        response = requests.get(f"{BASE_URL}/property/lookup", 
                              params=params, 
                              timeout=15)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"   Response: {json.dumps(data, indent=2)}")
            
            # Check required fields
            required_fields = ["bedrooms", "bathrooms", "parking", "land_size", "property_type", "source"]
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                print(f"   ❌ Missing required fields: {missing_fields}")
                return False
            
            print("   ✅ Property lookup with minimal parameters working correctly")
            return True
        else:
            print(f"   ❌ Property lookup failed with status {response.status_code}")
            try:
                error_data = response.json()
                print(f"   Error details: {error_data}")
            except:
                print(f"   Error text: {response.text}")
            return False
    except Exception as e:
        print(f"   ❌ Property lookup error: {e}")
        return False

def test_property_lookup_different_suburbs():
    """Test property lookup with different suburbs"""
    print("\n🔍 Testing property lookup with different suburbs...")
    suburbs = [
        {"suburb": "Melbourne", "state": "VIC", "postcode": "3000"},
        {"suburb": "Brisbane", "state": "QLD", "postcode": "4000"}
    ]
    
    all_passed = True
    for params in suburbs:
        print(f"   Testing {params['suburb']}...")
        try:
            response = requests.get(f"{BASE_URL}/property/lookup", 
                                  params=params, 
                                  timeout=15)
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["bedrooms", "bathrooms", "parking", "land_size", "property_type", "source"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    print(f"     ❌ {params['suburb']}: Missing fields {missing_fields}")
                    all_passed = False
                else:
                    print(f"     ✅ {params['suburb']}: Valid response")
            else:
                print(f"     ❌ {params['suburb']}: Failed with status {response.status_code}")
                all_passed = False
        except Exception as e:
            print(f"     ❌ {params['suburb']}: Error {e}")
            all_passed = False
    
    if all_passed:
        print("   ✅ Property lookup with different suburbs working correctly")
    else:
        print("   ❌ Some suburb tests failed")
    
    return all_passed

def test_property_lookup_no_params():
    """Test property lookup with no parameters (should return 400)"""
    print("\n🔍 Testing property lookup with no parameters...")
    try:
        response = requests.get(f"{BASE_URL}/property/lookup", timeout=10)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 400:
            print("   ✅ Property lookup correctly returns 400 for no parameters")
            return True
        else:
            print(f"   ❌ Expected 400 status, got {response.status_code}")
            try:
                data = response.json()
                print(f"   Response: {data}")
            except:
                print(f"   Response text: {response.text}")
            return False
    except Exception as e:
        print(f"   ❌ Property lookup error: {e}")
        return False

def main():
    """Run all tests"""
    print("🚀 Starting PropIQ Backend API Tests")
    print(f"📍 Testing against: {BASE_URL}")
    print("=" * 60)
    
    tests = [
        ("Health Endpoint", test_health_endpoint),
        ("Address Search", test_address_search_endpoint),
        ("Property Lookup - Full Params", test_property_lookup_full_params),
        ("Property Lookup - Minimal Params", test_property_lookup_minimal_params),
        ("Property Lookup - Different Suburbs", test_property_lookup_different_suburbs),
        ("Property Lookup - No Params", test_property_lookup_no_params),
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"   ❌ Test {test_name} crashed: {e}")
            results.append((test_name, False))
    
    print("\n" + "=" * 60)
    print("📊 TEST SUMMARY")
    print("=" * 60)
    
    passed = 0
    failed = 0
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
        if result:
            passed += 1
        else:
            failed += 1
    
    print(f"\nTotal: {passed + failed} tests")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    
    if failed == 0:
        print("\n🎉 All tests passed!")
        return 0
    else:
        print(f"\n⚠️  {failed} test(s) failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())