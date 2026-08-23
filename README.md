# Queue Management API

## Run locally

Create `backend/.env` with:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/queue-management
JWT_SECRET=replace-with-a-long-random-secret
# Set to true only briefly when you need public registration of admin/doctor/staff accounts.
ALLOW_PUBLIC_STAFF_REGISTRATION=false
```

Then run:

```bash
npm run dev
```

The service exposes `GET /health` for a health check. All endpoints except `POST /api/auth/register`, `POST /api/auth/login`, `/`, and `/health` require:

```http
Authorization: Bearer <token>
```

## Endpoints

| Resource | Method and path | Purpose |
| --- | --- | --- |
| Auth | `POST /api/auth/register` | Register a user with `fullName`, `email`, `password` (8+ characters), and optional `role`. |
| Auth | `POST /api/auth/login` | Sign in with `email` and `password`; returns a JWT. |
| Appointments | `POST /api/appointments` | Patient books an appointment: `doctor`, `date`, `timeSlot`, optional `reason`. A token number is assigned automatically. |
| Appointments | `GET /api/appointments` | Lists appointments appropriate for the signed-in role. Supports `doctor`, `patient` (admin/staff), `date`, and `status` filters. |
| Appointments | `GET /api/appointments/:id` | Gets one appointment when the requester is the patient, doctor, staff member, or admin. |
| Appointments | `PATCH /api/appointments/:id` | Patient may reschedule/cancel; doctor may update `status`; admin/staff may update appointment fields. |
| Queue | `GET /api/queue?doctor=<id>&date=YYYY-MM-DD` | Returns the daily queue and its appointments. |
| Queue | `POST /api/queue/next` | Doctor/admin/staff calls the next patient. Admin/staff include `doctor`; `date` is optional. |
| Schedules | `GET /api/schedules` | Lists schedules; doctors only see their own. Optional `staff` filter. |
| Schedules | `POST /api/schedules` | Creates a schedule with `staff`, `date`, `startTime`, `endTime`, optional `isAvailable`. |
| Schedules | `PATCH` / `DELETE /api/schedules/:id` | Updates or removes a schedule owned by the doctor or managed by admin/staff. |
| Notifications | `GET /api/notifications` | Lists the current user's notifications. |
| Notifications | `POST /api/notifications` | Creates a notification for the current user: `type`, `message`. |
| Notifications | `PATCH /api/notifications/:id/read` | Marks one of the current user's notifications as read. |
| Users | `GET /api/users/doctors` | Returns the available doctors for appointment booking. |
| Users | `GET` / `PATCH /api/users/me` | Retrieves or updates the signed-in user profile. Password changes require `currentPassword` and `newPassword`. |
| Users | `POST /api/users` | Admin-only creation of an admin, doctor, or staff account. |

Valid appointment statuses are `Pending`, `Confirmed`, `Waiting`, `In Consultation`, `Completed`, `Cancelled`, and `No Show`.

For security, public registration always creates a patient account unless `ALLOW_PUBLIC_STAFF_REGISTRATION=true` is explicitly set. Use an admin account and `POST /api/users` to provision doctors and staff in normal operation.
