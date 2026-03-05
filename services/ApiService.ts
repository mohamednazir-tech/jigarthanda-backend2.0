import { API, API_ENDPOINTS } from '@/config/api';
import { Order, ShopSettings } from '@/types';

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
}

export interface OrderResponse {
  success: boolean;
  message: string;
  order?: Order;
}

class ApiService {
  // Generic API request method
  private static async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${API.baseURL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      // DEBUG: Log raw response
      const responseText = await response.text();
      console.log(`=== API DEBUG [${endpoint}] ===`);
      console.log('URL:', `${API.baseURL}${endpoint}`);
      console.log('Status:', response.status);
      console.log('Raw Response:', responseText);
      console.log('================================');

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (error) {
        console.error('Server returned non-JSON:', responseText);
        throw new Error('Server not ready. Please try again.');
      }
      
      if (!response.ok) {
        throw new Error((data as any).message || 'API request failed');
      }

      return data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      return {
        success: false,
        message: (error as Error).message || 'Network error',
      };
    }
  }

  // Orders API
  static async getOrders(): Promise<Order[]> {
    const response = await this.request<any>(API_ENDPOINTS.ORDERS);
    
    console.log('=== GET ORDERS DEBUG ===');
    console.log('Response success:', response.success);
    console.log('Response orders:', (response as any).data);
    console.log('Full response:', response);
    console.log('========================');
    
    if (!response.success || !(response as any).data) {
      console.log('No orders found or response failed');
      return [];
    }

    // Normalize field names from backend to frontend format
    const normalizedOrders = (response as any).data.map((raw: any) => ({
      id: raw.id,
      userId: raw.userId || raw.userid,  // Handle both formats
      items: raw.items,
      total: Number(raw.total),
      tax: Number(raw.tax),
      grandTotal: Number(raw.grandTotal || raw.grandtotal),  // Handle both formats
      paymentMethod: raw.paymentMethod || raw.paymentmethod,  // Handle both formats
      createdAt: raw.createdAt || raw.createdat,  // Handle both formats
      syncedAt: raw.syncedAt || raw.syncedat,
      cloudId: raw.cloudId || raw.cloudid,
      status: raw.status || 'pending',  // Default to pending if not set
    }));

    console.log('Normalized orders:', normalizedOrders);
    return normalizedOrders;
  }

  static async createOrder(order: Omit<Order, 'id'>): Promise<Order | null> {
    try {
      console.log('=== ORDER CREATION START ===');
      console.log('Creating order with data:', {
        ...order,
        createdAt: new Date().toISOString(),
      });
      
      let response;
      let retries = 0;
      const maxRetries = 2;
      
      while (retries <= maxRetries) {
        try {
          response = await this.request<OrderResponse>(API_ENDPOINTS.ORDERS, {
            method: 'POST',
            body: JSON.stringify(order),
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
            },
          });
          
          // If successful, break retry loop
          if (response.success) {
            break;
          }
          
          // If failed and still have retries, retry
          if (retries < maxRetries) {
            console.log(`Order creation failed, retrying in 2 seconds... (${retries + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            retries++;
          } else {
            // Max retries reached, throw error
            throw new Error('Order creation failed after retries');
          }
        } catch (error) {
          // If error and still have retries, retry
          if (retries < maxRetries) {
            console.log(`Server error, retrying in 2 seconds... (${retries + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            retries++;
          } else {
            // Max retries reached, throw error
            throw error;
          }
        }
      }

      // Ensure response is defined
      if (!response) {
        throw new Error('No response received from server');
      }

      console.log('=== API RESPONSE ===');
      console.log('Full response:', response);
      console.log('Response success:', response.success);
      console.log('Response data:', response.data);
      console.log('Response message:', response.message);

      if (response.success) {
        const raw = (response as any).order;

        const normalizedOrder = {
          id: raw.id,
          userId: raw.userid,
          items: raw.items,
          total: Number(raw.total),
          tax: Number(raw.tax),
          grandTotal: Number(raw.grandtotal),
          paymentMethod: raw.paymentmethod,
          createdAt: raw.createdat,
          syncedAt: raw.syncedat,
          cloudId: raw.cloudid,
          status: raw.status || 'pending',
        };

        console.log('=== ORDER CREATED SUCCESSFULLY ===');
        console.log('Normalized order:', normalizedOrder);

        return normalizedOrder;
      } else {
        console.error('=== ORDER CREATION FAILED ===');
        console.error('Success flag:', response.success);
        console.error('Data exists:', !!response.data);
        console.error('Order exists:', !!(response as any).order);
        console.error('Error message:', response.message);
        return null;
      }
    } catch (error) {
      console.error('=== ORDER CREATION ERROR ===');
      console.error('Network/fetch error:', error);
      return null;
    }
  }

  static async updateOrder(id: string, updates: Partial<Order>): Promise<Order | null> {
    const response = await this.request<Order>(`${API_ENDPOINTS.ORDERS}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });

    return response.success && response.data ? response.data : null;
  }

  static async deleteOrder(id: string): Promise<boolean> {
    const response = await this.request(`${API_ENDPOINTS.ORDERS}/${id}`, {
      method: 'DELETE',
    });

    return response.success;
  }

  // Update Order Status
  static async updateOrderStatus(id: string, status: 'pending' | 'preparing' | 'ready' | 'completed'): Promise<Order | null> {
    const response = await this.request<Order>(`${API_ENDPOINTS.ORDERS}/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });

    return response.success && response.data ? response.data : null;
  }

  // Delete All Orders
  static async deleteAllOrders(): Promise<{ success: boolean; deletedCount: number }> {
    const response = await this.request<{ deletedCount: number }>(`${API_ENDPOINTS.ORDERS}/all`, {
      method: 'DELETE',
    });

    return response.success ? {
      success: true,
      deletedCount: response.data?.deletedCount || 0
    } : {
      success: false,
      deletedCount: 0
    };
  }

  // Settings API
  static async getSettings(): Promise<ShopSettings | null> {
    const response = await this.request<ShopSettings>(API_ENDPOINTS.SETTINGS);
    return response.success && response.data ? response.data : null;
  }

  static async updateSettings(settings: Partial<ShopSettings>): Promise<ShopSettings | null> {
    const response = await this.request<ShopSettings>(API_ENDPOINTS.SETTINGS, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });

    return response.success && response.data ? response.data : null;
  }

  // Health check
  static async healthCheck(): Promise<boolean> {
    try {
      const response = await this.request(API_ENDPOINTS.HEALTH);
      return response.success;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  // Sync multiple orders
  static async syncOrders(orders: Order[]): Promise<boolean> {
    try {
      const response = await this.request(API_ENDPOINTS.SYNC, {
        method: 'POST',
        body: JSON.stringify({ orders }),
      });

      return response.success;
    } catch (error) {
      console.error('Sync orders failed:', error);
      return false;
    }
  }
}

export default ApiService;
