# Measured results

Every number below was measured by JMeter on 14 and 15 November 2026 and copied from its own statistics (`dashboard/statistics.json`). Nothing is estimated. Times are in milliseconds.

**Setup**
- **JMeter:** 5.6.3, non-GUI mode, Java 21.
- **Load generator:** this PC (AMD Ryzen 5 5500, 32 GB RAM, Windows 11), in the Philippines.
- **LOCAL:** QualityLab `next start` (production build) on this PC with the local PostgreSQL database, so JMeter and the app shared the same CPU.
- **DEPLOYED:** https://quality-lab-jb.vercel.app (Vercel Hobby with a Neon free-plan database).
- **Per virtual user:** one sign-in per module, then repeated journeys with about 1 second of think time before each request. Bookings were created and cancelled straight away.

## Summary

| Run | Target | Users | Duration | Requests | Errors | Average | Median | 90th pct | 95th pct | 99th pct | Throughput |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Smoke (validation) | LOCAL | 1 | 1 min | 57 | 0.00% | 13 ms | 6 ms | 23 ms | 72 ms | 135 ms | 0.979/s |
| Baseline, LOCAL | LOCAL | 1 | 5 min | 298 | 0.00% | 7 ms | 5 ms | 12 ms | 14 ms | 70 ms | 0.995/s |
| Baseline, DEPLOYED | DEPLOYED | 1 | 5 min | 222 | 0.00% | 344 ms | 304 ms | 372 ms | 428 ms | 1686 ms | 0.745/s |
| Load, LOCAL | LOCAL | 10 (ramp 5 min) | 15 min | 7,637 | 0.00% | 5 ms | 3 ms | 9 ms | 10 ms | 46 ms | 8.497/s |
| Stress, LOCAL | LOCAL | 0 → 50 (ramp 20 min) | 25 min | 45,308 | 0.00% | 4 ms | 2 ms | 7 ms | 9 ms | 18 ms | 30.231/s |
| Spike, LOCAL | LOCAL | 2 → 30 → 2 | 5 min | 2,151 | 0.00% | 17 ms | 3 ms | 10 ms | 66 ms | 401 ms | 7.200/s |
| Endurance, LOCAL | LOCAL | 5 | 60 min | 17,771 | 0.00% | 5 ms | 3 ms | 9 ms | 10 ms | 33 ms | 4.939/s |

All seven runs had **0 errors**, and neither auto-stop limit was reached. Every assertion passed, including the 5-second response time limit (enforced from the stress run on, see the correction below).

Every booking made during the runs was cancelled: 21 on the deployed site, and all 7,289 JMeter bookings on LOCAL, checked afterwards. **One limitation:** when a run reaches its time limit, JMeter stops each user where it is, sometimes between "create" and "cancel". The stress, spike and endurance runs left 16 bookings confirmed this way, and they were cancelled by hand afterwards. A tearDown step that cancels leftover test bookings would make this automatic.

**Correction to the response time limit (found during a practice run).** In the runs above, every "Status is 200" check had JMeter's *Ignore Status* option on. That option marks the request as successful again, so the 5-second response time limit could never fail an API request. It is now off, and a 1 ms test limit fails every request as it should. **The results above are still valid:** the slowest response in any run was 1,987 ms, well under 5 seconds, so no request should have failed the limit anyway.

Throughput reflects users with think time, not capacity. Each user sends about 1 request per second, so one user gives about 1 per second locally, 0.75 per second on the deployed site (where each request takes longer), and 10 users about 10 per second. The load run's 8.5 per second is lower than 10 because it includes the 5-minute ramp-up.

## What the numbers say

- **LOCAL is fast.** Typical reads take 4 to 6 ms, and a whole booking journey (create, read, cancel) takes about 30 ms. The highest percentiles come from the three one-time sign-ins (70 to 139 ms), which hash the password on purpose.
- **DEPLOYED:**
  - **Floor.** Most requests take **about 300 ms** (median 304 ms), whatever they do.
  - **Measured right after the run:**
    - connecting to Vercel takes 20 to 35 ms, plus about 95 ms to set up TLS;
    - the API reports 2 ms to its database;
    - the trivial `/health` check still takes about 400 ms end to end.
  - **Inference, not measured directly:** most of the ~300 ms is spent between Vercel's nearby edge and the region where the app's functions run, not in the app or the database.
  - **Occasional slow requests,** up to about 2 s, show in the 95th and 99th percentiles of a few reads (search, product details, account details). These look like cold starts or connection set-up, because the same requests are otherwise around 300 ms. The over-time graphs in the dashboard show when they happened.
- **No defects or errors appeared** at this light load.
- **Load, LOCAL (10 users):** no slowdown under ten times the baseline load.
  - The median fell from 5 ms to 3 ms, and the 95th percentile from 14 ms to 10 ms. A likely reason (not measured) is that the server stays warm with steady traffic.
  - The slowest request after sign-in was 148 ms.
  - Every 30-second interval at full load reached about 10 requests per second, the most that 10 users with think time can send. So this load did not reach the PC's limit; the stress profile is the test for that.
- **Stress, LOCAL (up to 50 users): no breaking point found.** Response times stayed flat, or even improved, as users were added:

  | Minutes | Users (up to) | Requests per second | Average | Slowest | Errors |
  | --- | ---: | ---: | ---: | ---: | ---: |
  | 0–5 | 13 | 6.7 | 7.2 ms | 227 ms | 0 |
  | 5–10 | 26 | 19.1 | 5.0 ms | 159 ms | 0 |
  | 10–15 | 38 | 31.7 | 4.4 ms | 177 ms | 0 |
  | 15–20 | 50 | 44.0 | 4.1 ms | 210 ms | 0 |
  | 20–25 | 50 | 49.5 | 3.5 ms | 173 ms | 0 |

  - At 50 users the app handled about 50 requests per second, again the most these users could send with 1 second of think time.
  - **What this does not show:** the app's real limit. To find it, a later run would need more users or less think time. JMeter and the app share this PC's CPU, so at some point the load generator itself becomes the limit.
  - About 3½ minutes into this run, a thumbnail image was rendered on the same PC for a few seconds. It may account for one of the higher values in the first 5 minutes.
- **Spike, LOCAL (28 users arriving within 5 seconds):** a short slowdown, then full recovery.

  | Seconds | Users | Requests per second | Average | Slowest |
  | --- | --- | ---: | ---: | ---: |
  | 0–110 | 2 | about 2 | 4 ms | 15 ms |
  | **120–130 (the spike)** | 2 → 30 | 21.5 | **127 ms** | **657 ms** |
  | 130–180 | 30 | about 30 | 3–4 ms | 133 ms |
  | 180–300 | 2 | about 2 | 4 ms | 29 ms |

  - The slow requests were the **sign-ins**: 28 users each signed in 3 times at the same moment. Sign-in averaged 216–233 ms in this run (95th percentile about 600 ms), against about 70 ms with one user.
  - **Likely cause (inference, not measured directly):** sign-in hashes the password, which is deliberately slow and CPU-heavy, so many at once compete for the CPU.
  - Once signed in, 30 users were served as fast as 2, and nothing failed.
- **Endurance, LOCAL (5 users for 1 hour): no drift.** Response times stayed level for the whole hour, which suggests no slowdown from leaks or exhausted connections at this load:

  | Minutes | 0–5 | 5–10 | 10–15 | 15–20 | 20–25 | 25–30 | 30–35 | 35–40 | 40–45 | 45–50 | 50–55 | 55–60 |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
  | Average (ms) | 5.7 | 4.5 | 4.5 | 4.6 | 4.5 | 4.4 | 4.9 | 4.5 | 4.9 | 5.4 | 4.6 | 4.4 |
  | Errors | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

  Memory and database connections on the server were not monitored during this run, so this is based on response times only.

The deployed site was only tested lightly (smoke and baseline), by design. Stress, spike and endurance tests are refused there by the runner and by the plan.

## Smoke (validation)

LOCAL http://localhost:3100/api/v1, 1 user, 60 s planned, started 2026-11-14 12:44:02 UTC.

| Request or journey | Samples | Errors % | Average | Median | 90th pct | 95th pct | 99th pct | Throughput /s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Journey - Banking: account details and history | 5 | 0.00 | 13 | 11 | 21 | 21 | 21 | 0.120 |
| Journey - Booking: create, read, cancel | 5 | 0.00 | 35 | 33 | 54 | 54 | 54 | 0.122 |
| Journey - Shop: browse, search, view a product | 6 | 0.00 | 13 | 12 | 20 | 20 | 20 | 0.117 |
| Journey - Travel: search hotels and check a room | 5 | 0.00 | 14 | 9 | 32 | 32 | 32 | 0.122 |
| GET /auth/me | 1 | 0.00 | 8 | 8 | 8 | 8 | 8 | 125.000 |
| GET /bank/accounts | 1 | 0.00 | 69 | 69 | 69 | 69 | 69 | 14.493 |
| GET /bank/accounts/{id} (account details) | 5 | 0.00 | 7 | 6 | 9 | 9 | 9 | 0.120 |
| GET /bank/accounts/{id}/transactions (history) | 5 | 0.00 | 7 | 5 | 13 | 13 | 13 | 0.122 |
| GET /bookings/{id} (details) | 5 | 0.00 | 8 | 7 | 11 | 11 | 11 | 0.124 |
| GET /hotels?destination= (hotel search) | 5 | 0.00 | 5 | 5 | 9 | 9 | 9 | 0.124 |
| GET /products (listing) | 6 | 0.00 | 5 | 5 | 8 | 8 | 8 | 0.116 |
| GET /products?q= (search) | 6 | 0.00 | 4 | 4 | 5 | 5 | 5 | 0.116 |
| GET /products/{id} (details) | 5 | 0.00 | 4 | 4 | 8 | 8 | 8 | 0.120 |
| GET /rooms/{id} (room availability) | 5 | 0.00 | 9 | 5 | 23 | 23 | 23 | 0.122 |
| POST /auth/login (banking) | 1 | 0.00 | 72 | 72 | 72 | 72 | 72 | 13.889 |
| POST /auth/login (ecommerce) | 1 | 0.00 | 135 | 135 | 135 | 135 | 135 | 7.407 |
| POST /auth/login (travel) | 1 | 0.00 | 73 | 73 | 73 | 73 | 73 | 13.699 |
| POST /bookings (create) | 5 | 0.00 | 15 | 12 | 23 | 23 | 23 | 0.124 |
| POST /bookings/{id}/cancel (clean-up) | 5 | 0.00 | 13 | 12 | 20 | 20 | 20 | 0.124 |
| **All requests** | 57 | 0.00 | 13 | 6 | 23 | 72 | 135 | 0.979 |

## Baseline, LOCAL

LOCAL http://localhost:3100/api/v1, 1 user, 300 s planned, started 2026-11-14 12:45:21 UTC.

| Request or journey | Samples | Errors % | Average | Median | 90th pct | 95th pct | 99th pct | Throughput /s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Journey - Banking: account details and history | 29 | 0.00 | 11 | 10 | 13 | 15 | 15 | 0.102 |
| Journey - Booking: create, read, cancel | 29 | 0.00 | 30 | 31 | 36 | 38 | 39 | 0.102 |
| Journey - Shop: browse, search, view a product | 30 | 0.00 | 12 | 11 | 16 | 17 | 17 | 0.103 |
| Journey - Travel: search hotels and check a room | 29 | 0.00 | 10 | 9 | 12 | 17 | 18 | 0.102 |
| GET /auth/me | 1 | 0.00 | 7 | 7 | 7 | 7 | 7 | 142.857 |
| GET /bank/accounts | 1 | 0.00 | 58 | 58 | 58 | 58 | 58 | 17.241 |
| GET /bank/accounts/{id} (account details) | 29 | 0.00 | 5 | 5 | 5 | 7 | 7 | 0.102 |
| GET /bank/accounts/{id}/transactions (history) | 29 | 0.00 | 6 | 6 | 9 | 10 | 10 | 0.102 |
| GET /bookings/{id} (details) | 29 | 0.00 | 6 | 6 | 9 | 10 | 10 | 0.102 |
| GET /hotels?destination= (hotel search) | 29 | 0.00 | 5 | 4 | 6 | 8 | 8 | 0.102 |
| GET /products (listing) | 30 | 0.00 | 4 | 4 | 6 | 7 | 8 | 0.103 |
| GET /products?q= (search) | 30 | 0.00 | 4 | 4 | 5 | 7 | 8 | 0.103 |
| GET /products/{id} (details) | 30 | 0.00 | 4 | 3 | 5 | 6 | 7 | 0.102 |
| GET /rooms/{id} (room availability) | 29 | 0.00 | 5 | 5 | 7 | 9 | 10 | 0.102 |
| POST /auth/login (banking) | 1 | 0.00 | 71 | 71 | 71 | 71 | 71 | 14.085 |
| POST /auth/login (ecommerce) | 1 | 0.00 | 139 | 139 | 139 | 139 | 139 | 7.194 |
| POST /auth/login (travel) | 1 | 0.00 | 70 | 70 | 70 | 70 | 70 | 14.286 |
| POST /bookings (create) | 29 | 0.00 | 13 | 13 | 15 | 19 | 20 | 0.102 |
| POST /bookings/{id}/cancel (clean-up) | 29 | 0.00 | 11 | 11 | 15 | 18 | 18 | 0.102 |
| **All requests** | 298 | 0.00 | 7 | 5 | 12 | 14 | 70 | 0.995 |

## Baseline, DEPLOYED

DEPLOYED https://quality-lab-jb.vercel.app/api/v1, 1 user, 300 s planned, started 2026-11-14 12:50:42 UTC.

| Request or journey | Samples | Errors % | Average | Median | 90th pct | 95th pct | 99th pct | Throughput /s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Journey - Banking: account details and history | 22 | 0.00 | 661 | 610 | 790 | 1296 | 1378 | 0.078 |
| Journey - Booking: create, read, cancel | 21 | 0.00 | 977 | 957 | 1058 | 1209 | 1226 | 0.079 |
| Journey - Shop: browse, search, view a product | 22 | 0.00 | 1103 | 901 | 2118 | 3402 | 3546 | 0.078 |
| Journey - Travel: search hotels and check a room | 22 | 0.00 | 659 | 606 | 767 | 1293 | 1380 | 0.078 |
| GET /auth/me | 1 | 0.00 | 313 | 313 | 313 | 313 | 313 | 3.195 |
| GET /bank/accounts | 1 | 0.00 | 387 | 387 | 387 | 387 | 387 | 2.584 |
| GET /bank/accounts/{id} (account details) | 22 | 0.00 | 337 | 296 | 386 | 973 | 1075 | 0.078 |
| GET /bank/accounts/{id}/transactions (history) | 22 | 0.00 | 323 | 308 | 375 | 511 | 533 | 0.078 |
| GET /bookings/{id} (details) | 21 | 0.00 | 309 | 308 | 326 | 333 | 334 | 0.080 |
| GET /hotels?destination= (hotel search) | 22 | 0.00 | 354 | 301 | 475 | 994 | 1081 | 0.079 |
| GET /products (listing) | 22 | 0.00 | 302 | 299 | 325 | 351 | 355 | 0.079 |
| GET /products?q= (search) | 22 | 0.00 | 433 | 299 | 1175 | 1918 | 1987 | 0.079 |
| GET /products/{id} (details) | 22 | 0.00 | 368 | 300 | 383 | 1532 | 1733 | 0.078 |
| GET /rooms/{id} (room availability) | 22 | 0.00 | 305 | 300 | 326 | 385 | 395 | 0.079 |
| POST /auth/login (banking) | 1 | 0.00 | 410 | 410 | 410 | 410 | 410 | 2.439 |
| POST /auth/login (ecommerce) | 1 | 0.00 | 932 | 932 | 932 | 932 | 932 | 1.073 |
| POST /auth/login (travel) | 1 | 0.00 | 430 | 430 | 430 | 430 | 430 | 2.326 |
| POST /bookings (create) | 21 | 0.00 | 331 | 322 | 368 | 434 | 441 | 0.080 |
| POST /bookings/{id}/cancel (clean-up) | 21 | 0.00 | 338 | 319 | 412 | 600 | 621 | 0.080 |
| **All requests** | 222 | 0.00 | 344 | 304 | 372 | 428 | 1686 | 0.745 |

For a request sent only once per user (the sign-ins, `GET /bank/accounts`, `GET /auth/me`), JMeter's throughput figure is not meaningful.

## Load, LOCAL

LOCAL http://localhost:3100/api/v1, 10 users (ramp-up 300 s), 900 s planned, started 2026-11-14 13:18:29 UTC.

Run by hand with `jmeter.bat` (Phase 5 install guide). The setUp safety sample is left out of these numbers, as in the other runs.

| Request or journey | Samples | Errors % | Average | Median | 90th pct | 95th pct | 99th pct | Throughput /s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Journey - Banking: account details and history | 759 | 0.00 | 8 | 7 | 10 | 12 | 55 | 0.853 |
| Journey - Booking: create, read, cancel | 756 | 0.00 | 24 | 21 | 28 | 33 | 78 | 0.855 |
| Journey - Shop: browse, search, view a product | 763 | 0.00 | 8 | 7 | 10 | 11 | 45 | 0.855 |
| Journey - Travel: search hotels and check a room | 757 | 0.00 | 6 | 6 | 8 | 10 | 16 | 0.852 |
| GET /auth/me | 10 | 0.00 | 4 | 3 | 9 | 10 | 10 | 0.037 |
| GET /bank/accounts | 10 | 0.00 | 9 | 4 | 46 | 51 | 51 | 0.037 |
| GET /bank/accounts/{id} (account details) | 759 | 0.00 | 3 | 3 | 4 | 5 | 11 | 0.853 |
| GET /bank/accounts/{id}/transactions (history) | 758 | 0.00 | 5 | 4 | 6 | 8 | 45 | 0.853 |
| GET /bookings/{id} (details) | 756 | 0.00 | 5 | 4 | 5 | 6 | 49 | 0.855 |
| GET /hotels?destination= (hotel search) | 757 | 0.00 | 3 | 2 | 4 | 4 | 10 | 0.853 |
| GET /products (listing) | 766 | 0.00 | 3 | 2 | 3 | 4 | 7 | 0.857 |
| GET /products?q= (search) | 763 | 0.00 | 3 | 2 | 3 | 4 | 10 | 0.855 |
| GET /products/{id} (details) | 760 | 0.00 | 2 | 2 | 3 | 4 | 6 | 0.853 |
| GET /rooms/{id} (room availability) | 756 | 0.00 | 3 | 3 | 4 | 6 | 11 | 0.855 |
| POST /auth/login (banking) | 10 | 0.00 | 70 | 68 | 85 | 86 | 86 | 0.037 |
| POST /auth/login (ecommerce) | 10 | 0.00 | 75 | 69 | 128 | 134 | 134 | 0.037 |
| POST /auth/login (travel) | 10 | 0.00 | 68 | 68 | 73 | 73 | 73 | 0.037 |
| POST /bookings (create) | 756 | 0.00 | 10 | 9 | 12 | 13 | 41 | 0.855 |
| POST /bookings/{id}/cancel (clean-up) | 756 | 0.00 | 9 | 9 | 11 | 12 | 55 | 0.856 |
| **All requests** | 7637 | 0.00 | 5 | 3 | 9 | 10 | 46 | 8.497 |


## Stress, LOCAL

LOCAL http://localhost:3100/api/v1, 0 to 50 users (ramp-up 1,200 s), 1,500 s planned, auto-stop at 5% errors or a 3 s 95th percentile (not reached), started 2026-11-14 15:40:38 UTC.

| Request or journey | Samples | Errors % | Average | Median | 90th pct | 95th pct | 99th pct | Throughput /s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Journey - Banking: account details and history | 4515 | 0.00 | 7 | 6 | 9 | 12 | 45 | 3.028 |
| Journey - Booking: create, read, cancel | 4488 | 0.00 | 20 | 17 | 25 | 35 | 88 | 3.022 |
| Journey - Shop: browse, search, view a product | 4523 | 0.00 | 7 | 6 | 9 | 12 | 48 | 3.030 |
| Journey - Travel: search hotels and check a room | 4502 | 0.00 | 6 | 5 | 7 | 9 | 28 | 3.024 |
| GET /auth/me | 50 | 0.00 | 3 | 2 | 5 | 11 | 22 | 0.043 |
| GET /bank/accounts | 50 | 0.00 | 7 | 3 | 5 | 7 | 227 | 0.043 |
| GET /bank/accounts/{id} (account details) | 4515 | 0.00 | 3 | 2 | 4 | 5 | 18 | 3.030 |
| GET /bank/accounts/{id}/transactions (history) | 4509 | 0.00 | 4 | 3 | 5 | 6 | 24 | 3.028 |
| GET /bookings/{id} (details) | 4488 | 0.00 | 4 | 3 | 5 | 6 | 25 | 3.020 |
| GET /hotels?destination= (hotel search) | 4502 | 0.00 | 3 | 2 | 3 | 4 | 12 | 3.024 |
| GET /products (listing) | 4528 | 0.00 | 2 | 2 | 3 | 4 | 13 | 3.032 |
| GET /products?q= (search) | 4523 | 0.00 | 2 | 2 | 3 | 4 | 11 | 3.032 |
| GET /products/{id} (details) | 4521 | 0.00 | 2 | 2 | 3 | 3 | 11 | 3.032 |
| GET /rooms/{id} (room availability) | 4497 | 0.00 | 3 | 3 | 4 | 5 | 12 | 3.023 |
| POST /auth/login (banking) | 50 | 0.00 | 75 | 69 | 86 | 90 | 210 | 0.043 |
| POST /auth/login (ecommerce) | 50 | 0.00 | 78 | 71 | 98 | 137 | 204 | 0.043 |
| POST /auth/login (travel) | 50 | 0.00 | 71 | 69 | 79 | 89 | 92 | 0.043 |
| POST /bookings (create) | 4492 | 0.00 | 8 | 7 | 10 | 13 | 45 | 3.022 |
| POST /bookings/{id}/cancel (clean-up) | 4483 | 0.00 | 8 | 6 | 10 | 11 | 48 | 3.019 |
| **All requests** | 45308 | 0.00 | 4 | 2 | 7 | 9 | 18 | 30.231 |

## Spike, LOCAL

LOCAL http://localhost:3100/api/v1, 2 steady users plus 28 spike users after 120 s (arriving within 5 s, staying 60 s), 300 s planned, started 2026-11-14 16:05:44 UTC.

| Request or journey | Samples | Errors % | Average | Median | 90th pct | 95th pct | 99th pct | Throughput /s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Journey - Banking: account details and history | 203 | 0.00 | 8 | 6 | 9 | 11 | 59 | 0.714 |
| Journey - Booking: create, read, cancel | 191 | 0.00 | 22 | 19 | 25 | 36 | 147 | 0.669 |
| Journey - Shop: browse, search, view a product | 211 | 0.00 | 13 | 6 | 9 | 10 | 457 | 0.722 |
| Journey - Travel: search hotels and check a room | 197 | 0.00 | 6 | 5 | 7 | 9 | 12 | 0.692 |
| GET /auth/me | 30 | 0.00 | 59 | 3 | 343 | 476 | 573 | 0.239 |
| GET /bank/accounts | 30 | 0.00 | 145 | 12 | 489 | 560 | 607 | 0.239 |
| GET /bank/accounts/{id} (account details) | 203 | 0.00 | 3 | 3 | 4 | 5 | 26 | 0.713 |
| GET /bank/accounts/{id}/transactions (history) | 200 | 0.00 | 4 | 3 | 5 | 6 | 57 | 0.702 |
| GET /bookings/{id} (details) | 191 | 0.00 | 5 | 3 | 5 | 6 | 47 | 0.669 |
| GET /hotels?destination= (hotel search) | 197 | 0.00 | 2 | 2 | 3 | 4 | 6 | 0.691 |
| GET /products (listing) | 213 | 0.00 | 3 | 2 | 4 | 5 | 54 | 0.728 |
| GET /products?q= (search) | 211 | 0.00 | 5 | 2 | 3 | 4 | 49 | 0.720 |
| GET /products/{id} (details) | 207 | 0.00 | 5 | 2 | 3 | 3 | 224 | 0.728 |
| GET /rooms/{id} (room availability) | 196 | 0.00 | 3 | 3 | 4 | 5 | 9 | 0.687 |
| POST /auth/login (banking) | 30 | 0.00 | 233 | 173 | 510 | 593 | 657 | 0.240 |
| POST /auth/login (ecommerce) | 30 | 0.00 | 226 | 133 | 521 | 604 | 620 | 0.240 |
| POST /auth/login (travel) | 30 | 0.00 | 216 | 154 | 463 | 597 | 603 | 0.239 |
| POST /bookings (create) | 195 | 0.00 | 9 | 9 | 10 | 12 | 29 | 0.683 |
| POST /bookings/{id}/cancel (clean-up) | 188 | 0.00 | 8 | 8 | 10 | 12 | 32 | 0.664 |
| **All requests** | 2151 | 0.00 | 17 | 3 | 10 | 66 | 401 | 7.200 |

## Endurance, LOCAL

LOCAL http://localhost:3100/api/v1, 5 users (ramp-up 60 s), 3,600 s planned, started 2026-11-14 16:10:49 UTC.

| Request or journey | Samples | Errors % | Average | Median | 90th pct | 95th pct | 99th pct | Throughput /s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Journey - Banking: account details and history | 1776 | 0.00 | 9 | 7 | 11 | 14 | 56 | 0.495 |
| Journey - Booking: create, read, cancel | 1773 | 0.00 | 24 | 21 | 28 | 37 | 85 | 0.495 |
| Journey - Shop: browse, search, view a product | 1776 | 0.00 | 8 | 7 | 10 | 11 | 45 | 0.495 |
| Journey - Travel: search hotels and check a room | 1774 | 0.00 | 6 | 6 | 8 | 9 | 15 | 0.495 |
| GET /auth/me | 5 | 0.00 | 3 | 3 | 4 | 4 | 4 | 0.102 |
| GET /bank/accounts | 5 | 0.00 | 4 | 5 | 5 | 5 | 5 | 0.102 |
| GET /bank/accounts/{id} (account details) | 1776 | 0.00 | 4 | 3 | 4 | 6 | 42 | 0.495 |
| GET /bank/accounts/{id}/transactions (history) | 1775 | 0.00 | 5 | 4 | 6 | 8 | 49 | 0.495 |
| GET /bookings/{id} (details) | 1773 | 0.00 | 4 | 4 | 5 | 7 | 40 | 0.495 |
| GET /hotels?destination= (hotel search) | 1774 | 0.00 | 3 | 2 | 3 | 4 | 9 | 0.495 |
| GET /products (listing) | 1777 | 0.00 | 3 | 2 | 3 | 5 | 8 | 0.495 |
| GET /products?q= (search) | 1776 | 0.00 | 3 | 2 | 3 | 4 | 8 | 0.495 |
| GET /products/{id} (details) | 1776 | 0.00 | 2 | 2 | 3 | 3 | 6 | 0.495 |
| GET /rooms/{id} (room availability) | 1773 | 0.00 | 4 | 3 | 4 | 5 | 11 | 0.495 |
| POST /auth/login (banking) | 5 | 0.00 | 70 | 70 | 73 | 73 | 73 | 0.103 |
| POST /auth/login (ecommerce) | 5 | 0.00 | 79 | 73 | 105 | 105 | 105 | 0.104 |
| POST /auth/login (travel) | 5 | 0.00 | 70 | 69 | 72 | 72 | 72 | 0.103 |
| POST /bookings (create) | 1773 | 0.00 | 10 | 9 | 11 | 14 | 56 | 0.495 |
| POST /bookings/{id}/cancel (clean-up) | 1773 | 0.00 | 9 | 9 | 11 | 13 | 49 | 0.495 |
| **All requests** | 17771 | 0.00 | 5 | 3 | 9 | 10 | 33 | 4.939 |
