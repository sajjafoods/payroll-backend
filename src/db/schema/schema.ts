import { pgTable, varchar, timestamp, text, integer, index, boolean, check, uuid, foreignKey, numeric } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const prismaMigrations = pgTable("_prisma_migrations", {
	id: varchar({ length: 36 }).primaryKey().notNull(),
	checksum: varchar({ length: 64 }).notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	migrationName: varchar("migration_name", { length: 255 }).notNull(),
	logs: text(),
	rolledBackAt: timestamp("rolled_back_at", { withTimezone: true, mode: 'string' }),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	appliedStepsCount: integer("applied_steps_count").default(0).notNull(),
});

export const flywaySchemaHistory = pgTable("flyway_schema_history", {
	installedRank: integer("installed_rank").primaryKey().notNull(),
	version: varchar({ length: 50 }),
	description: varchar({ length: 200 }).notNull(),
	type: varchar({ length: 20 }).notNull(),
	script: varchar({ length: 1000 }).notNull(),
	checksum: integer(),
	installedBy: varchar("installed_by", { length: 100 }).notNull(),
	installedOn: timestamp("installed_on", { mode: 'string' }).defaultNow().notNull(),
	executionTime: integer("execution_time").notNull(),
	success: boolean().notNull(),
}, (table) => [
	index("flyway_schema_history_s_idx").using("btree", table.success.asc().nullsLast().op("bool_ops")),
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
	check("org_settings_payment_schedule_check", sql`(default_payment_schedule)::text = ANY ((ARRAY['daily'::character varying, 'weekly'::character varying, 'biweekly'::character varying, 'monthly'::character varying])::text[])`),
	check("org_settings_working_days_check", sql`(default_working_days >= 20) AND (default_working_days <= 31)`),
	check("org_settings_max_percent_check", sql`((max_advance_percent >= 0) AND (max_advance_percent <= 100)) AND ((max_loan_percent >= 0) AND (max_loan_percent <= 100))`),
	check("org_settings_week_start_check", sql`(week_start_day)::text = ANY ((ARRAY['monday'::character varying, 'sunday'::character varying, 'saturday'::character varying])::text[])`),
]);
