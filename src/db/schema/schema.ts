import { pgTable, index, foreignKey, unique, pgPolicy, check, uuid, date, varchar, text, numeric, boolean, timestamp, integer, inet, jsonb, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const attendanceRecords = pgTable("attendance_records", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	employeeId: uuid("employee_id").notNull(),
	date: date().notNull(),
	status: varchar({ length: 20 }).notNull(),
	notes: text(),
	leaveDays: numeric("leave_days", { precision: 3, scale:  1 }),
	leaveType: varchar("leave_type", { length: 20 }),
	isPaidLeave: boolean("is_paid_leave").default(true),
	balanceBefore: numeric("balance_before", { precision: 5, scale:  1 }),
	balanceAfter: numeric("balance_after", { precision: 5, scale:  1 }),
	createdByUserId: uuid("created_by_user_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedByUserId: uuid("updated_by_user_id"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_attendance_created_by").using("btree", table.createdByUserId.asc().nullsLast().op("uuid_ops")),
	index("idx_attendance_employee_date").using("btree", table.employeeId.asc().nullsLast().op("date_ops"), table.date.desc().nullsFirst().op("date_ops")),
	index("idx_attendance_leaves").using("btree", table.organizationId.asc().nullsLast().op("text_ops"), table.leaveType.asc().nullsLast().op("text_ops")).where(sql`((status)::text = 'on_leave'::text)`),
	index("idx_attendance_org_date").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops"), table.date.desc().nullsFirst().op("uuid_ops")),
	index("idx_attendance_org_month").using("btree", sql`organization_id`, sql`EXTRACT(year FROM date)`, sql`EXTRACT(month FROM date)`),
	index("idx_attendance_org_status").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("uuid_ops")),
	index("idx_attendance_paid_leaves").using("btree", table.organizationId.asc().nullsLast().op("bool_ops"), table.isPaidLeave.asc().nullsLast().op("uuid_ops")).where(sql`((status)::text = 'on_leave'::text)`),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "attendance_records_organization_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "attendance_records_employee_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdByUserId],
			foreignColumns: [users.id],
			name: "attendance_records_created_by_user_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.updatedByUserId],
			foreignColumns: [users.id],
			name: "attendance_records_updated_by_user_id_fkey"
		}).onDelete("set null"),
	unique("unique_employee_date").on(table.employeeId, table.date),
	pgPolicy("attendance_org_member_access", { as: "permissive", for: "all", to: ["public"], using: sql`((organization_id IN ( SELECT organization_users.organization_id
   FROM organization_users
  WHERE ((organization_users.user_id = (current_setting('app.current_user_id'::text, true))::uuid) AND (organization_users.is_active = true)))) OR (current_setting('app.bypass_rls'::text, true) = 'true'::text))` }),
	check("attendance_records_status_check", sql`(status)::text = ANY ((ARRAY['present'::character varying, 'absent'::character varying, 'half_day'::character varying, 'on_leave'::character varying])::text[])`),
	check("attendance_records_leave_days_check", sql`leave_days = ANY (ARRAY[0.5, 1.0])`),
	check("attendance_records_leave_type_check", sql`(leave_type)::text = ANY ((ARRAY['casual'::character varying, 'sick'::character varying, 'earned'::character varying, 'unpaid'::character varying, 'other'::character varying])::text[])`),
	check("leave_fields_required", sql`(((status)::text = 'on_leave'::text) AND (leave_days IS NOT NULL) AND (leave_type IS NOT NULL)) OR (((status)::text <> 'on_leave'::text) AND (leave_days IS NULL) AND (leave_type IS NULL) AND (balance_before IS NULL) AND (balance_after IS NULL))`),
]);

export const employeeLeaveBalances = pgTable("employee_leave_balances", {
	employeeId: uuid("employee_id").primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	totalBalance: numeric("total_balance", { precision: 5, scale:  1 }).default('0.0').notNull(),
	accrualType: varchar("accrual_type", { length: 20 }).default('none'),
	accrualRate: numeric("accrual_rate", { precision: 4, scale:  1 }).default('0.0'),
	maxBalance: numeric("max_balance", { precision: 5, scale:  1 }).default('30.0'),
	effectiveFrom: date("effective_from"),
	ytdLeavesTaken: numeric("ytd_leaves_taken", { precision: 5, scale:  1 }).default('0.0').notNull(),
	ytdLeavesAccrued: numeric("ytd_leaves_accrued", { precision: 5, scale:  1 }).default('0.0').notNull(),
	lastAccrualDate: date("last_accrual_date"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_leave_balance_accrual_pending").using("btree", table.lastAccrualDate.asc().nullsLast().op("date_ops"), table.accrualType.asc().nullsLast().op("date_ops")).where(sql`((accrual_type)::text = ANY ((ARRAY['monthly'::character varying, 'annual'::character varying])::text[]))`),
	index("idx_leave_balance_accrual_type").using("btree", table.accrualType.asc().nullsLast().op("text_ops")).where(sql`((accrual_type)::text <> 'none'::text)`),
	index("idx_leave_balance_org").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "employee_leave_balances_employee_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "employee_leave_balances_organization_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("leave_balance_org_member_access", { as: "permissive", for: "all", to: ["public"], using: sql`((organization_id IN ( SELECT organization_users.organization_id
   FROM organization_users
  WHERE ((organization_users.user_id = (current_setting('app.current_user_id'::text, true))::uuid) AND (organization_users.is_active = true)))) OR (current_setting('app.bypass_rls'::text, true) = 'true'::text))` }),
	check("employee_leave_balances_total_balance_check", sql`total_balance >= (0)::numeric`),
	check("employee_leave_balances_accrual_type_check", sql`(accrual_type)::text = ANY ((ARRAY['monthly'::character varying, 'annual'::character varying, 'none'::character varying])::text[])`),
	check("employee_leave_balances_accrual_rate_check", sql`accrual_rate >= (0)::numeric`),
	check("employee_leave_balances_max_balance_check", sql`max_balance > (0)::numeric`),
]);

export const leaveBalanceHistory = pgTable("leave_balance_history", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	employeeId: uuid("employee_id").notNull(),
	attendanceRecordId: uuid("attendance_record_id"),
	changeType: varchar("change_type", { length: 30 }).notNull(),
	balanceBefore: numeric("balance_before", { precision: 5, scale:  1 }).notNull(),
	balanceChange: numeric("balance_change", { precision: 5, scale:  1 }).notNull(),
	balanceAfter: numeric("balance_after", { precision: 5, scale:  1 }).notNull(),
	reason: text().notNull(),
	notes: text(),
	changedByUserId: uuid("changed_by_user_id"),
	changedAt: timestamp("changed_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_balance_history_changed_by").using("btree", table.changedByUserId.asc().nullsLast().op("uuid_ops")),
	index("idx_balance_history_employee").using("btree", table.employeeId.asc().nullsLast().op("timestamptz_ops"), table.changedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_balance_history_org").using("btree", table.organizationId.asc().nullsLast().op("timestamptz_ops"), table.changedAt.desc().nullsFirst().op("uuid_ops")),
	index("idx_balance_history_type").using("btree", table.changeType.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "leave_balance_history_organization_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "leave_balance_history_employee_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.attendanceRecordId],
			foreignColumns: [attendanceRecords.id],
			name: "leave_balance_history_attendance_record_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.changedByUserId],
			foreignColumns: [users.id],
			name: "leave_balance_history_changed_by_user_id_fkey"
		}).onDelete("set null"),
	pgPolicy("balance_history_org_member_access", { as: "permissive", for: "all", to: ["public"], using: sql`((organization_id IN ( SELECT organization_users.organization_id
   FROM organization_users
  WHERE ((organization_users.user_id = (current_setting('app.current_user_id'::text, true))::uuid) AND (organization_users.is_active = true)))) OR (current_setting('app.bypass_rls'::text, true) = 'true'::text))` }),
	check("leave_balance_history_change_type_check", sql`(change_type)::text = ANY ((ARRAY['leave_deduction'::character varying, 'leave_restoration'::character varying, 'accrual'::character varying, 'manual_adjustment'::character varying, 'initial_setup'::character varying, 'bonus'::character varying, 'carry_forward'::character varying])::text[])`),
]);

export const organizations = pgTable("organizations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	displayName: varchar("display_name", { length: 255 }),
	phoneNumber: varchar("phone_number", { length: 20 }),
	email: varchar({ length: 255 }),
	address: text(),
	setupComplete: boolean("setup_complete").default(false).notNull(),
	status: varchar({ length: 20 }).default('active').notNull(),
	businessType: varchar("business_type", { length: 100 }),
	gstin: varchar({ length: 15 }),
	pan: varchar({ length: 10 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	createdByUserId: uuid("created_by_user_id"),
}, (table) => [
	index("idx_organizations_created_by").using("btree", table.createdByUserId.asc().nullsLast().op("uuid_ops")).where(sql`(created_by_user_id IS NOT NULL)`),
	index("idx_organizations_email").using("btree", table.email.asc().nullsLast().op("text_ops")).where(sql`(email IS NOT NULL)`),
	index("idx_organizations_name_search").using("gin", sql`to_tsvector('english'::regconfig, (name)::text)`),
	index("idx_organizations_phone").using("btree", table.phoneNumber.asc().nullsLast().op("text_ops")).where(sql`(phone_number IS NOT NULL)`),
	index("idx_organizations_status").using("btree", table.status.asc().nullsLast().op("text_ops")).where(sql`((status)::text = 'active'::text)`),
	index("idx_organizations_status_created").using("btree", table.status.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.createdByUserId],
			foreignColumns: [users.id],
			name: "fk_organizations_created_by_user"
		}).onDelete("set null"),
	pgPolicy("org_member_access", { as: "permissive", for: "all", to: ["public"], using: sql`((id IN ( SELECT organization_users.organization_id
   FROM organization_users
  WHERE (organization_users.user_id = (current_setting('app.current_user_id'::text, true))::uuid))) OR (current_setting('app.bypass_rls'::text, true) = 'true'::text))` }),
	check("organizations_status_check", sql`(status)::text = ANY ((ARRAY['active'::character varying, 'suspended'::character varying, 'cancelled'::character varying, 'archived'::character varying])::text[])`),
	check("organizations_name_length_check", sql`char_length((name)::text) >= 2`),
	check("organizations_phone_format_check", sql`(phone_number IS NULL) OR ((phone_number)::text ~ '^\+[1-9]\d{1,14}$'::text)`),
	check("organizations_email_format_check", sql`(email IS NULL) OR ((email)::text ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'::text)`),
	check("organizations_gstin_format_check", sql`(gstin IS NULL) OR ((gstin)::text ~ '^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$'::text)`),
	check("organizations_pan_format_check", sql`(pan IS NULL) OR ((pan)::text ~ '^[A-Z]{5}[0-9]{4}[A-Z]{1}$'::text)`),
]);

export const organizationSettings = pgTable("organization_settings", {
	organizationId: uuid("organization_id").primaryKey().notNull(),
	defaultPaymentSchedule: varchar("default_payment_schedule", { length: 20 }).default('monthly'),
	defaultWorkingDays: integer("default_working_days").default(26),
	weekStartDay: varchar("week_start_day", { length: 10 }).default('monday'),
	defaultAnnualLeaves: numeric("default_annual_leaves", { precision: 5, scale:  1 }).default('12.0'),
	leaveAccrualEnabled: boolean("leave_accrual_enabled").default(false),
	maxAdvancePercent: integer("max_advance_percent").default(75),
	maxLoanPercent: integer("max_loan_percent").default(75),
	smsNotifications: boolean("sms_notifications").default(true),
	emailNotifications: boolean("email_notifications").default(false),
	timezone: varchar({ length: 50 }).default('Asia/Kolkata'),
	currency: varchar({ length: 3 }).default('INR'),
	dateFormat: varchar("date_format", { length: 20 }).default('DD/MM/YYYY'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "organization_settings_organization_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("org_settings_member_access", { as: "permissive", for: "all", to: ["public"], using: sql`((organization_id IN ( SELECT organization_users.organization_id
   FROM organization_users
  WHERE (organization_users.user_id = (current_setting('app.current_user_id'::text, true))::uuid))) OR (current_setting('app.bypass_rls'::text, true) = 'true'::text))` }),
	check("org_settings_payment_schedule_check", sql`(default_payment_schedule)::text = ANY ((ARRAY['daily'::character varying, 'weekly'::character varying, 'biweekly'::character varying, 'monthly'::character varying])::text[])`),
	check("org_settings_working_days_check", sql`(default_working_days >= 20) AND (default_working_days <= 31)`),
	check("org_settings_max_percent_check", sql`((max_advance_percent >= 0) AND (max_advance_percent <= 100)) AND ((max_loan_percent >= 0) AND (max_loan_percent <= 100))`),
	check("org_settings_week_start_check", sql`(week_start_day)::text = ANY ((ARRAY['monday'::character varying, 'sunday'::character varying, 'saturday'::character varying])::text[])`),
]);

export const users = pgTable("users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
	phoneVerified: boolean("phone_verified").default(false).notNull(),
	phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true, mode: 'string' }),
	name: varchar({ length: 100 }).notNull(),
	email: varchar({ length: 255 }),
	avatarUrl: text("avatar_url"),
	isActive: boolean("is_active").default(true).notNull(),
	isLocked: boolean("is_locked").default(false).notNull(),
	lockedUntil: timestamp("locked_until", { withTimezone: true, mode: 'string' }),
	lockedReason: varchar("locked_reason", { length: 255 }),
	lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: 'string' }),
	lastLoginIp: inet("last_login_ip"),
	failedLoginAttempts: integer("failed_login_attempts").default(0).notNull(),
	lastFailedLoginAt: timestamp("last_failed_login_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("idx_users_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_users_email").using("btree", table.email.asc().nullsLast().op("text_ops")).where(sql`(email IS NOT NULL)`),
	index("idx_users_is_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")).where(sql`(is_active = true)`),
	index("idx_users_phone").using("btree", table.phoneNumber.asc().nullsLast().op("text_ops")),
	unique("users_phone_number_key").on(table.phoneNumber),
	pgPolicy("user_self_access", { as: "permissive", for: "all", to: ["public"], using: sql`((id = (current_setting('app.current_user_id'::text, true))::uuid) OR (current_setting('app.bypass_rls'::text, true) = 'true'::text))` }),
	check("users_phone_format_check", sql`(phone_number)::text ~ '^\+[1-9]\d{1,14}$'::text`),
	check("users_email_format_check", sql`(email IS NULL) OR ((email)::text ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text)`),
	check("users_name_length_check", sql`(char_length((name)::text) >= 2) AND (char_length((name)::text) <= 100)`),
	check("users_locked_until_check", sql`(locked_until IS NULL) OR ((is_locked = true) AND (locked_until > CURRENT_TIMESTAMP))`),
]);

export const userSessions = pgTable("user_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	refreshTokenHash: varchar("refresh_token_hash", { length: 255 }).notNull(),
	deviceId: varchar("device_id", { length: 255 }),
	deviceName: varchar("device_name", { length: 255 }),
	platform: varchar({ length: 20 }),
	ipAddress: inet("ip_address"),
	userAgent: text("user_agent"),
	isActive: boolean("is_active").default(true).notNull(),
	lastActivityAt: timestamp("last_activity_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
	revokedReason: varchar("revoked_reason", { length: 100 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("idx_sessions_device").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.deviceId.asc().nullsLast().op("uuid_ops")),
	index("idx_sessions_expires_at").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(is_active = true)`),
	index("idx_sessions_last_activity").using("btree", table.lastActivityAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_sessions_refresh_token").using("btree", table.refreshTokenHash.asc().nullsLast().op("text_ops")).where(sql`(is_active = true)`),
	index("idx_sessions_user_active").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.isActive.asc().nullsLast().op("uuid_ops")).where(sql`(is_active = true)`),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_sessions_user_id_fkey"
		}).onDelete("cascade"),
	unique("user_sessions_refresh_token_hash_key").on(table.refreshTokenHash),
	pgPolicy("sessions_self_access", { as: "permissive", for: "all", to: ["public"], using: sql`((user_id = (current_setting('app.current_user_id'::text, true))::uuid) OR (current_setting('app.bypass_rls'::text, true) = 'true'::text))` }),
	check("sessions_platform_check", sql`(platform)::text = ANY ((ARRAY['web'::character varying, 'android'::character varying, 'ios'::character varying])::text[])`),
	check("sessions_expiry_check", sql`expires_at > created_at`),
	check("sessions_revoked_check", sql`(revoked_at IS NULL) OR ((is_active = false) AND (revoked_reason IS NOT NULL))`),
]);

export const otpSessions = pgTable("otp_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
	otpHash: varchar("otp_hash", { length: 255 }).notNull(),
	attempts: integer().default(0).notNull(),
	maxAttempts: integer("max_attempts").default(5).notNull(),
	isVerified: boolean("is_verified").default(false).notNull(),
	verifiedAt: timestamp("verified_at", { withTimezone: true, mode: 'string' }),
	ipAddress: inet("ip_address"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).default(sql`(CURRENT_TIMESTAMP + '00:05:00'::interval)`).notNull(),
}, (table) => [
	index("idx_otp_expires_at").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_otp_phone_active").using("btree", table.phoneNumber.asc().nullsLast().op("text_ops"), table.isVerified.asc().nullsLast().op("text_ops")).where(sql`(is_verified = false)`),
	pgPolicy("otp_sessions_public", { as: "permissive", for: "all", to: ["public"], using: sql`(current_setting('app.bypass_rls'::text, true) = 'true'::text)` }),
	check("otp_expiry_check", sql`expires_at > created_at`),
	check("otp_phone_format_check", sql`(phone_number)::text ~ '^\+[1-9]\d{1,14}$'::text`),
	check("otp_attempts_check", sql`(attempts >= 0) AND (attempts <= max_attempts)`),
	check("otp_verified_check", sql`(verified_at IS NULL) OR ((is_verified = true) AND (verified_at <= CURRENT_TIMESTAMP))`),
]);

export const employees = pgTable("employees", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	createdByUserId: uuid("created_by_user_id"),
	employeeId: varchar("employee_id", { length: 20 }).notNull(),
	name: varchar({ length: 100 }).notNull(),
	phoneNumber: varchar("phone_number", { length: 15 }),
	dateOfJoining: date("date_of_joining").notNull(),
	status: varchar({ length: 20 }).default('active').notNull(),
	terminationDate: date("termination_date"),
	terminationReason: text("termination_reason"),
	salaryType: varchar("salary_type", { length: 20 }).notNull(),
	salary: numeric({ precision: 10, scale:  2 }).notNull(),
	paymentSchedule: varchar("payment_schedule", { length: 20 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("idx_employees_created_by").using("btree", table.createdByUserId.asc().nullsLast().op("uuid_ops")),
	index("idx_employees_date_of_joining").using("btree", table.dateOfJoining.asc().nullsLast().op("date_ops")),
	index("idx_employees_org_active").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("uuid_ops")).where(sql`((status)::text = 'active'::text)`),
	index("idx_employees_org_empid").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops"), table.employeeId.asc().nullsLast().op("uuid_ops")),
	index("idx_employees_org_status").using("btree", table.organizationId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("idx_employees_phone").using("btree", table.phoneNumber.asc().nullsLast().op("text_ops")).where(sql`(phone_number IS NOT NULL)`),
	index("idx_employees_salary").using("btree", table.salary.asc().nullsLast().op("numeric_ops")),
	index("idx_employees_salary_type").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops"), table.salaryType.asc().nullsLast().op("uuid_ops")),
	index("idx_employees_terminated").using("btree", table.organizationId.asc().nullsLast().op("date_ops"), table.terminationDate.asc().nullsLast().op("date_ops")).where(sql`((status)::text = 'terminated'::text)`),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "employees_organization_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdByUserId],
			foreignColumns: [users.id],
			name: "employees_created_by_user_id_fkey"
		}).onDelete("set null"),
	unique("employees_org_empid_unique").on(table.organizationId, table.employeeId),
	pgPolicy("employees_org_member_access", { as: "permissive", for: "all", to: ["public"], using: sql`((organization_id IN ( SELECT organization_users.organization_id
   FROM organization_users
  WHERE ((organization_users.user_id = (current_setting('app.current_user_id'::text, true))::uuid) AND (organization_users.is_active = true)))) OR (current_setting('app.bypass_rls'::text, true) = 'true'::text))` }),
	check("employees_status_check", sql`(status)::text = ANY ((ARRAY['active'::character varying, 'on_leave'::character varying, 'suspended'::character varying, 'terminated'::character varying])::text[])`),
	check("employees_salary_type_check", sql`(salary_type)::text = ANY ((ARRAY['monthly'::character varying, 'daily'::character varying, 'hourly'::character varying])::text[])`),
	check("employees_payment_schedule_check", sql`(payment_schedule)::text = ANY ((ARRAY['monthly'::character varying, 'weekly'::character varying, 'biweekly'::character varying])::text[])`),
	check("employees_salary_positive", sql`(salary >= (0)::numeric) AND (salary <= (10000000)::numeric)`),
	check("employees_termination_logic", sql`(((status)::text = 'terminated'::text) AND (termination_date IS NOT NULL)) OR (((status)::text <> 'terminated'::text) AND (termination_date IS NULL))`),
	check("employees_phone_format", sql`(phone_number IS NULL) OR ((phone_number)::text ~ '^\+91[6-9]\d{9}$'::text)`),
]);

export const employeeSalaryHistory = pgTable("employee_salary_history", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	employeeId: uuid("employee_id").notNull(),
	changedByUserId: uuid("changed_by_user_id"),
	previousSalary: numeric("previous_salary", { precision: 10, scale:  2 }).notNull(),
	newSalary: numeric("new_salary", { precision: 10, scale:  2 }).notNull(),
	previousSalaryType: varchar("previous_salary_type", { length: 20 }).notNull(),
	newSalaryType: varchar("new_salary_type", { length: 20 }).notNull(),
	changeDate: timestamp("change_date", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	reason: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("idx_salary_history_changed_by").using("btree", table.changedByUserId.asc().nullsLast().op("uuid_ops")),
	index("idx_salary_history_employee").using("btree", table.employeeId.asc().nullsLast().op("timestamp_ops"), table.changeDate.desc().nullsFirst().op("timestamp_ops")),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "employee_salary_history_employee_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.changedByUserId],
			foreignColumns: [users.id],
			name: "employee_salary_history_changed_by_user_id_fkey"
		}).onDelete("set null"),
	pgPolicy("salary_history_org_member_access", { as: "permissive", for: "all", to: ["public"], using: sql`((employee_id IN ( SELECT e.id
   FROM (employees e
     JOIN organization_users ou ON ((e.organization_id = ou.organization_id)))
  WHERE ((ou.user_id = (current_setting('app.current_user_id'::text, true))::uuid) AND (ou.is_active = true)))) OR (current_setting('app.bypass_rls'::text, true) = 'true'::text))` }),
	check("salary_history_salary_type_check", sql`((previous_salary_type)::text = ANY ((ARRAY['monthly'::character varying, 'daily'::character varying, 'hourly'::character varying])::text[])) AND ((new_salary_type)::text = ANY ((ARRAY['monthly'::character varying, 'daily'::character varying, 'hourly'::character varying])::text[]))`),
	check("salary_history_salary_positive", sql`(previous_salary >= (0)::numeric) AND (new_salary >= (0)::numeric)`),
]);

export const employeeAdvances = pgTable("employee_advances", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	employeeId: uuid("employee_id").notNull(),
	amount: numeric({ precision: 10, scale:  2 }).notNull(),
	advanceDate: date("advance_date").notNull(),
	advanceType: varchar("advance_type", { length: 20 }).notNull(),
	installments: integer(),
	monthlyInstallment: numeric("monthly_installment", { precision: 10, scale:  2 }),
	interestRate: numeric("interest_rate", { precision: 5, scale:  2 }),
	loanStartDate: date("loan_start_date"),
	status: varchar({ length: 20 }).default('pending').notNull(),
	paidInstallments: integer("paid_installments").default(0),
	remainingBalance: numeric("remaining_balance", { precision: 10, scale:  2 }),
	clearedAt: timestamp("cleared_at", { withTimezone: true, mode: 'string' }),
	clearedByPaymentId: uuid("cleared_by_payment_id"),
	reason: varchar({ length: 500 }),
	notes: text(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	deletedByUserId: uuid("deleted_by_user_id"),
	createdByUserId: uuid("created_by_user_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_advances_active_loans").using("btree", table.employeeId.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("text_ops"), table.advanceType.asc().nullsLast().op("uuid_ops")).where(sql`(((status)::text = 'active'::text) AND ((advance_type)::text = 'loan'::text))`),
	index("idx_advances_cleared_by_payment").using("btree", table.clearedByPaymentId.asc().nullsLast().op("uuid_ops")).where(sql`(cleared_by_payment_id IS NOT NULL)`),
	index("idx_advances_created_by").using("btree", table.createdByUserId.asc().nullsLast().op("uuid_ops")),
	index("idx_advances_employee").using("btree", table.employeeId.asc().nullsLast().op("date_ops"), table.advanceDate.desc().nullsFirst().op("uuid_ops")),
	index("idx_advances_org").using("btree", table.organizationId.asc().nullsLast().op("date_ops"), table.advanceDate.desc().nullsFirst().op("uuid_ops")),
	index("idx_advances_pending").using("btree", table.employeeId.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("uuid_ops")).where(sql`((status)::text = 'pending'::text)`),
	index("idx_advances_status").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("idx_advances_type").using("btree", table.organizationId.asc().nullsLast().op("text_ops"), table.advanceType.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "employee_advances_organization_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "employee_advances_employee_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.deletedByUserId],
			foreignColumns: [users.id],
			name: "employee_advances_deleted_by_user_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.createdByUserId],
			foreignColumns: [users.id],
			name: "employee_advances_created_by_user_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.clearedByPaymentId],
			foreignColumns: [payments.id],
			name: "fk_advances_cleared_by_payment"
		}).onDelete("set null"),
	pgPolicy("advances_org_member_access", { as: "permissive", for: "all", to: ["public"], using: sql`((organization_id IN ( SELECT organization_users.organization_id
   FROM organization_users
  WHERE ((organization_users.user_id = (current_setting('app.current_user_id'::text, true))::uuid) AND (organization_users.is_active = true)))) OR (current_setting('app.bypass_rls'::text, true) = 'true'::text))` }),
	check("loan_fields_required", sql`(((advance_type)::text = 'loan'::text) AND (installments IS NOT NULL) AND (monthly_installment IS NOT NULL) AND (interest_rate IS NOT NULL) AND (loan_start_date IS NOT NULL) AND (remaining_balance IS NOT NULL)) OR (((advance_type)::text = 'advance'::text) AND (installments IS NULL) AND (monthly_installment IS NULL) AND (interest_rate IS NULL) AND (loan_start_date IS NULL))`),
	check("employee_advances_amount_check", sql`(amount > (0)::numeric) AND (amount <= (1000000)::numeric)`),
	check("employee_advances_advance_type_check", sql`(advance_type)::text = ANY ((ARRAY['advance'::character varying, 'loan'::character varying])::text[])`),
	check("employee_advances_installments_check", sql`(installments >= 1) AND (installments <= 60)`),
	check("employee_advances_monthly_installment_check", sql`monthly_installment > (0)::numeric`),
	check("employee_advances_interest_rate_check", sql`(interest_rate >= (0)::numeric) AND (interest_rate <= (36)::numeric)`),
	check("employee_advances_status_check", sql`(status)::text = ANY ((ARRAY['pending'::character varying, 'active'::character varying, 'cleared'::character varying, 'completed'::character varying, 'cancelled'::character varying, 'unrecoverable'::character varying])::text[])`),
	check("employee_advances_paid_installments_check", sql`paid_installments >= 0`),
	check("employee_advances_remaining_balance_check", sql`remaining_balance >= (0)::numeric`),
	check("valid_loan_balance", sql`((advance_type)::text = 'advance'::text) OR (remaining_balance <= amount)`),
]);

export const loanInstallmentHistory = pgTable("loan_installment_history", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	loanId: uuid("loan_id").notNull(),
	paymentId: uuid("payment_id").notNull(),
	installmentNumber: integer("installment_number").notNull(),
	installmentAmount: numeric("installment_amount", { precision: 10, scale:  2 }).notNull(),
	balanceBefore: numeric("balance_before", { precision: 10, scale:  2 }).notNull(),
	balanceAfter: numeric("balance_after", { precision: 10, scale:  2 }).notNull(),
	paidDate: date("paid_date").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_loan_installments_loan").using("btree", table.loanId.asc().nullsLast().op("int4_ops"), table.installmentNumber.asc().nullsLast().op("uuid_ops")),
	index("idx_loan_installments_org_date").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops"), table.paidDate.desc().nullsFirst().op("date_ops")),
	index("idx_loan_installments_payment").using("btree", table.paymentId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "loan_installment_history_organization_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.loanId],
			foreignColumns: [employeeAdvances.id],
			name: "loan_installment_history_loan_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.paymentId],
			foreignColumns: [payments.id],
			name: "fk_loan_installment_payment"
		}).onDelete("cascade"),
	pgPolicy("loan_installments_org_member_access", { as: "permissive", for: "all", to: ["public"], using: sql`((organization_id IN ( SELECT organization_users.organization_id
   FROM organization_users
  WHERE ((organization_users.user_id = (current_setting('app.current_user_id'::text, true))::uuid) AND (organization_users.is_active = true)))) OR (current_setting('app.bypass_rls'::text, true) = 'true'::text))` }),
	check("loan_installment_history_installment_number_check", sql`installment_number > 0`),
	check("loan_installment_history_installment_amount_check", sql`installment_amount > (0)::numeric`),
	check("valid_balance_change", sql`balance_before > balance_after`),
	check("valid_installment_amount", sql`(balance_before - balance_after) = installment_amount`),
]);

export const payments = pgTable("payments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull(),
	employeeId: uuid("employee_id").notNull(),
	amount: numeric({ precision: 10, scale:  2 }).notNull(),
	paymentDate: date("payment_date").notNull(),
	paymentMethod: varchar("payment_method", { length: 20 }).default('cash'),
	periodStart: date("period_start"),
	periodEnd: date("period_end"),
	receiptNumber: varchar("receipt_number", { length: 50 }).notNull(),
	calculationSnapshot: jsonb("calculation_snapshot"),
	notes: text(),
	status: varchar({ length: 20 }).default('completed').notNull(),
	voidedAt: timestamp("voided_at", { withTimezone: true, mode: 'string' }),
	voidedByUserId: uuid("voided_by_user_id"),
	voidReason: text("void_reason"),
	createdByUserId: uuid("created_by_user_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_payments_completed").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops"), table.employeeId.asc().nullsLast().op("date_ops"), table.paymentDate.desc().nullsFirst().op("uuid_ops")).where(sql`((status)::text = 'completed'::text)`),
	index("idx_payments_created_by").using("btree", table.createdByUserId.asc().nullsLast().op("uuid_ops")),
	index("idx_payments_employee").using("btree", table.employeeId.asc().nullsLast().op("uuid_ops"), table.paymentDate.desc().nullsFirst().op("uuid_ops")),
	index("idx_payments_method").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops"), table.paymentMethod.asc().nullsLast().op("uuid_ops")),
	index("idx_payments_org").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops"), table.paymentDate.desc().nullsFirst().op("date_ops")),
	index("idx_payments_period").using("btree", table.organizationId.asc().nullsLast().op("date_ops"), table.periodStart.asc().nullsLast().op("uuid_ops"), table.periodEnd.asc().nullsLast().op("date_ops")),
	index("idx_payments_receipt").using("btree", table.organizationId.asc().nullsLast().op("text_ops"), table.receiptNumber.asc().nullsLast().op("uuid_ops")),
	index("idx_payments_status").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "payments_organization_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "payments_employee_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.voidedByUserId],
			foreignColumns: [users.id],
			name: "payments_voided_by_user_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.createdByUserId],
			foreignColumns: [users.id],
			name: "payments_created_by_user_id_fkey"
		}).onDelete("set null"),
	unique("unique_receipt_per_org").on(table.organizationId, table.receiptNumber),
	pgPolicy("payments_org_member_access", { as: "permissive", for: "all", to: ["public"], using: sql`((organization_id IN ( SELECT organization_users.organization_id
   FROM organization_users
  WHERE ((organization_users.user_id = (current_setting('app.current_user_id'::text, true))::uuid) AND (organization_users.is_active = true)))) OR (current_setting('app.bypass_rls'::text, true) = 'true'::text))` }),
	check("payments_amount_check", sql`amount > (0)::numeric`),
	check("payments_payment_method_check", sql`(payment_method)::text = ANY ((ARRAY['cash'::character varying, 'bank_transfer'::character varying, 'cheque'::character varying, 'upi'::character varying, 'other'::character varying])::text[])`),
	check("payments_status_check", sql`(status)::text = ANY ((ARRAY['completed'::character varying, 'voided'::character varying])::text[])`),
	check("valid_period", sql`(period_end IS NULL) OR (period_start IS NULL) OR (period_end >= period_start)`),
	check("void_info_required", sql`(((status)::text = 'voided'::text) AND (voided_at IS NOT NULL) AND (void_reason IS NOT NULL)) OR (((status)::text = 'completed'::text) AND (voided_at IS NULL) AND (void_reason IS NULL))`),
]);

export const paymentAdvanceClearances = pgTable("payment_advance_clearances", {
	paymentId: uuid("payment_id").notNull(),
	advanceId: uuid("advance_id").notNull(),
	amountCleared: numeric("amount_cleared", { precision: 10, scale:  2 }).notNull(),
	clearedAt: timestamp("cleared_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_payment_advances_advance").using("btree", table.advanceId.asc().nullsLast().op("uuid_ops")),
	index("idx_payment_advances_payment").using("btree", table.paymentId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.paymentId],
			foreignColumns: [payments.id],
			name: "payment_advance_clearances_payment_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.advanceId],
			foreignColumns: [employeeAdvances.id],
			name: "payment_advance_clearances_advance_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.paymentId, table.advanceId], name: "payment_advance_clearances_pkey"}),
	pgPolicy("payment_advances_org_member_access", { as: "permissive", for: "all", to: ["public"], using: sql`((payment_id IN ( SELECT payments.id
   FROM payments
  WHERE (payments.organization_id IN ( SELECT organization_users.organization_id
           FROM organization_users
          WHERE ((organization_users.user_id = (current_setting('app.current_user_id'::text, true))::uuid) AND (organization_users.is_active = true)))))) OR (current_setting('app.bypass_rls'::text, true) = 'true'::text))` }),
	check("payment_advance_clearances_amount_cleared_check", sql`amount_cleared > (0)::numeric`),
]);

export const paymentLoanInstallments = pgTable("payment_loan_installments", {
	paymentId: uuid("payment_id").notNull(),
	loanId: uuid("loan_id").notNull(),
	installmentNumber: integer("installment_number").notNull(),
	installmentAmount: numeric("installment_amount", { precision: 10, scale:  2 }).notNull(),
	balanceBefore: numeric("balance_before", { precision: 10, scale:  2 }).notNull(),
	balanceAfter: numeric("balance_after", { precision: 10, scale:  2 }).notNull(),
	paidAt: timestamp("paid_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_payment_loans_loan").using("btree", table.loanId.asc().nullsLast().op("uuid_ops")),
	index("idx_payment_loans_payment").using("btree", table.paymentId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.paymentId],
			foreignColumns: [payments.id],
			name: "payment_loan_installments_payment_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.loanId],
			foreignColumns: [employeeAdvances.id],
			name: "payment_loan_installments_loan_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.paymentId, table.loanId], name: "payment_loan_installments_pkey"}),
	pgPolicy("payment_loans_org_member_access", { as: "permissive", for: "all", to: ["public"], using: sql`((payment_id IN ( SELECT payments.id
   FROM payments
  WHERE (payments.organization_id IN ( SELECT organization_users.organization_id
           FROM organization_users
          WHERE ((organization_users.user_id = (current_setting('app.current_user_id'::text, true))::uuid) AND (organization_users.is_active = true)))))) OR (current_setting('app.bypass_rls'::text, true) = 'true'::text))` }),
	check("payment_loan_installments_installment_number_check", sql`installment_number > 0`),
	check("payment_loan_installments_installment_amount_check", sql`installment_amount > (0)::numeric`),
]);

export const organizationUsers = pgTable("organization_users", {
	organizationId: uuid("organization_id").notNull(),
	userId: uuid("user_id").notNull(),
	role: varchar({ length: 20 }).notNull(),
	permissions: jsonb().notNull(),
	invitedByUserId: uuid("invited_by_user_id"),
	invitedAt: timestamp("invited_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	joinedAt: timestamp("joined_at", { withTimezone: true, mode: 'string' }),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("idx_org_users_org_id_active").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops"), table.isActive.asc().nullsLast().op("bool_ops")).where(sql`(is_active = true)`),
	index("idx_org_users_permissions").using("gin", table.permissions.asc().nullsLast().op("jsonb_ops")),
	index("idx_org_users_role").using("btree", table.role.asc().nullsLast().op("text_ops")),
	index("idx_org_users_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
			name: "organization_users_organization_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "organization_users_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.invitedByUserId],
			foreignColumns: [users.id],
			name: "organization_users_invited_by_user_id_fkey"
		}).onDelete("set null"),
	primaryKey({ columns: [table.organizationId, table.userId], name: "organization_users_pkey"}),
	pgPolicy("org_users_member_access", { as: "permissive", for: "all", to: ["public"], using: sql`((organization_id IN ( SELECT organization_users_1.organization_id
   FROM organization_users organization_users_1
  WHERE ((organization_users_1.user_id = (current_setting('app.current_user_id'::text, true))::uuid) AND (organization_users_1.is_active = true)))) OR (current_setting('app.bypass_rls'::text, true) = 'true'::text))` }),
	check("org_users_role_check", sql`(role)::text = ANY ((ARRAY['owner'::character varying, 'hr_manager'::character varying, 'accountant'::character varying])::text[])`),
	check("org_users_permissions_structure_check", sql`(jsonb_typeof(permissions) = 'object'::text) AND (permissions ? 'employees'::text) AND (permissions ? 'attendance'::text) AND (permissions ? 'leaves'::text) AND (permissions ? 'payroll'::text) AND (permissions ? 'payments'::text) AND (permissions ? 'advances'::text) AND (permissions ? 'loans'::text) AND (permissions ? 'reports'::text)`),
]);
