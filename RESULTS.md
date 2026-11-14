# Measured results

Every number below was measured by JMeter on 14 November 2026 and copied from its own statistics (`dashboard/statistics.json`). Nothing is estimated. Times are in milliseconds.

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

All three runs had **0 errors**. Every assertion passed, including the 5-second response time limit, and every booking made during the runs was cancelled: 5 local + 29 local + 21 deployed, all checked afterwards.

Throughput here reflects one user with think time, not capacity: about 1 request per second locally, and 0.75 per second on the deployed site, where each request takes longer.

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

## Not run yet

The **load**, **stress**, **spike** and **endurance** profiles are built and documented (see README.md), but they were **not executed** in this phase. As agreed, each needs approval first:
- on LOCAL, every profile can run;
- on DEPLOYED, only an approved light load run is allowed (at most 5 users);
- stress, spike and endurance never run there.

Their results will be added here when they are run.

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
