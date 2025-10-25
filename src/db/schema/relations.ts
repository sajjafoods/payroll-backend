import { relations } from "drizzle-orm/relations";
import { organizations, attendanceRecords, employees, users, employeeLeaveBalances, leaveBalanceHistory, organizationSettings, userSessions, employeeSalaryHistory, employeeAdvances, payments, loanInstallmentHistory, paymentAdvanceClearances, paymentLoanInstallments, organizationUsers } from "./schema";

export const attendanceRecordsRelations = relations(attendanceRecords, ({one, many}) => ({
	organization: one(organizations, {
		fields: [attendanceRecords.organizationId],
		references: [organizations.id]
	}),
	employee: one(employees, {
		fields: [attendanceRecords.employeeId],
		references: [employees.id]
	}),
	user_createdByUserId: one(users, {
		fields: [attendanceRecords.createdByUserId],
		references: [users.id],
		relationName: "attendanceRecords_createdByUserId_users_id"
	}),
	user_updatedByUserId: one(users, {
		fields: [attendanceRecords.updatedByUserId],
		references: [users.id],
		relationName: "attendanceRecords_updatedByUserId_users_id"
	}),
	leaveBalanceHistories: many(leaveBalanceHistory),
}));

export const organizationsRelations = relations(organizations, ({one, many}) => ({
	attendanceRecords: many(attendanceRecords),
	employeeLeaveBalances: many(employeeLeaveBalances),
	leaveBalanceHistories: many(leaveBalanceHistory),
	user: one(users, {
		fields: [organizations.createdByUserId],
		references: [users.id]
	}),
	organizationSettings: many(organizationSettings),
	employees: many(employees),
	employeeAdvances: many(employeeAdvances),
	loanInstallmentHistories: many(loanInstallmentHistory),
	payments: many(payments),
	organizationUsers: many(organizationUsers),
}));

export const employeesRelations = relations(employees, ({one, many}) => ({
	attendanceRecords: many(attendanceRecords),
	employeeLeaveBalances: many(employeeLeaveBalances),
	leaveBalanceHistories: many(leaveBalanceHistory),
	organization: one(organizations, {
		fields: [employees.organizationId],
		references: [organizations.id]
	}),
	user: one(users, {
		fields: [employees.createdByUserId],
		references: [users.id]
	}),
	employeeSalaryHistories: many(employeeSalaryHistory),
	employeeAdvances: many(employeeAdvances),
	payments: many(payments),
}));

export const usersRelations = relations(users, ({many}) => ({
	attendanceRecords_createdByUserId: many(attendanceRecords, {
		relationName: "attendanceRecords_createdByUserId_users_id"
	}),
	attendanceRecords_updatedByUserId: many(attendanceRecords, {
		relationName: "attendanceRecords_updatedByUserId_users_id"
	}),
	leaveBalanceHistories: many(leaveBalanceHistory),
	organizations: many(organizations),
	userSessions: many(userSessions),
	employees: many(employees),
	employeeSalaryHistories: many(employeeSalaryHistory),
	employeeAdvances_deletedByUserId: many(employeeAdvances, {
		relationName: "employeeAdvances_deletedByUserId_users_id"
	}),
	employeeAdvances_createdByUserId: many(employeeAdvances, {
		relationName: "employeeAdvances_createdByUserId_users_id"
	}),
	payments_voidedByUserId: many(payments, {
		relationName: "payments_voidedByUserId_users_id"
	}),
	payments_createdByUserId: many(payments, {
		relationName: "payments_createdByUserId_users_id"
	}),
	organizationUsers_userId: many(organizationUsers, {
		relationName: "organizationUsers_userId_users_id"
	}),
	organizationUsers_invitedByUserId: many(organizationUsers, {
		relationName: "organizationUsers_invitedByUserId_users_id"
	}),
}));

export const employeeLeaveBalancesRelations = relations(employeeLeaveBalances, ({one}) => ({
	employee: one(employees, {
		fields: [employeeLeaveBalances.employeeId],
		references: [employees.id]
	}),
	organization: one(organizations, {
		fields: [employeeLeaveBalances.organizationId],
		references: [organizations.id]
	}),
}));

export const leaveBalanceHistoryRelations = relations(leaveBalanceHistory, ({one}) => ({
	organization: one(organizations, {
		fields: [leaveBalanceHistory.organizationId],
		references: [organizations.id]
	}),
	employee: one(employees, {
		fields: [leaveBalanceHistory.employeeId],
		references: [employees.id]
	}),
	attendanceRecord: one(attendanceRecords, {
		fields: [leaveBalanceHistory.attendanceRecordId],
		references: [attendanceRecords.id]
	}),
	user: one(users, {
		fields: [leaveBalanceHistory.changedByUserId],
		references: [users.id]
	}),
}));

export const organizationSettingsRelations = relations(organizationSettings, ({one}) => ({
	organization: one(organizations, {
		fields: [organizationSettings.organizationId],
		references: [organizations.id]
	}),
}));

export const userSessionsRelations = relations(userSessions, ({one}) => ({
	user: one(users, {
		fields: [userSessions.userId],
		references: [users.id]
	}),
}));

export const employeeSalaryHistoryRelations = relations(employeeSalaryHistory, ({one}) => ({
	employee: one(employees, {
		fields: [employeeSalaryHistory.employeeId],
		references: [employees.id]
	}),
	user: one(users, {
		fields: [employeeSalaryHistory.changedByUserId],
		references: [users.id]
	}),
}));

export const employeeAdvancesRelations = relations(employeeAdvances, ({one, many}) => ({
	organization: one(organizations, {
		fields: [employeeAdvances.organizationId],
		references: [organizations.id]
	}),
	employee: one(employees, {
		fields: [employeeAdvances.employeeId],
		references: [employees.id]
	}),
	user_deletedByUserId: one(users, {
		fields: [employeeAdvances.deletedByUserId],
		references: [users.id],
		relationName: "employeeAdvances_deletedByUserId_users_id"
	}),
	user_createdByUserId: one(users, {
		fields: [employeeAdvances.createdByUserId],
		references: [users.id],
		relationName: "employeeAdvances_createdByUserId_users_id"
	}),
	payment: one(payments, {
		fields: [employeeAdvances.clearedByPaymentId],
		references: [payments.id]
	}),
	loanInstallmentHistories: many(loanInstallmentHistory),
	paymentAdvanceClearances: many(paymentAdvanceClearances),
	paymentLoanInstallments: many(paymentLoanInstallments),
}));

export const paymentsRelations = relations(payments, ({one, many}) => ({
	employeeAdvances: many(employeeAdvances),
	loanInstallmentHistories: many(loanInstallmentHistory),
	organization: one(organizations, {
		fields: [payments.organizationId],
		references: [organizations.id]
	}),
	employee: one(employees, {
		fields: [payments.employeeId],
		references: [employees.id]
	}),
	user_voidedByUserId: one(users, {
		fields: [payments.voidedByUserId],
		references: [users.id],
		relationName: "payments_voidedByUserId_users_id"
	}),
	user_createdByUserId: one(users, {
		fields: [payments.createdByUserId],
		references: [users.id],
		relationName: "payments_createdByUserId_users_id"
	}),
	paymentAdvanceClearances: many(paymentAdvanceClearances),
	paymentLoanInstallments: many(paymentLoanInstallments),
}));

export const loanInstallmentHistoryRelations = relations(loanInstallmentHistory, ({one}) => ({
	organization: one(organizations, {
		fields: [loanInstallmentHistory.organizationId],
		references: [organizations.id]
	}),
	employeeAdvance: one(employeeAdvances, {
		fields: [loanInstallmentHistory.loanId],
		references: [employeeAdvances.id]
	}),
	payment: one(payments, {
		fields: [loanInstallmentHistory.paymentId],
		references: [payments.id]
	}),
}));

export const paymentAdvanceClearancesRelations = relations(paymentAdvanceClearances, ({one}) => ({
	payment: one(payments, {
		fields: [paymentAdvanceClearances.paymentId],
		references: [payments.id]
	}),
	employeeAdvance: one(employeeAdvances, {
		fields: [paymentAdvanceClearances.advanceId],
		references: [employeeAdvances.id]
	}),
}));

export const paymentLoanInstallmentsRelations = relations(paymentLoanInstallments, ({one}) => ({
	payment: one(payments, {
		fields: [paymentLoanInstallments.paymentId],
		references: [payments.id]
	}),
	employeeAdvance: one(employeeAdvances, {
		fields: [paymentLoanInstallments.loanId],
		references: [employeeAdvances.id]
	}),
}));

export const organizationUsersRelations = relations(organizationUsers, ({one}) => ({
	organization: one(organizations, {
		fields: [organizationUsers.organizationId],
		references: [organizations.id]
	}),
	user_userId: one(users, {
		fields: [organizationUsers.userId],
		references: [users.id],
		relationName: "organizationUsers_userId_users_id"
	}),
	user_invitedByUserId: one(users, {
		fields: [organizationUsers.invitedByUserId],
		references: [users.id],
		relationName: "organizationUsers_invitedByUserId_users_id"
	}),
}));