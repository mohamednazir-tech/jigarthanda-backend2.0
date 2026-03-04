# Jigarthanda Backend Server

Backend API server for Jigarthanda app with PostgreSQL database integration.

## 🚀 Deployment

This server is configured for deployment on Render.com.

### Environment Variables Required:
- `DATABASE_URL`: PostgreSQL connection string (Supabase)
- `PORT`: Server port (Render provides this)

### API Endpoints:
- `GET /api/health` - Health check
- `GET /api/orders` - Fetch all orders
- `POST /api/orders/sync` - Sync orders to database
- `GET /api/settings` - Fetch shop settings
- `POST /api/settings/sync` - Sync shop settings

### Database Tables:
- `orders` - Store all order data
- `shop_settings` - Store shop configuration

## 📱 Mobile App Integration

Update your mobile app's API URL to:
```
https://your-app-name.onrender.com/api
```

## 🔧 Local Development

```bash
npm install
npm start
```

Server runs on http://localhost:3000
