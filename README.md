# StockBuddy Backend API

Complete inventory management system backend built with Node.js, Express.js, MongoDB, and Nodemailer.

## Features

- **Authentication & Authorization**: JWT-based auth with role-based access (Admin/Staff/Audits)
- **Email Integration**: Password reset via Gmail SMTP
- **Item Management**: CRUD operations for inventory items with barcode, model/serial, and purchase date support
- **Stock Management**: Add stock, transfer between locations with approval workflow
- **Repair Management**: Send items for repair and track returns with vendor details and return checklist
- **Disposal Management**: Request disposals with photo proof and admin approval
- **Location Management**: Manage multiple warehouse locations
- **Transaction Logging**: Complete audit trail with filtering, search, pagination, and print-friendly export
- **Dashboard**: Real-time inventory overview with low stock alerts
- **User Management**: Admin can manage staff users

## API Documentation

## What's New (Inventory V2)

- `items` now support optional `modelNumber`, `serialNumber`, and `purchaseDate`.
- `sku` is now optional for new item creation (legacy SKU values remain supported).
- `REPAIR_IN` transactions now support `repairReturnChecklist` (array of checklist items).
- Transactions API supports advanced filtering:
  - category (`all`, `sent_repair`, `returned_repair`, `transfers`, `disposed`, `add`)
  - date presets (`day`, `week`, `month`, `year`) via `datePreset` + optional `anchorDate`
  - `search` across item and transaction text fields
- New printable transactions view:
  - `GET /transactions/export/print` (respects current filters)
- New role: `audits`:
  - read-only intent for transactions
  - blocked from inventory/dashboard/location/users/stock/repair/disposal modules
  - role assignment is restricted by environment allowlist


### Base URL
```
http://localhost:5000/api
```

### Authentication Required
Most endpoints require JWT token in Authorization header:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## 🔐 Authentication Endpoints

### 1. Register User
**POST** `/auth/register`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe",
  "role": "admin", // "admin" | "staff" | "audits"
  "noti": "enabled" // string optional - notification preference
}
```

**Response (201):**
```json
{
  "message": "User registered successfully",
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "admin"
  }
}
```

### 2. Login
**POST** `/auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "noti": "disabled" // string optional - update notification preference
}
```

**Response (200):**
```json
{
  "message": "Login successful",
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "admin",
    "lastLogin": "2024-01-01T00:00:00.000Z"
  }
}
```

### 3. Forgot Password
**POST** `/auth/forgot-password`

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "message": "Password reset email sent successfully"
}
```

> A 6-digit One-Time Passcode (OTP) valid for 10 minutes is emailed to the user.

### 4. Reset Password
**POST** `/auth/reset-password`

**Request Body:**
```json
{
  "email": "user@example.com",
  "otp": "123456",
  "newPassword": "newPassword123"
}
```

> Supply the OTP received via email along with the associated account email address.

**Response (200):**
```json
{
  "message": "Password reset successful"
}
```

### 5. Get Profile
**GET** `/auth/profile`
**Headers:** `Authorization: Bearer TOKEN`

**Response (200):**
```json
{
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "admin",
    "lastLogin": "2024-01-01T00:00:00.000Z"
  }
}
```

### 6. Verify Token
**POST** `/auth/verify-token`
**Headers:** `Authorization: Bearer TOKEN`

**Response (200) - Valid Token:**
```json
{
  "valid": true,
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "admin"
  }
}
```

**Response (401) - Invalid Token:**
```json
{
  "valid": false,
  "error": "Invalid or expired token"
}
```

**Response (401) - Token Not Provided:**
```json
{
  "valid": false,
  "error": "Token not provided"
}
```

---

## 📊 Dashboard Endpoint

### Get Dashboard Data
**GET** `/dashboard`
**Headers:** `Authorization: Bearer TOKEN`

**Response (200):**
```json
{
  "summary": {
    "totalItems": 150,
    "totalStock": 2500,
    "lowStockCount": 5,
    "pendingRepairs": 3,
    "pendingDisposals": 2
  },
  "lowStockItems": [
    {
      "id": "item_id",
      "name": "Laptop Dell",
      "sku": "DELL-001",
      "currentStock": 2,
      "threshold": 5
    }
  ],
  "recentTransactions": [
    {
      "_id": "transaction_id",
      "type": "ADD",
      "quantity": 10,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "itemId": { "name": "Laptop Dell", "sku": "DELL-001" },
      "createdBy": { "name": "John Doe" }
    }
  ]
}
```

---

## 📦 Item Management

### 1. Create Item (Admin Only)
**POST** `/items`
**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
```json
{
  "name": "Laptop Dell",
  "model_number": "LAT-15-G6", // optional
  "serial_number": "SN-ABC-123", // optional
  "purchase_date": "2026-04-24", // optional
  "barcode": "123456789", // optional
  "unit": "pieces",
  "threshold": 5,
  "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..." // optional - base64 encoded image
}
```

**Response (201):**
```json
{
  "message": "Item created successfully",
  "item": {
    "_id": "item_id",
    "name": "Laptop Dell",
    "sku": "DELL-001",
    "modelNumber": "LAT-15-G6",
    "serialNumber": "SN-ABC-123",
    "purchaseDate": "2026-04-24T00:00:00.000Z",
    "barcode": "123456789",
    "unit": "pieces",
    "threshold": 5,
    "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "status": "active",
    "locations": [],
    "createdBy": "user_id"
  }
}
```

### 2. Get All Items
**GET** `/items`
**Headers:** `Authorization: Bearer TOKEN`

**Response (200):**
```json
[
  {
    "_id": "item_id",
    "name": "Laptop Dell",
    "sku": "DELL-001",
    "unit": "pieces",
    "threshold": 5,
    "totalStock": 25,
    "stockStatus": "sufficient", // or "low"
    "locations": [
      {
        "locationId": { "name": "Main Warehouse" },
        "quantity": 25
      }
    ]
  }
]
```

### 3. Search Items
**GET** `/items/search?query=laptop`
**Headers:** `Authorization: Bearer TOKEN`

**Response (200):** Same as Get All Items but filtered

### 4. Lookup Item by Barcode
**GET** `/items/barcode/:barcode`
**Headers:** `Authorization: Bearer TOKEN`

**Response (200):** Same as Get Item by ID

### 5. Assign or Generate Barcode (Admin Only)
**POST** `/items/:id/barcode`
**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
```json
{
  "barcode": "OPTIONAL_CUSTOM_CODE",
  "overwrite": false
}
```

If `barcode` is omitted, the server generates a unique uppercase code. Set `overwrite` to `true` to replace an existing barcode.

### 6. Get Item by ID
**GET** `/items/:id`
**Headers:** `Authorization: Bearer TOKEN`

**Response (200):** Single item object

### 7. Update Item (Admin Only)
**PUT** `/items/:id`
**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
```json
{
  "name": "Updated Laptop Dell",
  "unit": "pieces",
  "threshold": 3,
  "status": "active"
}
```

---

## 📋 Stock Management

### 1. Add Stock
**POST** `/stock/add`
**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
```json
{
  "itemId": "item_id",
  "locationId": "location_id",
  "quantity": 20,
  "note": "Initial stock",
  "photo": "base64_encoded_image" // optional
}
```

**Response (201):**
```json
{
  "message": "Stock added successfully",
  "transaction": {
    "_id": "transaction_id",
    "type": "ADD",
    "itemId": "item_id",
    "toLocationId": "location_id",
    "quantity": 20,
    "note": "Initial stock",
    "status": "approved"
  }
}
```

### 2. Transfer Stock
**POST** `/stock/transfer`
**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
```json
{
  "itemId": "item_id",
  "fromLocationId": "source_location_id",
  "toLocationId": "destination_location_id",
  "quantity": 5,
  "note": "Transfer to branch"
}
```

**Response (201):**
```json
{
  "message": "Stock transfer initiated",
  "transaction": {
    "_id": "transaction_id",
    "type": "TRANSFER",
    "status": "pending" // or "approved" for admin
  }
}
```

### 3. Review Transfer Requests (Admin Only)
**POST** `/stock/transfer/review`
**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
```json
{
  "transactionId": "transaction_id",
  "approved": true,
  "note": "Optional comment"
}
```

**Response (200):**
```json
{
  "message": "Stock transfer approved successfully",
  "transaction": {
    "_id": "transaction_id",
    "status": "approved",
    "approvedBy": "admin_user_id"
  }
}
```

Set `approved` to `false` to reject a pending transfer.

### 4. Get Pending Transfers (Admin Only)
**GET** `/stock/transfers/pending`
**Headers:** `Authorization: Bearer TOKEN`

**Response (200):** Array of pending transfer transactions with populated item, location, and requester details.

### 5. Get Stock by Location
**GET** `/stock/location/:locationId`
**Headers:** `Authorization: Bearer TOKEN`

**Response (200):**
```json
[
  {
    "item": {
      "id": "item_id",
      "name": "Laptop Dell",
      "sku": "DELL-001",
      "unit": "pieces",
      "threshold": 5
    },
    "quantity": 25,
    "status": "sufficient"
  }
]
```

---

## 🔧 Repair Management

### 1. Send for Repair
**POST** `/repairs/send`
**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
```json
{
  "itemId": "item_id",
  "locationId": "location_id",
  "quantity": 2,
  "vendorName": "Tech Repair Co",
  "serialNumber": "SN123456", // optional
  "note": "Screen damage",
  "photo": "base64_encoded_image" // optional
}
```

**Response (201):**
```json
{
  "message": "Item sent for repair",
  "repairTicket": {
    "_id": "repair_ticket_id",
    "itemId": "item_id",
    "quantity": 2,
    "vendorName": "Tech Repair Co",
    "status": "sent",
    "sentDate": "2024-01-01T00:00:00.000Z"
  }
}
```

### 2. Return from Repair
**POST** `/repairs/return`
**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
```json
{
  "repairTicketId": "repair_ticket_id",
  "locationId": "location_id",
  "note": "Repaired successfully",
  "checklist": [
    { "label": "Power test", "completed": true },
    { "label": "Visual inspection", "completed": false }
  ]
}
```

**Response (200):**
```json
{
  "message": "Item returned from repair",
  "repairTicket": {
    "status": "returned",
    "returnedDate": "2024-01-01T00:00:00.000Z"
  }
}
```

### 3. Get Repair Tickets
**GET** `/repairs`
**Headers:** `Authorization: Bearer TOKEN`

**Response (200):**
```json
[
  {
    "_id": "repair_ticket_id",
    "itemId": { "name": "Laptop Dell", "sku": "DELL-001" },
    "quantity": 2,
    "vendorName": "Tech Repair Co",
    "status": "sent",
    "sentDate": "2024-01-01T00:00:00.000Z"
  }
]
```

---

## 🗑️ Disposal Management

### 1. Request Disposal
**POST** `/disposals/request`
**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
```json
{
  "itemId": "item_id",
  "locationId": "location_id",
  "quantity": 1,
  "reason": "Broken", // "Broken", "Expired", "Obsolete"
  "note": "Beyond repair",
  "photo": "base64_encoded_image" // required
}
```

**Response (201):**
```json
{
  "message": "Disposal request submitted for approval",
  "transaction": {
    "_id": "transaction_id",
    "type": "DISPOSE",
    "status": "pending",
    "reason": "Broken"
  }
}
```

### 2. Approve Disposal (Admin Only)
**POST** `/disposals/approve`
**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
```json
{
  "transactionId": "transaction_id",
  "approved": true // or false
}
```

**Response (200):**
```json
{
  "message": "Disposal approved successfully",
  "transaction": {
    "status": "approved",
    "approvedBy": "admin_user_id",
    "approvedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 3. Get Pending Disposals (Admin Only)
**GET** `/disposals/pending`
**Headers:** `Authorization: Bearer TOKEN`

**Response (200):**
```json
[
  {
    "_id": "transaction_id",
    "type": "DISPOSE",
    "itemId": { "name": "Laptop Dell", "sku": "DELL-001" },
    "quantity": 1,
    "reason": "Broken",
    "status": "pending",
    "createdBy": { "name": "Staff User" }
  }
]
```

---

## 📍 Location Management

### 1. Create Location (Admin Only)
**POST** `/locations`
**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
```json
{
  "name": "Main Warehouse",
  "address": "123 Main St, City" // optional
}
```

**Response (201):**
```json
{
  "message": "Location created successfully",
  "location": {
    "_id": "location_id",
    "name": "Main Warehouse",
    "address": "123 Main St, City",
    "isActive": true
  }
}
```

### 2. Get All Locations
**GET** `/locations`
**Headers:** `Authorization: Bearer TOKEN`

**Response (200):**
```json
[
  {
    "_id": "location_id",
    "name": "Main Warehouse",
    "address": "123 Main St, City",
    "isActive": true,
    "createdBy": { "name": "Admin User" }
  }
]
```

### 3. Update Location (Admin Only)
**PUT** `/locations/:id`
**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
```json
{
  "name": "Updated Warehouse",
  "address": "456 New St, City",
  "isActive": true
}
```

---

## 👥 User Management (Admin Only)

### 1. Get All Users
**GET** `/users`
**Headers:** `Authorization: Bearer TOKEN`

**Response (200):**
```json
[
  {
    "_id": "user_id",
    "email": "staff@example.com",
    "name": "Staff User",
    "role": "staff",
    "isActive": true,
    "lastLogin": "2024-01-01T00:00:00.000Z"
  }
]
```

### 2. Create User
**POST** `/users`
**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "password123",
  "name": "New User",
  "role": "staff"
}
```

### 3. Update User
**PUT** `/users/:id`
**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
```json
{
  "name": "Updated Name",
  "role": "staff",
  "isActive": true
}
```

### 4. Reset User Password
**POST** `/users/:id/reset-password`
**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
```json
{
  "newPassword": "newPassword123"
}
```

---

## 📋 Transaction History

### 1. Get Transactions
**GET** `/transactions?category=all&type=ADD&status=approved&datePreset=month&search=laptop&page=1&limit=50`
**Headers:** `Authorization: Bearer TOKEN`

**Query Parameters:**
- `type`: ADD, TRANSFER, REPAIR_OUT, REPAIR_IN, DISPOSE
- `category`: all, sent_repair, returned_repair, transfers, disposed, add
- `status`: pending, approved, rejected
- `datePreset`: day, week, month, year
- `anchorDate`: ISO date (used with `datePreset`)
- `startDate`: ISO date string
- `endDate`: ISO date string
- `search`: free text search
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50)

**Response (200):**
```json
{
  "transactions": [
    {
      "_id": "transaction_id",
      "type": "ADD",
      "itemId": { "name": "Laptop Dell", "sku": "DELL-001" },
      "toLocationId": { "name": "Main Warehouse" },
      "quantity": 20,
      "status": "approved",
      "createdBy": { "name": "Admin User" },
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3
  }
}
```

### 2. Print Transactions (Filtered View)
**GET** `/transactions/export/print?category=transfers&datePreset=week&search=main`
**Headers:** `Authorization: Bearer TOKEN`

Returns a clean HTML table optimized for browser print.

### 3. Update Repair Return Checklist
**PATCH** `/transactions/:id/repair-checklist`
**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
```json
{
  "items": [
    { "id": "checklist_item_id_1", "completed": true },
    { "id": "checklist_item_id_2", "completed": false }
  ]
}
```

### 4. Get Transaction by ID
**GET** `/transactions/:id`
**Headers:** `Authorization: Bearer TOKEN`

**Response (200):** Single transaction object with full details

---

## Error Responses

All endpoints may return these error responses:

**400 Bad Request:**
```json
{
  "error": "Validation error message"
}
```

**401 Unauthorized:**
```json
{
  "error": "Access token required"
}
```

**403 Forbidden:**
```json
{
  "error": "Admin access required"
}
```

**404 Not Found:**
```json
{
  "error": "Resource not found"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Internal server error"
}
```

---

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Create `.env` file:
```env
PORT=5000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/stockbuddy
JWT_SECRET=your-super-secret-jwt-key
NODE_ENV=development

# Email Configuration (Gmail)
EMAIL_USER=your-gmail@gmail.com
EMAIL_APP_PASSWORD=your-gmail-app-password
FCM_SERVER_KEY=your-firebase-server-key
FRONTEND_URL=http://localhost:3000

# Audits role allowlist (comma-separated)
AUDIT_ALLOWED_USER_IDS=
AUDIT_ALLOWED_EMAILS=
```

### 3. Gmail Setup
1. Enable 2-Factor Authentication on Gmail
2. Generate App Password for Mail
3. Use the 16-character app password in `EMAIL_APP_PASSWORD`

### 4. Start Server
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

### 5. Test Server
```bash
curl http://localhost:5000/
```

---

## Project Structure

```
src/
├── config/
│   └── database.ts          # MongoDB connection
├── controllers/
│   ├── authController.ts    # Authentication logic
│   ├── dashboardController.ts
│   ├── itemController.ts
│   ├── stockController.ts
│   ├── repairController.ts
│   ├── disposalController.ts
│   ├── locationController.ts
│   ├── userController.ts
│   └── transactionController.ts
├── middleware/
│   └── auth.ts              # JWT authentication
├── models/
│   ├── User.ts              # User schema
│   ├── Item.ts              # Item schema
│   ├── Location.ts          # Location schema
│   ├── Transaction.ts       # Transaction schema
│   └── RepairTicket.ts      # Repair ticket schema
├── routes/
│   ├── auth.ts              # Auth routes
│   ├── dashboard.ts
│   ├── items.ts
│   ├── stock.ts
│   ├── repairs.ts
│   ├── disposals.ts
│   ├── locations.ts
│   ├── users.ts
│   └── transactions.ts
├── utils/
│   └── emailService.ts      # Email functionality
└── server.ts                # Main server file
```

---

## Testing with Postman

1. **Import Collection**: Create a new Postman collection
2. **Set Base URL**: `http://localhost:5000/api`
3. **Authentication**: 
   - Register/Login to get JWT token
   - Add token to Authorization header for protected routes
4. **Test Order**:
   - Authentication → Locations → Items → Stock → Repairs → Disposals

---

## License

ISC License - Built for StockBuddy Inventory Management System