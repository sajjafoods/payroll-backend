import { relations } from "drizzle-orm/relations";
import { organizations, organizationSettings } from "./schema";

export const organizationSettingsRelations = relations(organizationSettings, ({one}) => ({
	organization: one(organizations, {
		fields: [organizationSettings.organizationId],
		references: [organizations.id]
	}),
}));

export const organizationsRelations = relations(organizations, ({many}) => ({
	organizationSettings: many(organizationSettings),
}));