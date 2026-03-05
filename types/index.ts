export interface MenuItem {
  id: string;
  name: string;
  nameLocal: string;
  price: number;
  category: 'jigarthanda' | 'falooda' | 'addon' | 'snack' | 'parcel';
  image?: string;
  description?: string;
}

export interface CartItem {
  item: MenuItem;
  quantity: number;
}

export interface Order {
  id: string;
  userId: string;
  items: CartItem[];
  total: number;
  tax: number;
  grandTotal: number;
  createdAt: Date;
  paymentMethod: 'cash' | 'upi';
  status: 'pending' | 'preparing' | 'ready' | 'completed';
}

export interface ShopSettings {
  name: string;
  nameLocal: string;
  address: string;
  phone: string;
  gstNumber?: string;
}

export interface User {
  id: string;
  username: string;
  password: string;
  name: string;
  district: string;
  districtTamil: string;
  role: 'admin' | 'staff' | 'manager';
  phone?: string;
  createdAt: Date;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
