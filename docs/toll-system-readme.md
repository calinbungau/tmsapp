# Toll Rate Calculation System - Architecture & Status

## Overview

The Toll Rate Calculation System is a module within the TMS (Transport Management System) that calculates road toll costs for European truck routes. It supports 17 countries with distance-based tolls, vignettes, section-based charges, and special charges (bridges, tunnels).

---

## System Architecture

```
+------------------+     +-------------------+     +--------------------+
|  Toll Calculator |---->| /api/tms/route    |---->| Stadia Maps API    |
|  (UI Component)  |     | (Valhalla proxy)  |     | (hosted Valhalla)  |
+------------------+     +-------------------+     +--------------------+
        |                         |
        |                         | Returns: geometry, distance, duration
        |                         | (NO country/road_class data from Stadia)
        |                         v
        |                 +-------------------+
        |                 | Nominatim Server  |  <-- rvs.bngtracking.ro
        |                 | (self-hosted)     |
        |                 +-------------------+
        |                         |
        |                         | Returns: country_code, road type (motorway/trunk/primary)
        |                         v
        |                 +-------------------+
        +---------------->| /api/tms/toll-rates|---->  Supabase DB
                          | (toll calculation) |      (toll_rates, toll_vignettes, etc.)
                          +-------------------+
```

### Data Flow (Current - Stadia Maps)

1. User enters stops (origin/waypoints/destination) + selects vehicle profile + route type
2. **Valhalla routing** (`/api/tms/route`): Calls Stadia Maps with truck profile (height, weight, width, axle_load) and route strategy (fastest/avoid_tolls/shortest). Returns polyline geometry + total distance/duration.
3. **Country + road type detection** (Nominatim fallback): Samples ~30 points along the route, reverse geocodes each via your Nominatim server to detect country code AND road type (motorway/trunk/primary/other). Needed because Stadia Maps strips `admins` and `road_class` from Valhalla responses.
4. **Toll calculation** (`/api/tms/toll-rates`): For each country segment, queries Supabase for matching toll rates based on vehicle emission class, axle count, CO2 class, weight, and road type. Applies country-specific VAT where applicable.
5. **Results**: Per-country breakdown with toll cost, vignette cost, rate/km, and detailed calculation log.

### Data Flow (Future - Self-Hosted Valhalla)

1. Same as above
2. **Valhalla routing**: Self-hosted Valhalla returns `trip.admins` (country codes) and `road_class` per maneuver with `admin_index`. The route API already extracts this into `country_road_breakdown`.
3. **No Nominatim needed**: The code checks `hasRealCountryData` -- if Valhalla provides real country codes (not "XX"), Nominatim is skipped entirely. Zero external geocoding calls.
4. Same as above
5. Same as above

---

## File Structure

### API Endpoints

| File | Purpose |
|------|---------|
| `app/api/tms/route/route.ts` | Valhalla routing proxy. Calls Stadia Maps (or self-hosted Valhalla) with truck costing options. Decodes polyline6 geometry. Extracts `admins` + `country_road_breakdown` when available. |
| `app/api/tms/toll-rates/route.ts` | Toll calculation engine. Handles CRUD for toll tables + `calculate_tolls` action. Contains country-specific rate finders (AT, DE, HU, generic). Applies VAT per country. |
| `app/api/tms/geocode/route.ts` | Nominatim proxy for forward/reverse geocoding. |

### UI Components

| File | Purpose |
|------|---------|
| `components/tms/toll-calculator.tsx` | Main toll calculator UI. Stop management, vehicle profile, route visualization on Leaflet map, toll results display with per-country breakdown. |
| `components/tms/routing-options.tsx` | Route type selector (Fastest/Avoid Tolls/Shortest) + truck dimensions panel. Exports `fetchValhallaRoute()` helper and `RoutingConfig` type. |

### Other Files Using Valhalla Routing

| File | Purpose |
|------|---------|
| `components/tms/route-map.tsx` | General route map component. Uses Valhalla truck routing for both multi-trip and single-route visualization. |
| `components/tms/fleet-assignment.tsx` | Fleet assignment with route calculation. Uses Valhalla with `use_tolls` parameter for toll avoidance. |
| `app/admin/fsm/tasks/new/page.tsx` | FSM task creation. Uses Valhalla truck routing for task route calculation. |

---

## Database Schema (Toll Tables)

### Core Tables

**`toll_countries`** - Country configuration
- `country_code` (2-letter ISO), `country_name`, `currency`
- `has_distance_based`, `has_vignette`, `has_section_based` (toll type flags)
- `toll_operator`, `toll_operator_url`

**`toll_vehicle_categories`** - Vehicle classification categories
- `category_type`: `emission_class` | `axle_category` | `weight_class` | `co2_class`
- `code`: e.g., `EURO_6`, `AXLE_2`, `W_32T_40T`, `CO2_1`
- Used as foreign keys in toll_rates via `emission_class_id`, `axle_category_id`, etc.

**`toll_rates`** - Distance-based toll rates (main table)
- Links to `toll_country_id`, `emission_class_id`, `axle_category_id`, `co2_class_id`, `weight_class_id`
- Rate components: `infrastructure_rate`, `air_pollution_rate`, `noise_rate`, `co2_surcharge`, `total_per_km`
- `road_type`: `motorway` | `main_road` (used by Hungary for split calculation)
- `valid_from`, `valid_to` for rate versioning

**`toll_vignettes`** - Time-based vignette prices
- `vignette_type`: `daily` | `weekly` | `monthly` | `annual`
- `duration_days`, `price`, `currency`
- `vehicle_type`: `truck` | `car`

**`toll_section_rates`** - Fixed-price road sections (bridges, tunnels)
- `section_name`, `road_number`, `from_location`, `to_location`
- `distance_km`, `price`

**`toll_special_charges`** - Special charges (bridges, tunnels, ferries)
- `charge_type`: `bridge` | `tunnel` | `ferry`
- `location`, `price`, `is_round_trip`

**`toll_rate_history`** - Audit trail for rate changes
**`toll_calculations`** - Saved calculation results (linked to orders)

---

## Country-Specific Logic

### Rate Finder Architecture

The toll calculation API uses **isolated country-specific rate finders** to prevent one country's logic from breaking another:

```
getRateFinder(countryCode) -> findRateAT | findRateDE | findRateHU | findRateSimple
```

| Country | Finder | Matching Logic |
|---------|--------|----------------|
| **AT** (Austria) | `findRateAT` | Axle mapping (5+ -> Cat4+), emission + axle + CO2 + motorway. **+20% VAT applied post-calculation.** |
| **DE** (Germany) | `findRateDE` | Emission + axle + weight + CO2. No VAT (government fee). |
| **HU** (Hungary) | `findRatesHU` | Returns BOTH motorway and main_road rates. When road_types data available from Valhalla/Nominatim, calculates each separately. Rates include 27% VAT already. |
| **All others** | `findRateSimple` | Emission + optional axle. Generic fallback for BG, RO, SI, PL, CZ, SK, FR, IT, ES, HR, PT, NL, SE, DK. |

### Austria Specifics
- ASFINAG publishes NET rates (excl. 20% VAT). Our DB stores net rates.
- The API applies 20% VAT after calculation to get gross (what the driver actually pays).
- `AXLE_5_PLUS` maps to `AXLE_4` (Cat4+ covers 4+ axles in AT).
- CO2 classes affect rates significantly (CO2_1 = highest surcharge, CO2_4 = zero/electric).

### Germany Specifics
- Maut rates are government fees (no VAT).
- Rates vary by emission class + axle count + weight class + CO2 class.
- Toll Collect is the operator.

### Hungary Specifics
- HU-GO published rates include 27% VAT.
- J-categories (J2/J3/J4/J5) map to AXLE_2/3/4/5_PLUS.
- Different rates for motorway vs main_road segments.
- When Valhalla provides road type data, the system calculates motorway and main_road tolls separately for accurate totals.

---

## Seeded Countries & Data (17 Countries)

| Country | Code | Toll Type | Rates Seeded | Notes |
|---------|------|-----------|-------------|-------|
| Austria | AT | Distance + Section | Yes (2026) | ASFINAG GO-Maut, net rates + 20% VAT |
| Germany | DE | Distance | Yes (2026) | Toll Collect, by emission/axle/weight/CO2 |
| Hungary | HU | Distance | Yes (2025) | HU-GO, motorway + main_road rates, 56 rate rows |
| Bulgaria | BG | Distance + Vignette | Yes (2025) | Toll road + e-vignette |
| Romania | RO | Vignette | Yes (2025) | Rovinieta Cat F (>12t 4+ax), 4 duration tiers |
| Slovenia | SI | Distance + Vignette | Yes (2025) | DarsGo, 2-axle + 4-axle variants |
| Poland | PL | Distance | Yes (2025) | e-TOLL, by emission/axle |
| Czech Republic | CZ | Distance | Yes (2025) | CzechTOLL, by emission/axle |
| Slovakia | SK | Distance | Yes (2025) | SkyToll, by emission/axle |
| France | FR | Distance | Yes (2025) | Autoroutes, Class 4 truck rates |
| Italy | IT | Distance | Yes (2025) | Autostrade, per-axle rates |
| Spain | ES | Distance | Yes (2025) | Autopistas, Cat III truck rates |
| Croatia | HR | Distance | Yes (2025) | HAC/ENC, Class IA/II rates |
| Portugal | PT | Distance | Yes (2025) | Via Verde, Class 4 rates |
| Netherlands | NL | Distance | Yes (2025) | Eurovignette rates |
| Sweden | SE | Vignette | Yes (2025) | Eurovignette, 4 duration tiers |
| Denmark | DK | Vignette | Yes (2025) | Eurovignette, 4 duration tiers |

---

## Routing Integration

### Current: Stadia Maps (Hosted Valhalla)

- **API Key**: `STADIA_MAPS_API_KEY` (env var)
- **Free tier**: ~10,000 truck routes/month
- **Endpoint**: `https://api.stadiamaps.com/route/v1`
- **Limitation**: Does NOT return `admins` array or `road_class` per maneuver. Country detection falls back to Nominatim.

### Future: Self-Hosted Valhalla

- **Deployment**: Docker container on same server as Nominatim (`rvs.bngtracking.ro`)
- **RAM**: ~8-16GB for Europe extract
- **Migration**: Change `VALHALLA_BASE` in `/app/api/tms/route/route.ts` from Stadia URL to self-hosted URL. Zero frontend changes.
- **Benefits**: Full `trip.admins` + `road_class` per maneuver. Eliminates Nominatim calls entirely. Unlimited requests. Road class data enables accurate motorway vs main_road split for Hungary.

### Route Strategies

| Strategy | Valhalla Parameter | Use Case |
|----------|-------------------|----------|
| Fastest | `use_tolls: 0.5` (default) | Optimal time, tolls allowed |
| Avoid Tolls | `use_tolls: 0.0` | Minimize toll costs |
| Shortest | `use_tolls: 0.5` + `shortest: true` | Minimum distance |

### Truck Dimensions (Configurable)

| Parameter | Default | Description |
|-----------|---------|-------------|
| Height | 4.0m | Vehicle height |
| Width | 2.55m | Vehicle width |
| Length | 16.5m | Vehicle length (truck + trailer) |
| Weight | 40.0t | Gross vehicle weight |
| Axle Load | 8.0t | Maximum axle load |
| Hazmat | false | Hazardous materials flag |

---

## Migration Scripts (Executed)

| Script | Purpose |
|--------|---------|
| `scripts/create-toll-rate-tables.sql` | Initial schema: toll_countries, toll_vehicle_categories, toll_rates, toll_vignettes, etc. |
| `scripts/seed-toll-rates.sql` | Initial seed: vehicle categories (emission/axle/weight/CO2), AT/DE/HU/RO countries |
| `scripts/seed-toll-rates-data.sql` | Initial rate data for AT/DE/HU/RO |
| `scripts/update-austria-toll-rates-2026.sql` | Updated AT rates to 2026 ASFINAG tariffs with CO2 classes |
| `scripts/update-germany-toll-rates-2026.sql` | Updated DE rates to 2026 Toll Collect tariffs |
| `scripts/update-hungary-toll-rates.sql` | Fixed HU rates: J-category mapping, road_type column, motorway/main_road split |
| `scripts/fix-toll-rate-schema.sql` | Added `road_type` column to toll_rates |
| `scripts/seed-2026-rates-all-countries.sql` | Seeded 14 additional countries (BG, SI, PL, CZ, SK, FR, IT, ES, HR, PT, NL, SE, DK + updated RO) |

---

## What Remains To Be Done

### High Priority

1. **Deploy Self-Hosted Valhalla**
   - Docker container with Europe OSM data on `rvs.bngtracking.ro` (or similar)
   - Change `VALHALLA_BASE` URL in `/app/api/tms/route/route.ts`
   - This will: eliminate Nominatim calls, provide road_class per maneuver, enable accurate motorway/main_road split for HU
   - Test that `trip.admins` is populated in the response

2. **Romania Distance-Based Tolls (RO e-Toll)**
   - Romania launched RO e-Toll (distance-based) in 2024 for trucks >3.5t on motorways
   - Currently we only charge the Rovinieta (vignette) which is for light vehicles
   - Need to add distance-based rates for RO and update `toll_countries.has_distance_based = true`
   - Reference: CNAIR official tariffs

3. **Verify Rate Accuracy Against Reference Tools**
   - Cross-check all country rates against Axe Tollcost, DKV, or UTA toll calculators
   - Known discrepancy: Our AT calculation (232 EUR) matches the reference after VAT fix
   - HU: ~12% difference likely due to motorway/main_road split (will improve with Valhalla road_class data)

### Medium Priority

4. **Section-Based Tolls (Bridges, Tunnels)**
   - `toll_section_rates` and `toll_special_charges` tables exist but are not yet populated
   - Key sections to add: Brenner Pass (AT), Karawanken Tunnel (AT/SI), Arlberg Tunnel (AT), Fetesti Bridge (RO)
   - Need geo-detection logic to determine if route passes through specific sections

5. **Multi-Currency Consolidation**
   - Currently each country returns costs in its local currency
   - The UI shows EUR conversion using hardcoded exchange rates
   - Implement live exchange rate lookup (ECB API or similar)

6. **Save Toll Calculations to Orders**
   - `toll_calculations` table exists and links to `orders`
   - Wire up "Save to Order" button in the toll calculator UI
   - Show toll cost summary on the order detail page

7. **Rate Validity & Versioning**
   - `valid_from` / `valid_to` fields exist on all rate tables
   - Implement date-aware rate lookup (use trip date, not just "latest")
   - Alert admin when rates are approaching expiry

### Low Priority

8. **Toll Cost Optimization**
   - Compare fastest vs avoid_tolls routes and show cost/time tradeoff
   - Factor in fuel savings from shorter routes vs toll costs
   - Consider driver working time regulations (driving hours) in route optimization

9. **Batch Calculation**
   - Calculate tolls for multiple orders/trips at once
   - Monthly toll cost reports per vehicle/driver/route

10. **Admin Rate Management UI**
    - The Rate Tables tab exists but could be enhanced
    - Bulk import/export of rates (CSV/Excel)
    - Rate comparison tool (current vs proposed rates)
    - Automated rate update alerts when official tariffs change

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STADIA_MAPS_API_KEY` | Yes (temporary) | Stadia Maps API key for hosted Valhalla routing |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (used by toll-rates API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key (used by client-side queries) |

### Future Variables (when self-hosting Valhalla)

| Variable | Description |
|----------|-------------|
| `VALHALLA_BASE_URL` | Self-hosted Valhalla URL (e.g., `https://valhalla.bngtracking.ro`). Change in `/app/api/tms/route/route.ts` |

---

## Quick Reference: How to Update Toll Rates

### Adding rates for a new country

1. Add country to `toll_countries` table
2. Add rate rows to `toll_rates` with proper FK references to `toll_vehicle_categories`
3. If vignette country, add rows to `toll_vignettes`
4. Test via the toll calculator UI

### Updating existing rates

1. Create a new SQL migration script in `/scripts/`
2. Deactivate old rates (`SET is_active = false`) or update `valid_to`
3. Insert new rates with updated `valid_from`
4. Execute the script via the v0 SystemAction tool or directly on Supabase
5. Never modify already-executed scripts -- always add new ones

### Adding a country-specific rate finder

1. Create a new `findRateXX()` function in `/app/api/tms/toll-rates/route.ts`
2. Add it to the `getRateFinder()` dispatcher
3. Handle any special logic (VAT, axle mapping, road type split)
