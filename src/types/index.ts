// User & Authentication Types
export interface User {
  id: number;
  username: string;
  password: string;
  name: string;
  role: UserRole;
  room_id?: number;
  is_active: boolean;
  created_at: string;
}

export type UserRole = 
  | 'admin' 
  | 'reception' 
  | 'doctor' 
  | 'lab_operator' 
  | 'xray_operator' 
  | 'surgery_operator'
  | 'pharmacy' 
  | 'accountant';

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: ['*'],
  reception: ['reception', 'billing', 'pharmacy', 'inventory', 'view_bills'],
  doctor: [
    'doctor_room',
    'lab',
    'xray',
    'surgery',
    'pharmacy',
    'inventory',
    'patients',
    'view_bills',
    'add_charges',
  ],
  lab_operator: ['lab', 'add_charges', 'view_bills'],
  xray_operator: ['xray', 'add_charges', 'view_bills'],
  surgery_operator: ['surgery', 'add_charges', 'view_bills'],
  pharmacy: ['pharmacy', 'inventory', 'add_charges', 'view_bills'],
  accountant: ['billing', 'reports', 'view_bills'],
};

// Room Types
export interface Room {
  id: number;
  name: string;
  type: RoomType;
  is_active: boolean;
}

export type RoomType = 
  | 'reception' 
  | 'doctor_room' 
  | 'lab' 
  | 'xray' 
  | 'surgery' 
  | 'pharmacy';

// Patient & Animal Types
export interface Patient {
  id: number;
  owner_name: string;
  owner_phone: string;
  owner_email?: string;
  owner_address?: string;
  created_at: string;
  updated_at: string;
}

export interface Animal {
  id: number;
  patient_id: number;
  name: string;
  type: AnimalType;
  breed?: string;
  age?: number;
  age_unit?: 'months' | 'years';
  gender?: 'male' | 'female' | 'unknown';
  weight?: number;
  notes?: string;
  created_at: string;
}

export type AnimalType = 
  | 'dog' 
  | 'cat' 
  | 'cow' 
  | 'goat' 
  | 'bird' 
  | 'tiger' 
  | 'other';

// Token Types
export interface Token {
  id: number;
  token_number: number;
  bill_id: number;
  patient_id: number;
  animal_id: number;
  room_id?: number;
  status: TokenStatus;
  date: string;
  created_at: string;
  completed_at?: string;
}

export type TokenStatus = 'waiting' | 'in_progress' | 'completed' | 'cancelled';

/** Doctor can send one patient to several rooms the same day; each row is one stop. */
export type TokenReferralStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface TokenReferral {
  id: number;
  token_id: number;
  room_id: number;
  status: TokenReferralStatus;
  created_at: string;
}

// Bill Types
export interface Bill {
  id: number;
  bill_code: string;
  patient_id: number;
  animal_id: number;
  token_id: number;
  total_amount: number;
  discount_amount: number;
  discount_percent: number;
  final_amount: number;
  paid_amount: number;
  payment_status: PaymentStatus;
  payment_method?: PaymentMethod;
  current_room_id?: number;
  status: BillStatus;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export type PaymentStatus = 'pending' | 'partial' | 'paid';
export type PaymentMethod = 'cash' | 'card' | 'online';
export type BillStatus = 'active' | 'completed' | 'cancelled';

// Bill Item Types
export interface BillItem {
  id: number;
  bill_id: number;
  item_name: string;
  item_type: ItemType;
  room_id: number;
  room_name: string;
  operator_id: number;
  operator_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes?: string;
  inventory_id?: number;
  created_at: string;
}

export type ItemType = 
  | 'consultation' 
  | 'procedure' 
  | 'medicine' 
  | 'lab_test' 
  | 'xray' 
  | 'surgery' 
  | 'food' 
  | 'supplement' 
  | 'other';

// Inventory Types
export interface InventoryItem {
  id: number;
  name: string;
  category: InventoryCategory;
  description?: string;
  stock_quantity: number;
  min_stock_level: number;
  cost_price: number;
  selling_price: number;
  supplier?: string;
  expiry_date?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type InventoryCategory = 
  | 'medicine' 
  | 'food' 
  | 'supplement' 
  | 'equipment' 
  | 'other';

// Medical Record Types
export interface MedicalRecord {
  id: number;
  bill_id: number;
  patient_id: number;
  animal_id: number;
  doctor_id: number;
  doctor_name: string;
  room_id: number;
  diagnosis?: string;
  symptoms?: string;
  treatment?: string;
  notes?: string;
  follow_up_date?: string | null;
  created_at: string;
}

// Payment Types
export interface Payment {
  id: number;
  bill_id: number;
  amount: number;
  payment_method: PaymentMethod;
  transaction_id?: string;
  notes?: string;
  received_by: number;
  received_by_name: string;
  created_at: string;
}

// Audit Log Types
export interface AuditLog {
  id: number;
  table_name: string;
  record_id: number;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_data?: string;
  new_data?: string;
  user_id?: number;
  user_name?: string;
  created_at: string;
}

// Dashboard & Report Types
export interface DashboardStats {
  today_tokens: number;
  today_revenue: number;
  pending_tokens: number;
  low_stock_items: number;
  waiting_patients: number;
}

export interface RoomQueueItem {
  token_id: number;
  token_number: number;
  bill_id: number;
  patient_name: string;
  owner_phone: string;
  animal_name: string;
  animal_type: string;
  status: TokenStatus;
  waiting_since: string;
}

export interface DailyReport {
  date: string;
  total_bills: number;
  total_revenue: number;
  total_discount: number;
  net_revenue: number;
  room_wise: RoomWiseReport[];
  payment_wise: PaymentWiseReport[];
}

export interface RoomWiseReport {
  room_id: number;
  room_name: string;
  total_charges: number;
  item_count: number;
}

export interface PaymentWiseReport {
  payment_method: PaymentMethod;
  total_amount: number;
  count: number;
}

export interface DoctorReport {
  doctor_id: number;
  doctor_name: string;
  total_patients: number;
  total_charges: number;
}

/** One row for reports: completed bill with customer context */
export interface BillReportRow {
  id: number;
  bill_code: string;
  created_at: string;
  completed_at?: string;
  total_amount: number;
  discount_amount: number;
  final_amount: number;
  paid_amount: number;
  payment_status: string;
  payment_method?: string;
  owner_name: string;
  animal_name: string;
}

// Form Types
export interface PatientFormData {
  owner_name: string;
  owner_phone: string;
  owner_email?: string;
  owner_address?: string;
  animal_name: string;
  animal_type: AnimalType;
  breed?: string;
  age?: number;
  age_unit?: 'months' | 'years';
  gender?: 'male' | 'female' | 'unknown';
  weight?: number;
  notes?: string;
}

export interface BillItemFormData {
  item_name: string;
  item_type: ItemType;
  quantity: number;
  unit_price: number;
  notes?: string;
  inventory_id?: number;
}

export interface PaymentFormData {
  amount: number;
  payment_method: PaymentMethod;
  transaction_id?: string;
  notes?: string;
}

// Search Types
export interface PatientSearchResult {
  patient: Patient;
  animals: Animal[];
  last_visit?: string;
}

export interface BillSearchResult {
  bill: Bill;
  patient: Patient;
  animal: Animal;
  items: BillItem[];
}

// Auth Context Types
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

// App Context Types
export interface AppState {
  currentRoom?: Room;
  currentBill?: Bill;
  currentToken?: Token;
}
