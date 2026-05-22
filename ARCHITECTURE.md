# FleetOps / CameraBNG - Complete Architecture Guide

> **IMPORTANT**: Read this document before making ANY changes to the system.
> Last updated: 2026-02-17

---

## Overview

A fleet management + TMS (Transport Management System) SaaS built with Next.js 16 App Router, Supabase (DB + Storage), and Tailwind CSS v4 with shadcn/ui. Dark theme throughout.

---

## Authentication (CUSTOM - NOT Supabase Auth)

- Admin sessions stored in `localStorage` under key `"admin_session"` (JSON: `{ id, name, email, company_name }`)
- `useAdminSession()` hook (`/hooks/use-admin-session.ts`) returns `{ session, loading }` -- destructure as `{ session: adminSession }`
- Driver sessions use `useDriverSession()` hook with PIN-based login
- User sessions for sub-accounts stored in `user_sessions` table with `session_token`
- **NO Supabase Auth** -- `supabase.auth.getUser()` will always return null
- All DB queries use the Supabase client SDK directly (no RLS based on auth.uid)
- The admin `id` is `a0000000-0000-0000-0000-000000000001` (seeded)

---

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Database**: Supabase PostgreSQL (83 tables)
- **Storage**: Supabase Storage (`documents` bucket)
- **Styling**: Tailwind CSS v4 + shadcn/ui (dark theme)
- **Maps**: Leaflet (via react-leaflet)
- **Charts**: Recharts via shadcn/ui chart components
- **State**: React useState + SWR for data fetching
- **Icons**: Lucide React

---

## File Structure

```
app/
  admin/
    layout.tsx              # Main admin layout with sidebar nav, breadcrumbs, fullscreen detection
    page.tsx                # Admin dashboard
    login/page.tsx          # Admin login

    # --- Fleet & Service Management (FSM) ---
    fsm/
      tasks/page.tsx        # Task list + kanban board
      tasks/new/page.tsx    # Create new task (fullscreen)
      tasks/[id]/page.tsx   # Task detail
      forms/page.tsx        # Form builder + list
      forms/[id]/edit/page.tsx  # Edit form (fullscreen)
      geofences/page.tsx    # Geofence management
      live-map/page.tsx     # Live driver tracking map

    # --- Transport Management (TMS) ---
    tms/
      orders/page.tsx       # All transport orders (table view)
      orders/new/page.tsx   # Create order (fullscreen, AI extraction)
      orders/[id]/page.tsx  # Order detail (uses OrderDetailPanel component)
      planning/page.tsx     # Trip planning / Dispatch board (fullscreen)
      forwarding/page.tsx   # Forwarder pipeline board (kanban, fullscreen)
      reports/page.tsx      # TMS reports
      ai-usage/page.tsx     # AI extraction usage dashboard
      toll-rates/page.tsx   # Toll rate management

    # --- Fleet Assets ---
    drivers/page.tsx        # Driver list
    drivers/[id]/page.tsx   # Driver profile + documents
    vehicles/page.tsx       # Vehicle list
    vehicles/[id]/page.tsx  # Vehicle profile
    trailers/page.tsx       # Trailer list

    # --- Business ---
    business-partners/page.tsx  # Customers, carriers, suppliers

    # --- HR ---
    hr/page.tsx             # HR dashboard with leave management
    employees/page.tsx      # Employee list
    employees/[id]/page.tsx # Employee profile
    departments/page.tsx    # Department management

    # --- Maintenance ---
    maintenance/page.tsx    # Maintenance records
    maintenance/[id]/page.tsx   # Maintenance detail
    maintenance/planning/page.tsx  # Maintenance planning

    # --- Documents & Forms ---
    documents/page.tsx      # Document management
    document-types/page.tsx # Document type config

    # --- Settings ---
    settings/
      page.tsx              # Settings overview
      company/page.tsx      # Company profile (name, address, VAT, logo, bank)
      forwarding/page.tsx   # Forwarder board configurator
      forwarding/template/page.tsx  # Visual order template builder (fullscreen)
      roles/page.tsx        # Role & permission management
      users/page.tsx        # Sub-user management

    # --- Other ---
    chat/page.tsx           # Internal chat system
    notifications/page.tsx  # Notification center
    logs/page.tsx           # Audit logs

  driver-dashboard/         # Separate driver-facing app
    layout.tsx / page.tsx / tasks/ orders/ documents/ maintenance/
    vehicle/ chat/ leave/ forms/ account/

  api/
    auth/login/route.ts     # Custom login API
    tms/
      extract-order/route.ts  # AI order extraction from PDF/image
      geocode/route.ts        # Geocoding
      route/route.ts          # Route calculation (OSRM)
      toll-rates/route.ts     # Toll calculation
    chat/                     # Chat API routes
    notifications/            # Notification dispatch
    traccar/                  # Traccar GPS integration

components/
  tms/
    order-detail-panel.tsx    # Main order detail component
    send-to-carrier-dialog.tsx # "Send to Carrier" dialog with document preview
    fleet-assignment.tsx      # Fleet assignment for trips
    route-map.tsx             # Leaflet map with OSRM routing
    route-history-panel.tsx   # GPS route history
    toll-calculator.tsx       # Toll calculation
    pdf-viewer.tsx            # PDF viewer
    routing-options.tsx       # Routing options
  ui/                         # shadcn/ui components

lib/
  supabase/client.ts          # createClient() for browser-side
  supabase/server.ts          # createServerClient() for server-side
  pdf/generate-forwarding-order.tsx  # PDF/HTML generator for forwarding orders
  utils.ts                    # cn() utility
  types.ts                    # Shared types
  traccar.ts                  # Traccar GPS API
  notifications.ts / notification-engine.ts / admin-notifications.ts

hooks/
  use-admin-session.ts        # Admin session (returns { session, loading })
  use-driver-session.ts       # Driver session
  use-permissions.ts          # Permission checking
  use-mobile.ts / use-toast.ts
```

---

## Admin Layout (`/app/admin/layout.tsx`)

### Sidebar
- Left sidebar with icon buttons (collapsed by default, expands on hover)
- Modules: Dashboard, Fleet, Tasks, Calendar, TMS, Documents, Maintenance, HR, Settings

### Fullscreen Detection
```js
const isFsmFullscreen = pathname.startsWith("/admin/fsm/tasks/new")
  || pathname.startsWith("/admin/tms/orders/new")
  || pathname.startsWith("/admin/tms/planning")
  || pathname.startsWith("/admin/tms/forwarding")
  || pathname.startsWith("/admin/settings/forwarding/template")
  || pathname.match(/\/admin\/fsm\/forms\/.*\/edit/)
  || pathname.match(/\/admin\/tms\/trips\/.*\/edit/);
```

### Breadcrumbs
- Auto-generated from pathname segments
- Label map includes: `template: "Template Builder"`

---

## Key Database Tables

### Core Business
| Table | Key Columns |
|-------|-------------|
| `admins` | id, email, company_name, `forwarder_settings` (JSONB) |
| `company_profiles` | company_name, logo_url, `address_line1`, `address_line2`, city, `state_province`, postal_code, country, vat_number, registration_number, phone, email, website, bank_name, bank_iban, bank_swift, bank_currency, default_currency, order_prefix, order_next_number, invoice_prefix, ai_monthly_limit_usd |
| `users` | email, password_hash, employee_id, role_id, is_owner |
| `user_sessions` | session_token, user_id, expires_at |
| `roles` | name, permissions (JSONB), hierarchy_level |
| `employees` | first_name, last_name, email, department_id, legacy_driver_id |
| `business_partners` | name, `types` (array: customer/carrier/supplier), `address_line1`, `address_line2`, city, country, `state_province`, postal_code, vat_number, `contact_person`, email, phone, bank_iban, bank_swift, bank_name, `payment_terms`, credit_limit |

### Fleet
| Table | Key Columns |
|-------|-------------|
| `drivers` | name, pin_code, phone, license fields, business_partner_id (for subcontractors) |
| `vehicles` | plate_number, make, model, current_odometer |
| `trailers` | plate_number, trailer_type, max_weight_kg |
| `driver_positions` | driver_id, lat, lng, recorded_at |

### TMS - Orders Layer
| Table | Key Columns |
|-------|-------------|
| `orders` | reference_number, `order_type` ('internal'/'forwarding'), `status` (see valid values below), customer_id, carrier_id, customer_price, carrier_cost, margin, `forwarding_checklist` (JSONB), vehicle_id, driver_id, trailer_id, cargo fields, route_geometry, special_instructions |
| `order_stops` | order_id, sequence_order, `stop_type` ('pickup'/'delivery'/'transit'), company_name, address, city, country, lat, lng, planned_date, planned_time_from/to, contact_name, contact_phone |
| `order_status_history` | order_id, from_status, to_status, changed_by |
| `order_activity_log` | order_id, action, details (JSONB), `performed_by_id`, `performed_by_type` |
| `order_documents` | order_id, name, file_url, document_type |
| `order_invoices` | order_id, direction ('incoming'/'outgoing'), amount, status |
| `order_expenses` | order_id, expense_type, amount |
| `order_templates` | admin_id, name, `template_type` ('forwarding_order'/'carrier_order'), `html_template` (JSONB), is_default, is_active |

**Valid order status values**: 'draft', 'confirmed', 'dispatched', 'picked_up', 'in_transit', 'delivered', 'pod_received', 'invoiced', 'completed', 'cancelled'

### TMS - Trips Layer
| Table | Key Columns |
|-------|-------------|
| `trips` | admin_id, vehicle_id, driver_id, trailer_id, status, swap_type, from_stop_index, to_stop_index, route_geometry, distance_km, duration_minutes |
| `trip_stops` | trip_id, order_stop_id, order_id, sequence_order, stop_type, lat, lng, route_to_geometry, distance_to_km |
| `trip_orders` | trip_id, order_id (M2M) |
| `trip_legs` | trip_id, order_id, leg_number, vehicle_id, driver_id |

### FSM
| Table | Key Columns |
|-------|-------------|
| `tasks` | title, status, driver_id, vehicle_id, priority |
| `task_stops` | task_id, sequence_order, lat, lng, address, status |
| `task_assignments` | task_id, driver_id, vehicle_id |
| `task_forms` / `task_form_fields` | Custom forms for tasks |
| `geofences` | name, center_lat, center_lng, radius_meters |

### Other Notable Tables
| Table | Purpose |
|-------|---------|
| `conversations` / `messages` | Internal chat system |
| `notifications` / `notification_queue` | Notification engine |
| `documents` / `document_types` | Document management |
| `toll_countries` / `toll_rates` / `toll_vignettes` | Toll rate system |
| `leave_types` / `leave_requests` / `leave_entitlements` | Leave management |
| `maintenance_types` / `maintenance_records` / `maintenance_costs` | Maintenance system |

---

## Forwarding Module

### Forwarder Board (`/app/admin/tms/forwarding/page.tsx`)
- Fullscreen kanban pipeline: Draft, Confirmed, Allocated, In Transit, Delivered, Completed
- `KANBAN_TO_DB_STATUS` maps UI labels to DB: "Allocated" -> "dispatched", etc.
- Cards: reference, route with country flags, customer, carrier, margin%, checklist progress
- Drag & drop between columns updates order status
- Bottom detail panel: order info, stops timeline, post-delivery checklist
- Checklist items (JSONB in `orders.forwarding_checklist`): documents_received, client_invoiced, documents_sent_client, carrier_payment_due, carrier_paid, client_payment_received
- When all 6 items checked -> auto-advances to "completed"
- Table view alternative, stats bar, filters

### Forwarder Settings (`/app/admin/settings/forwarding/page.tsx`)
- Margin thresholds, default currency, notification toggles
- Link to "Open Template Builder"

### Template Builder (`/app/admin/settings/forwarding/template/page.tsx`)
- Fullscreen visual builder: left A4 preview + right panel
- 14 block types: Company Header, Order Info, Route Summary, Stops Table, Cargo Details, Financial Summary, Carrier Info, Customer Info, Notes/Instructions, Terms & Conditions, Signature Area, Custom Text, Divider, Page Footer
- Blocks reorderable via drag handles, each has configurable properties
- Page settings: font size, primary color, margins, orientation
- Saves to `order_templates.html_template` as JSONB: `{ blocks: [...], pageSettings: { fontSize, primaryColor, margins, orientation } }`
- **KNOWN ISSUES**:
  1. Block properties panel doesn't appear when clicking a block in the list
  2. Only supports single template -- needs multi-template support (create, rename, duplicate, delete, dropdown selector)

### Send to Carrier Dialog (`/components/tms/send-to-carrier-dialog.tsx`)
- Opens from order detail header ("Send to Carrier" button, forwarding orders only)
- Carrier name, template selector, language selector (EN/RO/DE/HU)
- Left: document preview in iframe (scaled A4)
- Buttons: Print/Download PDF, Open in New Window, Send to Carrier
- "Send to Carrier" logs to `order_activity_log`, updates status to "dispatched" if confirmed
- Uses `sm:max-w-[95vw]` to override shadcn's default `sm:max-w-lg`

### PDF Generator (`/lib/pdf/generate-forwarding-order.tsx`)
- `fetchOrderData(orderId)` -- order + customer/carrier FK joins + stops
- `fetchCompanyProfile(adminId)` -- company profile (`.limit(1)` array access)
- `fetchTemplates(adminId)` -- all active order_templates
- `renderBlockHtml(block, data, lang, settings)` -- single block to HTML
- `renderOrderHtml(blocks, data, pageSettings, lang)` -- full paginated document
- `openPrintWindow(html)` -- opens in new window with print toolbar
- Multi-language: EN, RO, DE, HU (all labels translated)

---

## Company Profile (`/app/admin/settings/company/page.tsx`)

### Logo Upload
- Supabase Storage `documents` bucket, path: `company-logos/{adminId}/{timestamp}-{filename}`
- Saved to `company_profiles.logo_url`
- Preview with hover delete, or dashed placeholder

### Fields (matching DB columns exactly)
- company_name, `address_line1`, `address_line2`, city, `state_province`, postal_code, country
- vat_number, registration_number, phone, email, website
- bank_name, bank_iban, bank_swift, bank_currency, default_currency
- order_prefix, order_next_number, order_include_year
- invoice_prefix, invoice_next_number, invoice_include_year
- default_payment_terms_days, ai_monthly_limit_usd, ai_monthly_warning_pct

---

## Order Detail Panel (`/components/tms/order-detail-panel.tsx`)

- Used on `/admin/tms/orders/[id]/page.tsx`
- Header: reference, status badge, "Send to Carrier" (forwarding only), Edit/Save, fullscreen
- Tabs: Overview, Stops, Docs, Invoices, Expenses, Activity, Chat
- Overview: Leaflet route map, commercial info, cargo details
- Activity: timeline from `order_activity_log`

---

## TMS Data Flow

### Order Creation (5-step wizard at `/admin/tms/orders/new/page.tsx`)

```
Step 1: Order Details (customer, prices, cargo)
Step 2: Stops (order_stops with geocoding, OSRM route)
Step 3: Assignment (vehicle, driver, trailer)
Step 4: Review
Step 5: Execution (add EXEC stops: transit, swap, rest, etc.)
  - If swap created: trips split, each gets own vehicle/driver/trailer

Save sequence:
  1. INSERT orders (vehicle_id = Trip 1's vehicle)
  2. INSERT order_stops (ORDER stops only)
  3. For each trip: INSERT trips, trip_stops (ALL stops), trip_orders, trip_legs
  4. Update status
```

### Swap Mechanics

```
BEFORE SWAP (1 trip):
  Trip 1: [Stop A (pickup)] -> [Stop B (delivery)]

AFTER SWAP at Budapest (2 trips):
  Trip 1: [Stop A] -> [Budapest (swap)]  -- Vehicle: MH47ADF
  Trip 2: [Budapest (swap)] -> [Stop B]  -- Vehicle: MH24ADF

KEY RULES:
  - Swap stop appears in BOTH trips
  - orders.vehicle_id = Trip 1's vehicle only
  - Gantt is TRIP-BASED, not order-based
```

### Route Geometry Storage

```
TRIP LEVEL:
  trips.route_geometry = [[lat,lng], ...] (full OSRM polyline)
  trips.distance_km / duration_minutes

STOP LEVEL (per-leg):
  trip_stops.route_to_geometry = [[lat,lng], ...] (from prev stop to this)
  trip_stops.distance_to_km / duration_to_minutes

RULE: Don't recalculate on trip editor load. Use saved geometry.
      Only recalculate when user drags route.
```

---

## Supabase Patterns

### Storage
```ts
// Upload
await supabase.storage.from("documents").upload(path, file);
// Public URL
supabase.storage.from("documents").getPublicUrl(path);
// Delete
await supabase.storage.from("documents").remove([path]);
```

### FK Joins
```ts
// Use column name directly (NOT constraint name)
.select(`*, customer:customer_id(id, name, ...), carrier:carrier_id(id, name, ...)`)
```

---

## Common Patterns & Gotchas

### Authentication
1. Always: `const { session: adminSession } = useAdminSession()` -- NOT `{ adminSession }`
2. Import Supabase from `@/lib/supabase/client` via `createClient()`

### Database Column Names (CRITICAL)
3. `business_partners`: `address_line1` (NOT `address`), `contact_person` (NOT `contact_name`), `state_province` (NOT `state`)
4. `company_profiles`: `address_line1` (NOT `address`), `state_province` (NOT `state`)
5. No `.single()` for optional data -- use `.maybeSingle()` or `.limit(1)` with array access

### Order System
6. Valid DB statuses: 'draft', 'confirmed', 'dispatched', 'picked_up', 'in_transit', 'delivered', 'pod_received', 'invoiced', 'completed', 'cancelled' -- NOT 'allocated' (UI-only kanban label)
7. `orders.vehicle_id` is only Trip 1's vehicle. Never assume all trips use it.
8. `route_geometry` must be a full polyline (hundreds of coords), NOT just stop coordinates
9. EXEC stops (transit, swap) have `order_id: NULL` and `order_stop_id: NULL` in trip_stops
10. Swap stop appears in BOTH trips
11. `trip_stops.sequence_order` is per-trip (1-based), not global
12. Gantt bars are TRIPS, not orders

### UI
13. Dialog width: shadcn DialogContent has default `sm:max-w-lg`. Override with `sm:max-w-[95vw]`
14. Fullscreen routes: Must add to `isFsmFullscreen` in layout.tsx
15. Activity log insert: Must include `performed_by_id` (uuid) and `performed_by_type` ('admin'/'driver')
16. `order_templates.html_template`: JSONB with `{ blocks: [...], pageSettings: {...} }`

---

## What's Working

- Full admin dashboard with sidebar navigation
- Driver dashboard with PIN login
- FSM: tasks, forms, geofences, live map, GPS tracking
- TMS: order CRUD, AI extraction from PDF/image, route planning, trip management, swap mechanics
- Dispatch board with fleet map + Gantt timeline (trip-based)
- Forwarder board with kanban pipeline + post-delivery checklist
- Business partners management
- HR: employees, departments, leave management
- Maintenance scheduling and tracking
- Internal chat system
- Notification engine
- Toll rate management
- Document management
- Company profile with logo upload
- Send to Carrier dialog with document preview + multi-language
- Template builder (visual, with A4 preview)

## Known Issues / TODO


3. **Email Integration**: "Send to Carrier" currently only logs the action + opens print window. SMTP email sending not yet implemented
