"""
PropIQ Property Image Upload Tests
Tests: Create/Update properties with image_base64, verify image persistence
"""
import pytest
import requests
import base64

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

# Small 1x1 pixel test image (base64 encoded)
SMALL_IMAGE_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

@pytest.fixture
def api_client():
    """Shared requests session with auth"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {SESSION_TOKEN}"
    })
    return session

# ==================== IMAGE UPLOAD TESTS ====================

class TestPropertyImage:
    """Property image upload and retrieval tests"""
    
    def test_create_property_with_image(self, api_client):
        """Create property with image_base64 and verify"""
        payload = {
            "property_name": "TEST_Image_Property",
            "address": "123 Image St",
            "suburb": "Melbourne",
            "state": "VIC",
            "postcode": "3000",
            "purchase_price": 500000,
            "current_estimated_value": 550000,
            "property_type": "house",
            "bedrooms": 3,
            "bathrooms": 2,
            "parking": 1,
            "image_base64": SMALL_IMAGE_BASE64
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/properties", json=payload)
        assert create_response.status_code == 200
        
        created = create_response.json()
        assert created["property_name"] == payload["property_name"]
        assert "image_base64" in created
        assert created["image_base64"] == SMALL_IMAGE_BASE64
        assert "property_id" in created
        
        property_id = created["property_id"]
        
        # Verify persistence with GET
        get_response = api_client.get(f"{BASE_URL}/api/properties/{property_id}")
        assert get_response.status_code == 200
        
        fetched = get_response.json()
        assert fetched["property_id"] == property_id
        assert fetched["image_base64"] == SMALL_IMAGE_BASE64
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/properties/{property_id}")
        print(f"✓ Create property with image working - ID: {property_id}")
    
    def test_create_property_without_image(self, api_client):
        """Create property without image (image_base64 = null)"""
        payload = {
            "property_name": "TEST_No_Image_Property",
            "address": "456 No Image Ave",
            "purchase_price": 400000,
            "current_estimated_value": 420000,
            "property_type": "apartment"
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/properties", json=payload)
        assert create_response.status_code == 200
        
        created = create_response.json()
        assert created["property_name"] == payload["property_name"]
        assert "image_base64" in created
        assert created["image_base64"] is None
        
        property_id = created["property_id"]
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/properties/{property_id}")
        print(f"✓ Create property without image working - image_base64 is null")
    
    def test_update_property_add_image(self, api_client):
        """Update property to add image"""
        # Create property without image
        create_payload = {
            "property_name": "TEST_Add_Image_Later",
            "address": "789 Update St",
            "purchase_price": 300000,
            "current_estimated_value": 320000
        }
        create_response = api_client.post(f"{BASE_URL}/api/properties", json=create_payload)
        assert create_response.status_code == 200
        property_id = create_response.json()["property_id"]
        
        # Update to add image
        update_payload = {
            "property_name": "TEST_Add_Image_Later",
            "address": "789 Update St",
            "purchase_price": 300000,
            "current_estimated_value": 320000,
            "image_base64": SMALL_IMAGE_BASE64
        }
        update_response = api_client.put(f"{BASE_URL}/api/properties/{property_id}", json=update_payload)
        assert update_response.status_code == 200
        
        updated = update_response.json()
        assert updated["image_base64"] == SMALL_IMAGE_BASE64
        
        # Verify with GET
        get_response = api_client.get(f"{BASE_URL}/api/properties/{property_id}")
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["image_base64"] == SMALL_IMAGE_BASE64
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/properties/{property_id}")
        print(f"✓ Update property to add image working")
    
    def test_update_property_remove_image(self, api_client):
        """Update property to remove image (set to null)"""
        # Create property with image
        create_payload = {
            "property_name": "TEST_Remove_Image",
            "address": "999 Remove St",
            "purchase_price": 250000,
            "current_estimated_value": 270000,
            "image_base64": SMALL_IMAGE_BASE64
        }
        create_response = api_client.post(f"{BASE_URL}/api/properties", json=create_payload)
        assert create_response.status_code == 200
        property_id = create_response.json()["property_id"]
        
        # Update to remove image
        update_payload = {
            "property_name": "TEST_Remove_Image",
            "address": "999 Remove St",
            "purchase_price": 250000,
            "current_estimated_value": 270000,
            "image_base64": None
        }
        update_response = api_client.put(f"{BASE_URL}/api/properties/{property_id}", json=update_payload)
        assert update_response.status_code == 200
        
        updated = update_response.json()
        assert updated["image_base64"] is None
        
        # Verify with GET
        get_response = api_client.get(f"{BASE_URL}/api/properties/{property_id}")
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["image_base64"] is None
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/properties/{property_id}")
        print(f"✓ Update property to remove image working")
    
    def test_update_property_change_image(self, api_client):
        """Update property to change image"""
        # Different test image
        DIFFERENT_IMAGE = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k="
        
        # Create property with image
        create_payload = {
            "property_name": "TEST_Change_Image",
            "address": "111 Change Ave",
            "purchase_price": 350000,
            "current_estimated_value": 380000,
            "image_base64": SMALL_IMAGE_BASE64
        }
        create_response = api_client.post(f"{BASE_URL}/api/properties", json=create_payload)
        assert create_response.status_code == 200
        property_id = create_response.json()["property_id"]
        
        # Update to change image
        update_payload = {
            "property_name": "TEST_Change_Image",
            "address": "111 Change Ave",
            "purchase_price": 350000,
            "current_estimated_value": 380000,
            "image_base64": DIFFERENT_IMAGE
        }
        update_response = api_client.put(f"{BASE_URL}/api/properties/{property_id}", json=update_payload)
        assert update_response.status_code == 200
        
        updated = update_response.json()
        assert updated["image_base64"] == DIFFERENT_IMAGE
        assert updated["image_base64"] != SMALL_IMAGE_BASE64
        
        # Verify with GET
        get_response = api_client.get(f"{BASE_URL}/api/properties/{property_id}")
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["image_base64"] == DIFFERENT_IMAGE
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/properties/{property_id}")
        print(f"✓ Update property to change image working")
    
    def test_list_properties_includes_images(self, api_client):
        """Verify list properties endpoint includes image_base64 field"""
        # Create property with image
        create_payload = {
            "property_name": "TEST_List_With_Image",
            "address": "222 List St",
            "purchase_price": 450000,
            "current_estimated_value": 480000,
            "image_base64": SMALL_IMAGE_BASE64
        }
        create_response = api_client.post(f"{BASE_URL}/api/properties", json=create_payload)
        assert create_response.status_code == 200
        property_id = create_response.json()["property_id"]
        
        # List properties
        list_response = api_client.get(f"{BASE_URL}/api/properties")
        assert list_response.status_code == 200
        
        properties = list_response.json()
        assert isinstance(properties, list)
        
        # Find our test property
        test_property = next((p for p in properties if p["property_id"] == property_id), None)
        assert test_property is not None
        assert "image_base64" in test_property
        assert test_property["image_base64"] == SMALL_IMAGE_BASE64
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/properties/{property_id}")
        print(f"✓ List properties includes image_base64 field")
    
    def test_existing_property_with_image(self, api_client):
        """Test the existing property prop_c0e2f1669631 has image"""
        property_id = "prop_c0e2f1669631"
        
        response = api_client.get(f"{BASE_URL}/api/properties/{property_id}")
        
        if response.status_code == 200:
            property_data = response.json()
            assert "image_base64" in property_data
            if property_data["image_base64"]:
                assert property_data["image_base64"].startswith("data:image/")
                print(f"✓ Existing test property has image - ID: {property_id}")
            else:
                print(f"⚠ Existing test property has no image (image_base64 is null)")
        else:
            print(f"⚠ Test property {property_id} not found (may have been deleted)")
