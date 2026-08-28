# Website Performance Optimization Plan

## 1. Objective

Optimize the website for high-speed, reliable operation while preserving **100% of the existing functionality, visual quality, UX, and feature behavior**.

Current baseline:
- The page renders with **240+ network requests**.
- The optimization effort must reduce unnecessary requests, transferred bytes, duplicated work, database overhead, and rendering overhead.
- Do **not** optimize by removing useful functionality, degrading image/asset quality, weakening UX, or introducing fragile shortcuts.

The existing task remains:

> As of now, the page renders with over 240 requests  
> the main task is to optimize the website to ensure high and rapid functionality without altering or lowering the website quality
>
> - optimize the services and database queries to fetch data more efficiently
> - make sure the number of requests and the size of resources downloaded are stripped down properly to ensure speed, quality, and reliance

The following requirements extend that task and define the engineering standards to use.

---

# 2. Non-Negotiable Rules

### 2.1 Preserve behavior
- Do not remove features merely because they generate requests.
- Do not change business logic unless required to eliminate duplicated or inefficient work.
- Do not reduce image, audio, video, font, or visual quality just to make metrics look better.
- Do not replace accurate data with stale, incomplete, or approximate data.
- Do not introduce client-visible loading regressions.
- Do not break authentication, authorization, caching correctness, personalization, or real-time behavior.

### 2.2 Measure before changing
Establish a performance baseline before making significant changes.

Record at minimum:
- Total request count.
- Total transferred bytes.
- Total resource size.
- Document load time.
- DOMContentLoaded.
- Load event.
- Largest Contentful Paint (LCP).
- Interaction to Next Paint (INP), where measurable.
- Cumulative Layout Shift (CLS).
- Time to First Byte (TTFB).
- API request count.
- API response sizes.
- Database query count.
- Database query duration.
- Slowest queries.
- JavaScript bundle sizes.
- Largest assets.
- Number and size of images/fonts/CSS files.

Take measurements in a clean production-like environment and compare before/after results.

---

# 3. Network Request Optimization

## 3.1 Audit all requests

Categorize every request into:
- HTML/document
- JavaScript
- CSS
- Images
- Fonts
- API calls
- Database-backed API calls
- Third-party scripts
- Analytics
- Tracking
- Icons
- Videos/audio
- Source maps/development-only resources
- Duplicate requests

For every request determine:
1. Why is it needed?
2. Who triggers it?
3. Can it be delayed?
4. Can it be cached?
5. Can it be combined?
6. Can it be eliminated?
7. Can it be made smaller?
8. Is it duplicated elsewhere?

Do not blindly chase a low request count. A single enormous request can be worse than several small, cacheable requests.

## 3.2 Eliminate duplicate requests

Look specifically for:
- The same endpoint requested multiple times during one page load.
- Identical data fetched by multiple components.
- Repeated requests caused by React lifecycle behavior.
- Effects firing unnecessarily.
- Components remounting and refetching.
- Requests triggered by both parent and child components.
- Duplicate authentication/session calls.
- Repeated configuration requests.
- Repeated user/profile/environment/settings calls.

Centralize shared data fetching where appropriate.

Use a client-side query/cache layer if the project architecture supports it, rather than allowing independent components to fetch the same resource.

## 3.3 Avoid request waterfalls

Identify chains such as:

request A -> wait -> request B -> wait -> request C

Where dependencies do not actually exist, initiate independent requests concurrently.

Prefer:

request A
request B
request C
all in parallel

When data genuinely depends on a previous request, keep the dependency but avoid unnecessary intermediate calls.

## 3.4 Batch related requests

Where several small API requests retrieve closely related data:
- Combine them into a purpose-built endpoint when appropriate.
- Return only the data required by that page.
- Avoid creating giant generic endpoints that return the entire database object graph.

The goal is **fewer useful requests**, not simply fewer requests at any cost.

## 3.5 Avoid over-fetching

Never return:
- Entire database entities when only a few fields are needed.
- Large nested relationships unnecessarily.
- Full user objects when only an ID/name/avatar is needed.
- Large arrays when only a summary/count is required.

Use explicit response DTOs/projections.

---

# 4. API / Service Layer Optimization

## 4.1 Optimize service architecture

Audit every service method for:
- Duplicate database calls.
- Sequential queries that could run concurrently.
- Queries repeated within a single request.
- Unnecessary transformations.
- Repeated authorization/user lookups.
- N+1 patterns.
- Expensive computations that can be reused.
- Data fetched and then immediately discarded.

Keep service responsibilities clear while avoiding excessive internal service calls that create database chatter.

## 4.2 Parallelize independent operations

Use concurrent execution for independent I/O operations where safe.

For example, instead of:

fetchUser()
fetchGoals()
fetchEnvironment()
fetchSettings()

sequentially, execute independent operations concurrently.

Do not parallelize operations that have ordering requirements or could create race conditions.

## 4.3 Cache appropriate data

Consider caching:
- Static configuration.
- Public metadata.
- User-independent reference data.
- Frequently accessed expensive queries.
- Computed aggregates that change infrequently.

For user-specific data, ensure cache keys correctly isolate users/tenants.

Every cache must have:
- Clear invalidation rules.
- Appropriate TTL.
- Correct authorization boundaries.
- A fallback when the cache is unavailable.

Do not cache sensitive data in an unsafe client-visible location.

---

# 5. Database Optimization

## 5.1 Find slow queries first

Profile actual database queries.

Identify:
- Highest average duration.
- Highest P95/P99 duration.
- Most frequently executed queries.
- Queries responsible for the most database load.
- Queries returning excessive rows.
- Queries with unnecessary joins.
- Queries performing full-table scans.

Optimize based on measured impact rather than guessing.

## 5.2 Prevent N+1 queries

Look for patterns where:
- One query loads a list.
- Then one query runs for every item in that list.

Replace this with:
- Joins/includes where appropriate.
- Batched queries.
- `IN` queries.
- Aggregation.
- Proper relation loading.
- Purpose-built queries.

## 5.3 Select only required columns

Avoid fetching complete rows when only a subset is needed.

Use database projections/selects.

This reduces:
- Database work.
- Network transfer.
- Serialization cost.
- Application memory.
- JSON response size.

## 5.4 Use indexes correctly

Review indexes for:
- Foreign keys.
- Frequently filtered columns.
- Frequently sorted columns.
- Frequently joined columns.
- Composite filters.

Use query plans such as `EXPLAIN` / `EXPLAIN ANALYZE` where supported.

Do not blindly add indexes to every column. Indexes improve reads but increase storage and write overhead.

## 5.5 Optimize pagination

Never load an entire large table when only the first page is required.

Use appropriate pagination:
- Offset pagination for suitable small/simple datasets.
- Cursor/keyset pagination for large or frequently changing datasets.

Always enforce sensible limits.

## 5.6 Avoid accidental full-table operations

Audit for:
- Unbounded `findMany`/list queries.
- Missing filters.
- Missing limits.
- Sorting large datasets without supporting indexes.
- Loading huge relation trees.
- Repeated count queries where a cached/combined approach is possible.

---

# 6. Frontend Bundle Optimization

## 6.1 Analyze bundle size

Identify:
- Largest JavaScript chunks.
- Largest CSS bundles.
- Duplicate dependencies.
- Libraries that are barely used.
- Dependencies imported globally but only needed on one page.

Remove unused dependencies and imports.

## 6.2 Code splitting

Lazy-load features that are not required for the initial screen.

Examples:
- Settings.
- Admin panels.
- Heavy editors.
- Rarely used modals.
- Large visualization libraries.
- Secondary routes.

Do not lazy-load critical content in a way that makes the initial experience slower.

## 6.3 Tree shaking

Ensure production builds properly eliminate unused code.

Avoid importing entire libraries when a small module/function is sufficient.

## 6.4 Avoid duplicate dependencies

Check whether multiple versions of the same library are included.

Deduplicate where possible.

---

# 7. Asset Optimization

## 7.1 Images

Audit every image.

Use:
- Modern formats such as WebP/AVIF where appropriate.
- Correct dimensions.
- Responsive image sizes.
- Lazy loading for below-the-fold images.
- Eager loading only for critical images.

Do not reduce visual quality unnecessarily.

Do not send a 3000px image to a 200px UI element.

Do not lazy-load the primary above-the-fold image if doing so harms LCP.

## 7.2 Icons

Avoid loading enormous icon libraries when only a few icons are used.

Prefer:
- Individual SVG imports.
- Tree-shakeable icon modules.
- Existing sprite systems where appropriate.

## 7.3 Fonts

Audit:
- Number of font families.
- Number of weights.
- Number of character subsets.
- Font file sizes.

Only ship required weights/styles.

Use appropriate font-display behavior.

Preload only truly critical fonts.

Do not preload every font because browsers are not storage closets.

## 7.4 Static assets

Ensure:
- Compression is enabled.
- Long-lived cache headers are used for fingerprinted assets.
- Immutable assets use content hashes.
- Duplicate assets are removed.
- Source maps are not unnecessarily shipped to end users in production.

---

# 8. HTTP / Browser Caching

Implement appropriate caching at multiple layers.

## Browser caching
Use strong caching for versioned static assets.

## API caching
Where appropriate, use:
- Cache-Control.
- ETags.
- Conditional requests.
- Appropriate TTLs.

Avoid downloading unchanged resources repeatedly.

## Server/CDN caching
Cache static assets and suitable public responses close to users.

Never cache private responses publicly.

Ensure cache invalidation works whenever content changes.

---

# 9. Rendering Optimization

## 9.1 React rendering

Audit:
- Unnecessary component re-renders.
- Expensive calculations on every render.
- Large lists rendered unnecessarily.
- Context providers causing broad re-renders.
- State updates that trigger unrelated parts of the application.

Use memoization selectively.

Do not add `useMemo`, `useCallback`, or `memo` everywhere without evidence that they help.

## 9.2 Large lists

For very large lists, consider virtualization.

Do not render hundreds/thousands of off-screen elements if only a small portion is visible.

## 9.3 Layout stability

Avoid:
- Images without dimensions.
- Late-loading content that shifts layout.
- Dynamically inserted UI without reserved space.

Preserve CLS performance while optimizing loading.

---

# 10. Critical Rendering Path

Prioritize what the user needs to see and interact with immediately.

Critical resources should load first.

Defer:
- Non-critical JavaScript.
- Non-critical images.
- Analytics where appropriate.
- Secondary widgets.
- Below-the-fold resources.

Do not delay critical CSS, critical UI data, or functionality required for immediate interaction.

---

# 11. Third-Party Resources

Audit every third-party dependency.

For each:
- Determine whether it is essential.
- Measure its request count and execution cost.
- Load it only when required.
- Delay non-critical third-party scripts.
- Remove redundant analytics/tracking libraries.
- Avoid multiple libraries doing the same job.

Third-party scripts must not be allowed to silently dominate page performance.

---

# 12. API Response Optimization

Reduce response payloads through:
- DTOs.
- Field selection.
- Pagination.
- Compression.
- Removing redundant properties.
- Avoiding duplicated nested objects.
- Returning IDs/references instead of repeating large objects when appropriate.

Consider separate lightweight endpoints for:
- Lists.
- Summaries.
- Counts.
- Detail pages.

Do not make every endpoint return a massive universal object.

---

# 13. Compression and Transport

Ensure production traffic uses:
- Brotli where supported.
- Gzip fallback where appropriate.
- HTTP/2 or HTTP/3 where available.
- Keep-alive connections.
- Efficient connection reuse.

Verify that compression is actually active rather than assuming the server has developed manners on its own.

---

# 14. Database Connection Efficiency

Review database connection handling.

Ensure:
- Connection pooling is configured appropriately.
- Connections are reused.
- Connections are not repeatedly created/destroyed per request.
- Pool sizes are appropriate for the deployment environment.
- Long-running queries do not unnecessarily occupy connections.

Do not increase pool size blindly. Excessive connections can make the database slower rather than faster.

---

# 15. Server-Side Performance

Audit:
- Middleware executed on every request.
- Authentication/authorization overhead.
- Serialization.
- Logging overhead.
- Repeated configuration loading.
- Expensive synchronous operations.
- CPU-heavy transformations.

Move expensive work away from the critical request path when possible.

Use background processing for work that does not need to block the response.

---

# 16. Reliability Requirements

Performance changes must not make the system fragile.

Every optimization must consider:
- Failure handling.
- Timeouts.
- Retries.
- Cache failure.
- Database failure.
- Partial API failure.
- Race conditions.
- Concurrent requests.
- Authentication boundaries.
- Data consistency.

Do not introduce a performance optimization that creates silent data corruption or stale authorization.

---

# 17. Observability

Add or improve measurements where needed.

Track:
- Endpoint latency.
- Database latency.
- Query frequency.
- Error rates.
- Payload sizes.
- Cache hit/miss rates.
- Request counts.
- Slow requests.
- Slow queries.

Use percentile metrics such as P50, P95, and P99 instead of relying only on averages.

---

# 18. Optimization Priority

Work in this order:

### Phase 1: Baseline
Measure current performance.

### Phase 2: Request audit
Find duplicate, unnecessary, sequential, and oversized requests.

### Phase 3: API/service optimization
Batch related operations, remove duplicate service calls, parallelize independent I/O, and reduce response payloads.

### Phase 4: Database optimization
Fix N+1 queries, add/adjust indexes based on query plans, reduce selected columns, paginate, and optimize expensive queries.

### Phase 5: Frontend optimization
Fix unnecessary fetching/renders, split heavy code, remove duplicate dependencies, and optimize critical rendering.

### Phase 6: Asset optimization
Optimize images, fonts, icons, CSS, JS, and static resource caching without lowering visible quality.

### Phase 7: Caching/CDN/transport
Implement appropriate browser/server caching, compression, and transport optimizations.

### Phase 8: Regression testing
Verify that every major feature still behaves identically.

### Phase 9: Benchmark
Compare before vs after metrics.

---

# 19. Performance Acceptance Criteria

The optimization is considered successful only when there is measurable improvement without functional or visual regression.

At minimum compare:

| Metric | Before | After | Change |
|---|---:|---:|---:|
| Total requests | Record | Record | % |
| Transferred bytes | Record | Record | % |
| Total resource size | Record | Record | % |
| TTFB | Record | Record | % |
| LCP | Record | Record | % |
| INP | Record | Record | % |
| CLS | Record | Record | % |
| API requests | Record | Record | % |
| DB queries/page | Record | Record | % |
| DB query P95 | Record | Record | % |
| JS bundle size | Record | Record | % |

The exact target should be based on the baseline and bottlenecks discovered. Do not fabricate improvements.

---

# 20. Validation Checklist

Before considering the work complete:

- [ ] No important feature was removed.
- [ ] No visual quality was intentionally degraded.
- [ ] No important asset was removed simply to lower request count.
- [ ] Duplicate requests were identified and eliminated where safe.
- [ ] Request waterfalls were minimized.
- [ ] Independent API/database work is parallelized where appropriate.
- [ ] N+1 database queries were eliminated.
- [ ] Queries select only necessary data.
- [ ] Important database filters/joins have appropriate indexes.
- [ ] Large datasets are paginated.
- [ ] API responses are not over-fetching.
- [ ] Static assets are compressed.
- [ ] Images are appropriately sized and modernized without visible quality loss.
- [ ] Fonts are minimized to required variants.
- [ ] Unused JavaScript/dependencies are removed.
- [ ] Heavy non-critical code is lazy-loaded.
- [ ] Browser/server caching is configured correctly.
- [ ] Third-party scripts are audited.
- [ ] Critical resources are prioritized.
- [ ] Production builds are used for benchmarking.
- [ ] Performance is measured before and after.
- [ ] Error rates did not increase.
- [ ] Database load did not increase unexpectedly.
- [ ] Authentication/authorization behavior remains correct.
- [ ] Cache isolation is correct for user-specific data.
- [ ] The final request count and payload size are documented.

---

# 21. Important Engineering Principle

**Do not optimize for the number 240 by itself. Optimize the entire delivery pipeline.**

A page with 100 requests can be slower than a page with 200 requests if those 100 requests are large, uncached, blocking, sequential, or expensive.

The goal is:

**Minimum unnecessary work + minimum unnecessary bytes + minimum unnecessary latency + maximum reuse + preserved quality and correctness.**

Every change should be justified by measurement.

Do not perform speculative optimization simply because a technique is considered "best practice." Profile first, optimize the actual bottleneck, and benchmark again afterward.

The final implementation should be faster because it does less unnecessary work, not because it secretly does less of the work the user asked the website to do.
