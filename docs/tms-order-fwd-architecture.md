# TMS Order & Forwarding Order Architecture

## Overview
This document describes the data architecture for creating and managing Orders, Forwarding Orders (FWD), Trips, and Trip Legs in the TMS system.

---

## Database Schema Relationships

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CUSTOMER ORDER                                     │
│  (order_type: "customer", commercial_role: "transport_sale")                │
├─────────────────────────────────────────────────────────────────────────────┤
│  - id (uuid)                                                                 │
│  - reference_number (e.g., TMS-20260132)                                    │
│  - customer_id → partners                                                    │
│  - carrier_id → partners (if direct assignment)                             │
│  - execution_trip_id → trips (main execution trip)                          │
│  - status: draft/confirmed/dispatched/completed                             │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ has many
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ORDER_STOPS                                        │
│  (Commercial stops - what customer sees)                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  - id, order_id → orders                                                     │
│  - sequence_order (0, 1, 2...)                                              │
│  - stop_type: loading/unloading/waypoint                                    │
│  - city, address, company_name, lat/lng                                     │
│  - planned_date, planned_time_from/to                                       │
└─────────────────────────────────────────────────────────────────────────────┘

         │
         │ execution via
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TRIPS                                           │
│  (Execution unit - how the order is physically executed)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  - id, reference_number                                                      │
│  - assignment_type: own_fleet/forwarding/mixed                              │
│  - carrier_id → partners (for forwarding trips)                             │
│  - driver_id, vehicle_id, trailer_id (for own fleet)                        │
│  - status: planned/in_progress/completed                                    │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ linked via
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TRIP_ORDERS                                        │
│  (Junction: which orders are on this trip)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  - trip_id → trips                                                           │
│  - order_id → orders                                                         │
└─────────────────────────────────────────────────────────────────────────────┘

         │
         │ has many
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TRIP_STOPS                                         │
│  (Execution stops - actual sequence driver follows)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  - id, trip_id → trips                                                       │
│  - order_stop_id → order_stops (links back to commercial stop)              │
│  - order_id → orders                                                         │
│  - sequence_order (0, 1, 2...)                                              │
│  - Same fields as order_stops (city, address, etc.)                         │
│  - status: pending/arrived/completed                                        │
└─────────────────────────────────────────────────────────────────────────────┘

         │
         │ has many
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TRIP_LEGS                                          │
│  (Segments of execution - who does what part)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  - id, trip_id → trips                                                       │
│  - leg_number (1, 2, 3...)                                                  │
│  - assignment_type: own_fleet/forwarding/undecided                          │
│  - from_stop_index, to_stop_index (indices into trip_stops)                 │
│  - carrier_id → partners (if forwarding)                                    │
│  - driver_id, vehicle_id, trailer_id (if own_fleet)                         │
│  - forwarding_order_id → orders (link to FWD order if subcontract)          │
│  - status: planned/in_progress/completed                                    │
└─────────────────────────────────────────────────────────────────────────────┘

         │
         │ linked via (for forwarding legs)
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      FORWARDING_ORDER_LEGS                                   │
│  (Junction: links parent's trip_leg to FWD order)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  - trip_leg_id → trip_legs (parent order's leg)                             │
│  - forwarding_order_id → orders (the FWD order)                             │
└─────────────────────────────────────────────────────────────────────────────┘

         │
         │ creates
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FORWARDING ORDER                                      │
│  (order_type: "forwarding", commercial_role: "carrier_subcontract")         │
├─────────────────────────────────────────────────────────────────────────────┤
│  - id, reference_number (e.g., VMK-1496)                                    │
│  - parent_order_id → orders (the customer order)                            │
│  - carrier_id → partners (the subcontractor)                                │
│  - customer_id (same as parent for invoicing purposes)                      │
│  - execution_trip_id → trips (FWD order's own trip for execution)           │
│  - status: fwd_assigned/carrier_confirmed/completed                         │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ MUST have (for Stops tab to work)
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FWD ORDER_STOPS                                           │
│  (Copied from parent, ONLY for the leg's portion)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  - order_id → orders (the FWD order ID)                                     │
│  - sequence_order: 0, 1, ... (renumbered from 0)                            │
│  - All stop details copied from parent's order_stops                        │
│  - Only includes stops from leg's from_stop_index to to_stop_index          │
└─────────────────────────────────────────────────────────────────────────────┘

         │
         │ MUST have (for Execution tab to work)
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FWD TRIP + TRIP_STOPS + TRIP_LEGS                         │
│  (FWD order's own execution structure)                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  TRIP:                                                                       │
│    - New trip for the FWD order                                             │
│    - assignment_type: "forwarding"                                          │
│    - carrier_id: the subcontractor                                          │
│                                                                              │
│  TRIP_ORDERS:                                                                │
│    - Links FWD trip to FWD order                                            │
│                                                                              │
│  TRIP_STOPS:                                                                 │
│    - Copied from FWD order_stops (or directly from leg's portion)           │
│    - sequence_order: 0, 1, ...                                              │
│                                                                              │
│  TRIP_LEGS:                                                                  │
│    - Single leg covering entire FWD trip                                    │
│    - from_stop_index: 0, to_stop_index: trip_stops.length - 1               │
│    - carrier_id: the subcontractor                                          │
└─────────────────────────────────────────────────────────────────────────────┘

---

## Creation Flow: Customer Order with Subcontract Execution

### Step 1: Create Customer Order
```javascript
// 1. Create order
const order = await supabase.from("orders").insert({
  order_type: "customer",
  commercial_role: "transport_sale",
  reference_number: "TMS-XXXXXXXX",
  customer_id: selectedCustomerId,
  status: "draft",
}).select().single();

// 2. Create order_stops
const orderStops = stops.map((s, idx) => ({
  order_id: order.id,
  sequence_order: idx,
  stop_type: s.type,
  city: s.city,
  // ... other fields
}));
await supabase.from("order_stops").insert(orderStops);
```

### Step 2: Create Execution (Trip) with Subcontract Assignment
```javascript
// 1. Create trip
const trip = await supabase.from("trips").insert({
  reference_number: `TRIP-${Date.now()}`,
  assignment_type: "forwarding", // or "mixed" if multiple legs
  carrier_id: selectedCarrierId, // the subcontractor
  status: "planned",
}).select().single();

// 2. Link trip to order
await supabase.from("trip_orders").insert({
  trip_id: trip.id,
  order_id: order.id,
});

// 3. Update order with execution_trip_id
await supabase.from("orders").update({
  execution_trip_id: trip.id,
}).eq("id", order.id);

// 4. Create trip_stops (copy from order_stops)
const tripStops = orderStops.map((s, idx) => ({
  trip_id: trip.id,
  order_stop_id: s.id,
  order_id: order.id,
  sequence_order: idx,
  // ... copy all stop fields
}));
await supabase.from("trip_stops").insert(tripStops);

// 5. Create trip_leg for the subcontract portion
const tripLeg = await supabase.from("trip_legs").insert({
  trip_id: trip.id,
  leg_number: 1,
  assignment_type: "forwarding",
  carrier_id: selectedCarrierId,
  from_stop_index: 0,
  to_stop_index: tripStops.length - 1, // whole trip
  status: "planned",
}).select().single();
```

### Step 3: Create Forwarding Order (when "Create New" FWD is selected)
```javascript
// Get parent order with stops
const { data: parentOrder } = await supabase
  .from("orders")
  .select("*, order_stops(*)")
  .eq("id", parentOrderId)
  .single();

// Sort and slice stops for this leg only
const sortedStops = parentOrder.order_stops.sort((a, b) => a.sequence_order - b.sequence_order);
const legStops = sortedStops.slice(leg.from_stop_index, leg.to_stop_index + 1);

// 1. Create FWD order
const fwdOrder = await supabase.from("orders").insert({
  order_type: "forwarding",
  commercial_role: "carrier_subcontract",
  reference_number: "VMK-XXXX", // different series
  parent_order_id: parentOrderId,
  carrier_id: carrierId, // the subcontractor
  customer_id: parentOrder.customer_id,
  status: "fwd_assigned",
  // Copy cargo details
  cargo_description: parentOrder.cargo_description,
  // ...
}).select().single();

// 2. Create FWD order_stops (CRITICAL - needed for Stops tab)
const fwdOrderStops = legStops.map((s, idx) => ({
  order_id: fwdOrder.id, // THE FWD ORDER ID
  sequence_order: idx,   // Renumber from 0
  stop_type: idx === 0 ? "loading" : idx === legStops.length - 1 ? "unloading" : s.stop_type,
  city: s.city,
  address: s.address,
  company_name: s.company_name,
  // ... copy all fields
}));
const { data: insertedStops } = await supabase.from("order_stops").insert(fwdOrderStops).select();

// 3. Create FWD trip (needed for Execution tab)
const fwdTrip = await supabase.from("trips").insert({
  reference_number: `TRIP-FWD-${Date.now()}`,
  assignment_type: "forwarding",
  carrier_id: carrierId,
  status: "planned",
}).select().single();

// 4. Link FWD trip to FWD order
await supabase.from("trip_orders").insert({
  trip_id: fwdTrip.id,
  order_id: fwdOrder.id,
});

// 5. Update FWD order with execution_trip_id
await supabase.from("orders").update({
  execution_trip_id: fwdTrip.id,
}).eq("id", fwdOrder.id);

// 6. Create FWD trip_stops
const fwdTripStops = insertedStops.map((s, idx) => ({
  trip_id: fwdTrip.id,
  order_stop_id: s.id,
  order_id: fwdOrder.id,
  sequence_order: idx,
  // ... copy all fields from s
}));
await supabase.from("trip_stops").insert(fwdTripStops);

// 7. Create FWD trip_leg
await supabase.from("trip_legs").insert({
  trip_id: fwdTrip.id,
  leg_number: 1,
  assignment_type: "forwarding",
  carrier_id: carrierId,
  from_stop_index: 0,
  to_stop_index: fwdTripStops.length - 1,
  status: "planned",
});

// 8. Link parent's trip_leg to FWD order (for display in parent's UI)
await supabase.from("trip_legs").update({
  forwarding_order_id: fwdOrder.id,
}).eq("id", parentLeg.id);

// 9. Create junction link
await supabase.from("forwarding_order_legs").insert({
  trip_leg_id: parentLeg.id,
  forwarding_order_id: fwdOrder.id,
});
```

---

## Key Files in Codebase

### Order Creation
- `/app/admin/tms/orders/new/page.tsx` - New order form with fleet assignment
- `/components/tms/fleet-assignment.tsx` - Trip/leg configuration during order creation

### Order Detail & Execution Management  
- `/components/tms/order-detail-panel.tsx` - Main order view with Execution tab
- `/components/tms/trip-leg-assignment-dialog.tsx` - Dialog for assigning legs (where FWD orders are created)

### Display Components
- Stops tab: Reads from `order_stops` where `order_id = current order`
- Execution tab: Reads from `trips` → `trip_stops` and `trip_legs`
- Route chips: Uses `order_stops` to show origin → destination

---

## Current Bug (as of conversation)

When creating a FWD order from the TripLegAssignmentDialog:
1. FWD order is created OK
2. FWD trip is created OK
3. FWD trip_stops are created OK (shown in Execution Timeline)
4. **FWD order_stops are NOT being created** (Stops tab shows "0 Stops")

The issue is likely that `parentOrder.order_stops` is empty when fetched, OR the insert is failing silently, OR `tripLeg.from_stop_index`/`to_stop_index` are undefined.

### Debug Steps
1. Add console.log before and after each insert
2. Check if `parentOrder.order_stops` has data
3. Verify `tripLeg.from_stop_index` and `tripLeg.to_stop_index` are set correctly  
4. Check for RLS policies that might block the insert

---

## Prompt for New Conversation

Use this prompt to start a fresh conversation:

```
I need help fixing FWD order creation in my TMS system.

CONTEXT:
- When creating a Forwarding Order from a subcontract leg assignment, the FWD order's `order_stops` are NOT being created
- The trip_stops ARE being created (shown in Execution Timeline)
- The Stops tab shows "0 Stops" because order_stops table is empty for the FWD order

ARCHITECTURE:
- See /docs/tms-order-fwd-architecture.md for full data model
- Key file: /components/tms/trip-leg-assignment-dialog.tsx (handleSave function, around line 220-400)
- The FWD order creation happens when fwdOrderMode === "new"

FLOW:
1. User views a customer order (e.g., TMS-20260132)
2. Goes to Execution tab, clicks on a subcontract leg
3. Dialog opens, user selects carrier and "Create New" FWD option
4. On save, FWD order should be created WITH order_stops

DEBUG NEEDED:
1. Check if parentOrder.order_stops is being fetched (should have stops from parent)
2. Check if tripLeg.from_stop_index and to_stop_index are passed correctly
3. Verify the order_stops insert is actually executing

Please add console.log debugging and fix the issue so FWD orders get their order_stops created properly.
```
