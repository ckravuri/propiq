# PropIQ - Property Investment Tracking App

## Product Requirements Document (PRD)

### Overview
PropIQ is a cross-platform mobile application that helps users track multiple investment properties, including purchase value, current market value, rental income, maintenance expenses, yearly performance, and end-of-year reporting.

### Tech Stack
- **Frontend:** Expo React Native (SDK 54) with Expo Router
- **Backend:** FastAPI (Python)
- **Database:** MongoDB (via Motor async driver)
- **Authentication:** Emergent-managed Google OAuth
- **AI:** OpenAI GPT-5.2 + Google Gemini 3 Flash (via emergentintegrations)
- **AdMob:** Mock banners (test ad unit IDs - requires native build for production)

### Core Features

#### 1. Authentication
- [x] Google Sign-In only (Emergent OAuth)
- [x] Session management with 7-day expiry
- [x] Multi-device sync via server-side sessions
- [x] Sign out functionality

#### 2. Property Management
- [x] Add/Edit/Delete properties
- [x] Property fields: name, address, suburb, state, postcode, purchase price, loan, interest rate, current value, type, bedrooms, bathrooms, parking, land size, notes
- [x] Property types: house, unit, townhouse
- [x] Unlimited properties per user
- [x] Address autocomplete (via Nominatim/OpenStreetMap)
- [x] Auto-populate property details (bedrooms, bathrooms, parking, land size, property type) from domain.com.au or AI estimation (GPT-5.2) when address is selected
- [x] Property image upload (camera + gallery)

#### 3. Income Tracking
- [x] Add income entries per property
- [x] Income types: rent, other
- [x] Tenant name tracking
- [x] Date and amount tracking

#### 4. Expense Tracking
- [x] Add expense entries per property
- [x] 12 expense categories: mortgage, council rates, water rates, insurance, repairs, repeated repairs, strata/body corporate, maintenance, agent fees, vacancy loss, tax related, miscellaneous
- [x] Recurring expense flag

#### 5. Dashboard
- [x] Portfolio-level metrics (total properties, market value, equity, yearly income/expenses, ROI)
- [x] Property-level metrics (value, income/expenses YTD, cashflow, growth %)
- [x] Income vs Expenses bar chart
- [x] Cashflow trend line chart
- [x] Expense breakdown pie chart
- [x] Pull-to-refresh

#### 6. Reports
- [x] PDF report generation with property summary, financials, income/expense details
- [x] CSV export with complete data
- [x] Tax-ready expense summary

#### 7. AI Insights
- [x] GPT-5.2 property analysis
- [x] Gemini 3 Flash property analysis
- [x] Performance assessment, risk analysis, optimization suggestions

#### 8. Settings
- [x] User profile display
- [x] Dark/Light mode toggle
- [x] Sign out

#### 9. AdMob (MOCKED)
- [x] Banner ad placeholders on dashboard and property detail
- Note: Real AdMob requires native build (not available in Expo Go)

### Screens
1. Login (Google Sign-In)
2. Dashboard (tabs)
3. Properties list (tabs)
4. Reports (tabs)
5. Settings (tabs)
6. Property Detail (stack)
7. Add/Edit Property (stack)
8. Add Income (stack)
9. Add Expense (stack)

### API Endpoints
- `POST /api/auth/session` - Exchange OAuth session
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout
- `GET/POST /api/properties` - List/Create properties
- `GET/PUT/DELETE /api/properties/{id}` - CRUD single property
- `GET/POST /api/income/{property_id}` - Income entries
- `GET/POST /api/expenses/{property_id}` - Expense entries
- `GET /api/dashboard` - Dashboard data
- `GET /api/reports/summary/{property_id}` - Report summary
- `GET /api/reports/csv/{property_id}` - CSV export
- `POST /api/ai/insights` - AI insights

### Database Collections
- `users` - User profiles
- `user_sessions` - Session tokens
- `properties` - Property data
- `income_entries` - Income records
- `expense_entries` - Expense records

### Future Enhancements
- [ ] Property image upload (base64)
- [ ] Receipt/invoice attachments
- [ ] Push notification reminders for bills
- [ ] Yearly tax reminders
- [ ] Offline caching with AsyncStorage
- [ ] Production AdMob integration (requires native build)
- [ ] Multi-year comparison reports
- [ ] Portfolio growth historical tracking
