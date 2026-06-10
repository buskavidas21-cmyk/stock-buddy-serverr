# StockBuddy Backend API

Complete inventory management system backend built with Node.js, Express.js, MongoDB, and Nodemailer.

## Features

- **Authentication & Authorization**: JWT-based auth with roles (`super_admin`, `admin`, `staff`, `audits`)
- **Manager Management**: Create managers, assign locations, control per-event email preferences
- **Email Integration**: Password reset via Gmail SMTP; location-scoped manager notifications
- **Item Management**: CRUD with barcode, model/serial, purchase date, location + manager at creation
- **Stock Management**: Add stock with manager assignment; location-filtered item lists
- **Repair Management**: Send/return repairs, optional serial, barcode-first labels, dispose-from-repair flow
- **Disposal Management**: Request disposals with enriched review data (barcode-first)
- **Location Management**: Manage multiple warehouse locations
- **Transaction Logging**: Filtering, search, pagination, print export, repair checklists
- **Dashboard**: Overview + dedicated low-stock endpoint with rich item/location/manager data
- **User Management**: Admin/super-admin user control with soft deactivate/reactivate

## API Documentation

## Changelog

### Inventory V2

| Area | Change |
|------|--------|
| Items | Optional `modelNumber`, `serialNumber`, `purchaseDate`; `sku` optional for new items |
| Repairs | `repairReturnChecklist` on `REPAIR_IN` transactions |
| Transactions | Category/date/search filters, pagination, print export |
| Role `audits` | Read-only transactions; admin assigns via `isAuditApproved` |

### Client V3 (Latest)

| Area | Change |
|------|--------|
| **Managers** | New `/managers` module — CRUD, location assignment, email preferences |
| **Create Item** | Accepts `locationId`, `managerId`, `initialQuantity` at creation |
| **List Items** | Filter by location: `GET /items?locationId=` or `GET /items/by-location/:id` |
| **Add Stock** | Accepts `managerId`; items must be registered for selected location |
| **Repairs** | Barcode-first `displayLabel`; `POST /repairs/dispose-from-repair` for unrepairable items |
| **Disposals** | Pending list includes barcode, model, serial, linked repair ticket |
| **Dashboard** | New `GET /dashboard/low-stock` with location/manager breakdown |
| **Users** | Inactive users included by default; super admin controls activate/deactivate |
| **Role `super_admin`** | Protected account; only super admin can deactivate/reactivate users |
| **Notifications** | Managers receive emails only for their assigned locations (preference-based) |


### Super Admin Bootstrap (one-time)

Set your account in MongoDB (no public API for first super admin):

```js
db.users.updateOne(
  { email: "your@email.com" },
  { $set: { role: "super_admin", isActive: true } }
)
```

---

## Roles & Permissions

| Role | Access |
|------|--------|
| `super_admin` | Full access; only role that can activate/deactivate users; cannot be deactivated |
| `admin` | Full inventory access; cannot deactivate users or modify super admin |
| `staff` | Standard inventory operations |
| `audits` | Read-only `GET /transactions` (+ auth profile); blocked elsewhere |

---

## API Quick Reference (Updated Endpoints)

| Method | Endpoint | New/Updated Params | Notes |
|--------|----------|-------------------|-------|
| `POST` | `/items` | `locationId`, `managerId`, `initialQuantity` | Registers item to location + manager |
| `GET` | `/items` | `?locationId=` | Filter items registered for location |
| `GET` | `/items/by-location/:locationId` | — | Items for Add Stock location picker |
| `POST` | `/stock/add` | `managerId` | Stored on transaction + item location row |
| `POST` | `/stock/transfer` | `managerId` | Optional on transfer transaction |
| `GET` | `/repairs` | `?status=` | Returns `displayLabel`, `itemBarcode` (barcode-first) |
| `POST` | `/repairs/dispose-from-repair` | `repairTicketId`, `reason`, `note`, `photo`, `checklist` | Unrepairable item → pending disposal |
| `GET` | `/dashboard/low-stock` | `?locationId=` | Rich low-stock list for mobile screen |
| `GET` | `/users` | `?includeInactive=false` | Inactive users included by default |
| `PUT` | `/users/:id` | `isActive` | **Super admin only** for activate/deactivate |
| `POST` | `/managers` | `name`, `email`, `phone`, `assignedLocationIds`, `notificationPreferences` | Admin only |
| `PUT` | `/managers/:id/locations` | `locationIds[]` | Assign sites to manager |
| `GET` | `/disposals/pending` | — | Response includes `barcode`, `itemRef`, repair link |

---

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
  "role": "staff", // default onboarding role
  "noti": "enabled" // string optional - notification preference
}
```

> For security, assign `audits` role through admin-only `/users` APIs with `isAuditApproved=true`.

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

## 📊 Dashboard Endpoints

### 1. Get Dashboard Data
**GET** `/dashboard`
**Headers:** `Authorization: Bearer TOKEN`

**Response (200):** Summary + enriched `lowStockItems` (barcode, model, location breakdown, managers) + `recentTransactions`.

### 2. Get Low Stock Items (Updated — use for Low Stock screen)
**GET** `/dashboard/low-stock`
**Headers:** `Authorization: Bearer TOKEN`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `locationId` | string | optional — filter to items registered at this location |

**Response (200):**
```json
{
  "count": 2,
  "items": [
    {
      "id": "item_id",
      "name": "CleanMax",
      "barcode": "A1B2C3D4",
      "modelNumber": "ZM-800",
      "sku": "SKU-4440944867",
      "serialNumber": "SN-001",
      "unit": "PCS",
      "threshold": 5,
      "currentStock": 0,
      "stockStatus": "out_of_stock",
      "locationId": "location_id",
      "locationName": "Shedd",
      "assignedManager": { "name": "Site Manager", "email": "manager@company.com" },
      "manager": { "name": "Site Manager", "email": "manager@company.com" },
      "locations": [
        {
          "locationId": "location_id",
          "locationName": "Shedd",
          "quantity": 0,
          "manager": { "name": "Site Manager" },
          "status": "low"
        }
      ]
    }
  ]
}
```

---

## 📦 Item Management

### 1. Create Item (Admin Only) — **Updated**
**POST** `/items`
**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | Item name |
| `unit` | string | yes | e.g. `PCS`, `pieces` |
| `threshold` | number | yes | Low-stock threshold |
| `model_number` / `modelNumber` | string | no | Model number |
| `serial_number` / `serialNumber` | string | no | Serial number |
| `purchase_date` / `purchaseDate` | date | no | Purchase date |
| `barcode` | string | no | Barcode |
| `sku` | string | no | Legacy SKU (optional) |
| `image` | string | no | Base64 image |
| `locationId` / `location_id` | ObjectId | no | **NEW** — register item to location |
| `managerId` / `manager_id` | ObjectId | no | **NEW** — assign manager |
| `initialQuantity` / `initial_quantity` | number | no | **NEW** — starting qty at location (default `0`) |

```json
{
  "name": "Tablet - Apple",
  "model_number": "IPAD-11",
  "serial_number": "SN-ABC-123",
  "purchase_date": "2026-04-24",
  "barcode": "A1B2C3D4",
  "unit": "PCS",
  "threshold": 5,
  "locationId": "location_id",
  "managerId": "manager_id",
  "initialQuantity": 1
}
```

**Response (201):** Item with `registeredLocationIds`, `assignedManagerId`, and `locations[]` populated.

### 2. Get All Items — **Updated**
**GET** `/items`
**Headers:** `Authorization: Bearer TOKEN`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `locationId` | string | optional — return only items registered for this location |

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

### 3. Get Items by Location — **NEW**
**GET** `/items/by-location/:locationId`
**Headers:** `Authorization: Bearer TOKEN`

Use this for **Add Stock** item picker after a location is selected.

**Response (200):**
```json
[
  {
    "_id": "item_id",
    "name": "Tablet - Apple",
    "barcode": "A1B2C3D4",
    "modelNumber": "IPAD-11",
    "quantityAtLocation": 3,
    "totalStock": 3,
    "stockStatus": "sufficient",
    "assignedManagerId": { "name": "Site Manager", "email": "manager@company.com" },
    "locations": []
  }
]
```

### 4. Search Items
**GET** `/items/search?query=laptop`
**Headers:** `Authorization: Bearer TOKEN`

**Query Parameters:** `query` (required) — searches name, sku, modelNumber, serialNumber, barcode

**Response (200):** Same as Get All Items but filtered

### 5. Lookup Item by Barcode
**GET** `/items/barcode/:barcode`
**Headers:** `Authorization: Bearer TOKEN`

**Response (200):** Same as Get Item by ID

### 6. Assign or Generate Barcode (Admin Only)
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

### 7. Get Item by ID
**GET** `/items/:id`
**Headers:** `Authorization: Bearer TOKEN`

**Response (200):** Single item object

### 8. Update Item (Admin Only)
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

### 1. Add Stock — **Updated**
**POST** `/stock/add`
**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `itemId` | ObjectId | yes | Must be registered for `locationId` |
| `locationId` | ObjectId | yes | Target location |
| `quantity` | number | yes | Quantity to add |
| `managerId` | ObjectId | no | **NEW** — manager for this stock entry |
| `note` | string | no | Note |
| `photo` | string | no | Base64 image |

```json
{
  "itemId": "item_id",
  "locationId": "location_id",
  "managerId": "manager_id",
  "quantity": 20,
  "note": "Initial stock",
  "photo": "base64_encoded_image"
}
```

**Response (201):** Transaction includes `managerId`. Managers at location receive email (if preferences allow).

### 2. Transfer Stock — **Updated**
**POST** `/stock/transfer`
**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `itemId` | ObjectId | yes | Item to transfer |
| `fromLocationId` | ObjectId | yes | Source |
| `toLocationId` | ObjectId | yes | Destination |
| `quantity` | number | yes | Qty |
| `managerId` | ObjectId | no | **NEW** — optional manager on transaction |
| `note` | string | no | Note |

```json
{
  "itemId": "item_id",
  "fromLocationId": "source_location_id",
  "toLocationId": "destination_location_id",
  "managerId": "manager_id",
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

### 1. Send for Repair — **Updated** (`serialNumber` optional)
**POST** `/repairs/send`
**Headers:** `Authorization: Bearer TOKEN`

**Request Body:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `itemId` | ObjectId | yes | Item |
| `locationId` | ObjectId | yes | Source location |
| `quantity` | number | yes | Qty |
| `vendorName` | string | yes | Repair vendor |
| `serialNumber` | string | **no** | Optional — some items have no serial |
| `note` | string | no | Notes |
| `photo` | string | no | Base64 image |

```json
{
  "itemId": "item_id",
  "locationId": "location_id",
  "quantity": 2,
  "vendorName": "Tech Repair Co",
  "serialNumber": "SN123456",
  "note": "Screen damage",
  "photo": "base64_encoded_image"
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

### 3. Dispose from Repair (Unrepairable) — **NEW**
**POST** `/repairs/dispose-from-repair`
**Headers:** `Authorization: Bearer TOKEN`

Use when an item **cannot be repaired** — creates a pending disposal (no stock returned).

**Request Body:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `repairTicketId` | ObjectId | yes | Open repair ticket (`status: sent`) |
| `reason` | string | yes | `Broken`, `Expired`, or `Obsolete` |
| `note` | string | no | Notes |
| `photo` | string | no | Evidence photo |
| `checklist` | array | no | Same format as return checklist |

```json
{
  "repairTicketId": "repair_ticket_id",
  "reason": "Broken",
  "note": "Board damaged beyond repair",
  "photo": "base64_encoded_image",
  "checklist": [{ "label": "Tested power", "completed": true }]
}
```

**Response (201):** `{ repairTicket, transaction }` — ticket status becomes `dispose_pending`.

### 4. Get Repair Tickets — **Updated** (barcode-first labels)
**GET** `/repairs`
**Headers:** `Authorization: Bearer TOKEN`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | optional — `sent`, `returned`, `lost`, `dispose_pending` |

**Response (200):**
```json
[
  {
    "_id": "repair_ticket_id",
    "displayLabel": "Barcode: A1B2C3D4 - Tablet - Apple",
    "itemBarcode": "A1B2C3D4",
    "itemId": {
      "name": "Tablet - Apple",
      "barcode": "A1B2C3D4",
      "modelNumber": "IPAD-11",
      "serialNumber": "SN-001",
      "sku": "SKU-0689300974"
    },
    "quantity": 1,
    "vendorName": "Tech Repair Co",
    "status": "sent",
    "sentDate": "2024-01-01T00:00:00.000Z"
  }
]
```

> Use `displayLabel` or `itemBarcode` in dropdowns instead of serial number.

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

### 3. Get Pending Disposals (Admin Only) — **Updated**
**GET** `/disposals/pending`
**Headers:** `Authorization: Bearer TOKEN`

**Response (200):** Enriched item data — use `barcode` / `itemRef` instead of SKU in UI.

```json
[
  {
    "_id": "transaction_id",
    "type": "DISPOSE",
    "itemRef": "A1B2C3D4",
    "itemId": {
      "name": "Tablet - Apple",
      "barcode": "A1B2C3D4",
      "modelNumber": "IPAD-11",
      "serialNumber": "SN-001",
      "sku": "SKU-0689300974",
      "unit": "PCS",
      "threshold": 5,
      "purchaseDate": "2025-01-15T00:00:00.000Z"
    },
    "repairTicketId": {
      "vendorName": "Tech Repair Co",
      "status": "dispose_pending"
    },
    "quantity": 1,
    "reason": "Broken",
    "status": "pending",
    "fromLocationId": { "name": "Shedd" },
    "createdBy": { "name": "Staff User", "email": "staff@company.com" }
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

## 👥 User Management (Admin / Super Admin)

**Roles allowed:** `admin`, `staff`, `audits` (admin creates). `super_admin` only via DB bootstrap or by existing super admin.

### 1. Get All Users — **Updated**
**GET** `/users`
**Headers:** `Authorization: Bearer TOKEN`

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `includeInactive` | boolean | `true` | Set `false` to hide deactivated users |

**Response (200):** Includes `isActive` so admins can reactivate users.

### 2. Create User
**POST** `/users`
**Headers:** `Authorization: Bearer TOKEN` (Admin)

**Request Body:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `email` | string | yes | Unique email |
| `password` | string | yes | Password |
| `name` | string | yes | Display name |
| `role` | string | no | `admin`, `staff`, `audits` (default `staff`) |
| `isAuditApproved` | boolean | no | Required `true` when `role` is `audits` |

### 3. Update User — **Updated**
**PUT** `/users/:id`
**Headers:** `Authorization: Bearer TOKEN` (Admin)

**Request Body:**
| Field | Type | Who can set | Notes |
|-------|------|-------------|-------|
| `name` | string | Admin | Update name |
| `role` | string | Admin | `admin`, `staff`, `audits` |
| `isAuditApproved` | boolean | Admin | For audits role |
| `isActive` | boolean | **Super admin only** | `false` = deactivate, `true` = reactivate |

> Super admin accounts cannot be deactivated. Only super admin can change super admin accounts.

### 4. Reset User Password
**POST** `/users/:id/reset-password`
**Headers:** `Authorization: Bearer TOKEN` (Admin; super admin for super admin accounts)

---

## 👔 Manager Management (Admin Only) — **NEW**

Managers are site contacts assigned to locations. They receive **location-scoped email notifications** based on preferences.

### 1. Create Manager
**POST** `/managers`

**Request Body:**
```json
{
  "name": "Jorge Rodriguez",
  "email": "jorge@company.com",
  "phone": "+1234567890",
  "assignedLocationIds": ["location_id_1", "location_id_2"],
  "notificationPreferences": {
    "stock": true,
    "repair": true,
    "disposal": true,
    "transfer": false
  }
}
```

### 2. Get All Managers
**GET** `/managers`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `includeInactive` | boolean | `true` to include deactivated managers |

### 3. Get Manager by ID
**GET** `/managers/:id`

### 4. Get Managers by Location
**GET** `/managers/by-location/:locationId`

Returns managers assigned to a specific site.

### 5. Update Manager
**PUT** `/managers/:id`

**Request Body:** `name`, `email`, `phone`, `isActive`, `notificationPreferences` (partial update supported)

**Notification preference keys:** `stock`, `repair`, `disposal`, `transfer` (boolean each)

### 6. Assign Locations to Manager
**PUT** `/managers/:id/locations`

**Request Body:**
```json
{
  "locationIds": ["location_id_1", "location_id_2"]
}
```

Replaces the manager's full location assignment list.

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

```json
{
  "error": "Super admin access required"
}
```

```json
{
  "error": "Only super admin can activate or deactivate users"
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
```

### 3. Gmail Setup
1. Enable 2-Factor Authentication on Gmail
2. Generate App Password for Mail
3. Use the 16-character app password in `EMAIL_APP_PASSWORD`

### 4. Run Migrations (after deploy)
```bash
npm run migrate:inventory-v2
npm run migrate:client-v3
```

### 5. Start Server
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

### 6. Test Server
```bash
curl http://localhost:5000/
```

---

## Project Structure

```
src/
├── config/
│   ├── database.ts
│   └── auditAccess.ts
├── controllers/
│   ├── authController.ts
│   ├── dashboardController.ts
│   ├── itemController.ts
│   ├── stockController.ts
│   ├── repairController.ts
│   ├── disposalController.ts
│   ├── locationController.ts
│   ├── managerController.ts   # NEW
│   ├── userController.ts
│   └── transactionController.ts
├── middleware/
│   ├── auth.ts
│   └── auditRole.ts
├── models/
│   ├── User.ts
│   ├── Manager.ts             # NEW
│   ├── Item.ts
│   ├── Location.ts
│   ├── Transaction.ts
│   └── RepairTicket.ts
├── routes/
│   ├── auth.ts
│   ├── dashboard.ts
│   ├── items.ts
│   ├── stock.ts
│   ├── repairs.ts
│   ├── disposals.ts
│   ├── locations.ts
│   ├── managers.ts            # NEW
│   ├── users.ts
│   └── transactions.ts
├── utils/
│   ├── emailService.ts
│   ├── notificationService.ts
│   ├── inventoryAlerts.ts
│   └── itemRef.ts
└── server.ts
scripts/
├── migrate-optional-item-fields.js
└── migrate-client-v3.js
```

---

## Testing with Postman

1. **Import Collection**: Create a new Postman collection
2. **Set Base URL**: `http://localhost:5000/api`
3. **Authentication**: 
   - Register/Login to get JWT token
   - Add token to Authorization header for protected routes
4. **Test Order**:
   - Authentication → Locations → Managers → Items → Stock → Repairs → Disposals → Transactions

---

## License

ISC License - Built for StockBuddy Inventory Management System