export interface Property {
  property_id: string;
  user_id: string;
  property_name: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  purchase_price: number;
  purchase_date: string;
  loan_amount: number;
  interest_rate: number;
  current_estimated_value: number;
  property_type: string;
  bedrooms: number;
  bathrooms: number;
  parking: number;
  land_size: number;
  notes: string;
  image_base64?: string | null;
  created_date: string;
  updated_date: string;
}

export interface Income {
  income_id: string;
  property_id: string;
  user_id: string;
  date: string;
  amount: number;
  income_type: string;
  tenant_name: string;
  notes: string;
  created_date: string;
}

export interface Expense {
  expense_id: string;
  property_id: string;
  user_id: string;
  date: string;
  amount: number;
  category: string;
  notes: string;
  recurring: boolean;
  created_date: string;
}

export interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
}

export interface PortfolioMetrics {
  total_properties: number;
  total_market_value: number;
  total_purchase_value: number;
  total_equity: number;
  total_yearly_income: number;
  total_yearly_expenses: number;
  net_yearly_cashflow: number;
  monthly_avg_income: number;
  yearly_roi: number;
}

export interface PropertyMetric {
  property_id: string;
  property_name: string;
  property_type: string;
  current_value: number;
  income_ytd: number;
  expenses_ytd: number;
  net_cashflow: number;
  repair_costs: number;
  roi: number;
  capital_growth: number;
}

export interface DashboardData {
  portfolio: PortfolioMetrics;
  property_metrics: PropertyMetric[];
  monthly_trend: { month: string; income: number; expenses: number }[];
  expense_by_category: Record<string, number>;
}

export const EXPENSE_CATEGORIES = [
  'mortgage', 'council rates', 'water rates', 'insurance',
  'repairs', 'repeated repairs', 'strata/body corporate',
  'maintenance', 'agent fees', 'vacancy loss', 'tax related', 'miscellaneous'
];

export const PROPERTY_TYPES = ['house', 'unit', 'townhouse'];

export const STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'];
