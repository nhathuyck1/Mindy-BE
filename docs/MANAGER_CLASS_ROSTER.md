# Manager class roster — 2026-10-11

GET /api/v1/mentor/classes now accepts MENTOR and MANAGER. Mentors see only
assigned classes; managers see all classes. Pagination/status filters and DTO
remain unchanged. GET /api/v1/mentor/classes/:classId/students accepts both roles:
mentors require current assignment, managers may read any existing class.
Unknown classes return 404, other roles remain forbidden. Scope comes exclusively
from the authenticated principal passed by the controller. Manager rows always
return canConfirmCash=false, regardless of matching IDs. Cash confirmation and
admin class mutations retain their existing guards.

Frontend routes: /manager/classes, /manager/classes/:classId/students,
/manager/materials. Materials is only a route/sidebar placeholder at user request.
No database migration is required for this read permission change (MANAGER is
already in UserRole and the restore-manager-role migration).

Live API on 2026-10-11 still returns 403 for the manager class list. These local
changes require deployment; no production configuration/data was changed.

Validation: four permission/controller/service tests and scoped TypeScript check
passed. Full backend build/type-check is blocked by missing existing files-module
dependencies in node_modules. pnpm installation is blocked by this host's Node 24/
pnpm 11 versus repository engines Node 22/pnpm 12.6. No manifest/lock changes.
PostgreSQL integration and live deployment validation remain outstanding.
