import { pgTable, foreignKey, pgPolicy, check, uuid, text, integer, jsonb, timestamp, boolean, index, real, uniqueIndex, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { users } from "../auth"



export const profiles = pgTable("profiles", {
	userId: uuid("user_id").primaryKey().notNull(),
	name: text().default('').notNull(),
	avatarUrl: text("avatar_url"),
	role: text(),
	language: text(),
	timezone: text().default('Asia/Kolkata').notNull(),
	campaignDays: integer("campaign_days"),
	leetcodeUsername: text("leetcode_username"),
	notifications: jsonb().default({}).notNull(),
	setupDoneAt: timestamp("setup_done_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	hasLeetcodePremium: boolean("has_leetcode_premium").default(false).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "profiles_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("profiles_update_own", { as: "permissive", for: "update", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`(user_id = auth.uid())`  }),
	pgPolicy("profiles_read", { as: "permissive", for: "select", to: ["authenticated"] }),
	check("profiles_campaign_days_check", sql`(campaign_days >= 7) AND (campaign_days <= 365)`),
	check("profiles_language_check", sql`language = ANY (ARRAY['java'::text, 'python'::text, 'cpp'::text, 'javascript'::text])`),
]);

export const userApprovals = pgTable("user_approvals", {
	userId: uuid("user_id").primaryKey().notNull(),
	status: text().default('pending').notNull(),
	isAdmin: boolean("is_admin").default(false).notNull(),
	requestedAt: timestamp("requested_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	decidedAt: timestamp("decided_at", { withTimezone: true, mode: 'string' }),
	decidedBy: uuid("decided_by"),
}, (table) => [
	foreignKey({
			columns: [table.decidedBy],
			foreignColumns: [users.id],
			name: "user_approvals_decided_by_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_approvals_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("approvals_decide", { as: "permissive", for: "update", to: ["authenticated"], using: sql`is_admin()`, withCheck: sql`is_admin()`  }),
	pgPolicy("approvals_read", { as: "permissive", for: "select", to: ["authenticated"] }),
	check("user_approvals_check", sql`(status = 'pending'::text) = (decided_at IS NULL)`),
	check("user_approvals_status_check", sql`status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])`),
]);

export const sources = pgTable("sources", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	domain: text().notNull(),
	url: text(),
	license: text(),
	role: text().notNull(),
}, (table) => [
	pgPolicy("sources_read", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_approved()` }),
	check("sources_role_check", sql`role = ANY (ARRAY['cards'::text, 'enrich'::text, 'reference'::text])`),
]);

export const topics = pgTable("topics", {
	slug: text().primaryKey().notNull(),
	parentSlug: text("parent_slug"),
	domain: text().notNull(),
	name: text().notNull(),
	description: text(),
	importance: real().default(0.5).notNull(),
	sort: integer().default(0).notNull(),
}, (table) => [
	index("topics_domain_idx").using("btree", table.domain.asc().nullsLast().op("int4_ops"), table.sort.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.parentSlug],
			foreignColumns: [table.slug],
			name: "topics_parent_slug_fkey"
		}).onDelete("set null"),
	pgPolicy("topics_read", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_approved()` }),
	check("topics_domain_check", sql`domain = ANY (ARRAY['dsa'::text, 'system_design'::text, 'cs'::text, 'java'::text, 'sql'::text, 'lld'::text, 'ai'::text, 'behavioral'::text, 'competitive'::text])`),
	check("topics_importance_check", sql`(importance >= (0)::double precision) AND (importance <= (1)::double precision)`),
]);

export const documents = pgTable("documents", {
	id: text().primaryKey().notNull(),
	topicSlug: text("topic_slug"),
	domain: text().notNull(),
	title: text().notNull(),
	bodyMd: text("body_md").notNull(),
	url: text(),
	sourceId: text("source_id"),
	sort: integer().default(0).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("documents_domain_idx").using("btree", table.domain.asc().nullsLast().op("text_ops")),
	index("documents_topic_idx").using("btree", table.topicSlug.asc().nullsLast().op("int4_ops"), table.sort.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.sourceId],
			foreignColumns: [sources.id],
			name: "documents_source_id_fkey"
		}),
	foreignKey({
			columns: [table.topicSlug],
			foreignColumns: [topics.slug],
			name: "documents_topic_slug_fkey"
		}).onDelete("set null"),
	pgPolicy("documents_read", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_approved()` }),
]);

export const cardBatches = pgTable("card_batches", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	domain: text().notNull(),
	topicSlugs: text("topic_slugs").array().default([""]).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	aiPassRate: real("ai_pass_rate"),
	samplePassRate: real("sample_pass_rate"),
	status: text().default('draft').notNull(),
}, (table) => [
	pgPolicy("card_batches_read", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_admin()` }),
	check("card_batches_status_check", sql`status = ANY (ARRAY['draft'::text, 'published'::text, 'rejected'::text])`),
]);

export const cards = pgTable("cards", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	batchId: uuid("batch_id"),
	topicSlug: text("topic_slug"),
	problemSlug: text("problem_slug"),
	documentId: text("document_id"),
	format: text().notNull(),
	difficulty: text(),
	promptMd: text("prompt_md").notNull(),
	options: jsonb(),
	answerMd: text("answer_md").notNull(),
	keyPoints: jsonb("key_points").default([]).notNull(),
	sourceRefs: jsonb("source_refs").default([]).notNull(),
	quality: jsonb().default({}).notNull(),
	status: text().default('draft').notNull(),
	flagCount: integer("flag_count").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("cards_batch_idx").using("btree", table.batchId.asc().nullsLast().op("uuid_ops")),
	index("cards_topic_live_idx").using("btree", table.topicSlug.asc().nullsLast().op("text_ops")).where(sql`(status = 'live'::text)`),
	foreignKey({
			columns: [table.batchId],
			foreignColumns: [cardBatches.id],
			name: "cards_batch_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [documents.id],
			name: "cards_document_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.problemSlug],
			foreignColumns: [problems.slug],
			name: "cards_problem_slug_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.topicSlug],
			foreignColumns: [topics.slug],
			name: "cards_topic_slug_fkey"
		}).onDelete("set null"),
	pgPolicy("cards_read", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(is_approved() AND ((status = 'live'::text) OR is_admin()))` }),
	check("cards_difficulty_check", sql`difficulty = ANY (ARRAY['Easy'::text, 'Medium'::text, 'Hard'::text])`),
	check("cards_format_check", sql`format = ANY (ARRAY['typed'::text, 'flash'::text, 'mcq'::text, 'output'::text, 'bug'::text])`),
	check("cards_status_check", sql`status = ANY (ARRAY['draft'::text, 'live'::text, 'retired'::text])`),
]);

export const problems = pgTable("problems", {
	slug: text().primaryKey().notNull(),
	kind: text().notNull(),
	lcNumber: integer("lc_number"),
	title: text().notNull(),
	difficulty: text().notNull(),
	patternSlug: text("pattern_slug"),
	topicSlugs: text("topic_slugs").array().default([""]).notNull(),
	tags: text().array().default([""]).notNull(),
	importance: real().default(0).notNull(),
	nc150: boolean().default(false).notNull(),
	blind75: boolean().default(false).notNull(),
	companies: jsonb().default({}).notNull(),
	statementMd: text("statement_md"),
	solutions: jsonb().default({}).notNull(),
	videoId: text("video_id"),
	url: text(),
	sourceId: text("source_id"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	premium: boolean().default(false).notNull(),
	techniques: text().array().default([""]).notNull(),
}, (table) => [
	index("problems_kind_idx").using("btree", table.kind.asc().nullsLast().op("text_ops"), table.importance.desc().nullsFirst().op("float4_ops")),
	uniqueIndex("problems_lc_number_idx").using("btree", table.lcNumber.asc().nullsLast().op("int4_ops")).where(sql`(lc_number IS NOT NULL)`),
	index("problems_pattern_idx").using("btree", table.patternSlug.asc().nullsLast().op("float4_ops"), table.importance.desc().nullsFirst().op("float4_ops")),
	index("problems_techniques_idx").using("gin", table.techniques.asc().nullsLast().op("array_ops")),
	foreignKey({
			columns: [table.patternSlug],
			foreignColumns: [topics.slug],
			name: "problems_pattern_slug_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.sourceId],
			foreignColumns: [sources.id],
			name: "problems_source_id_fkey"
		}),
	pgPolicy("problems_read", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_approved()` }),
	check("problems_difficulty_check", sql`difficulty = ANY (ARRAY['Easy'::text, 'Medium'::text, 'Hard'::text])`),
	check("problems_importance_check", sql`(importance >= (0)::double precision) AND (importance <= (1)::double precision)`),
	check("problems_kind_check", sql`kind = ANY (ARRAY['leetcode'::text, 'competitive'::text])`),
]);

export const checkins = pgTable("checkins", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	problemSlug: text("problem_slug").notNull(),
	result: text().notNull(),
	attempts: integer(),
	minutes: integer(),
	minutesSuggested: integer("minutes_suggested"),
	source: text().default('manual').notNull(),
	externalId: text("external_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("checkins_external_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.externalId.asc().nullsLast().op("uuid_ops")).where(sql`(external_id IS NOT NULL)`),
	index("checkins_problem_idx").using("btree", table.problemSlug.asc().nullsLast().op("text_ops")),
	index("checkins_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	foreignKey({
			columns: [table.problemSlug],
			foreignColumns: [problems.slug],
			name: "checkins_problem_slug_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "checkins_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("checkins_read_approved", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_approved()` }),
	pgPolicy("checkins_owner", { as: "permissive", for: "all", to: ["authenticated"] }),
	check("checkins_attempts_check", sql`attempts > 0`),
	check("checkins_minutes_check", sql`(minutes >= 0) AND (minutes <= 600)`),
	check("checkins_minutes_suggested_check", sql`(minutes_suggested >= 0) AND (minutes_suggested <= 600)`),
	check("checkins_result_check", sql`result = ANY (ARRAY['solved'::text, 'hints'::text, 'failed'::text])`),
	check("checkins_source_check", sql`source = ANY (ARRAY['manual'::text, 'leetcode_sync'::text])`),
]);

export const checkinNotes = pgTable("checkin_notes", {
	checkinId: uuid("checkin_id").primaryKey().notNull(),
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	note: text().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.checkinId],
			foreignColumns: [checkins.id],
			name: "checkin_notes_checkin_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "checkin_notes_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("checkin_notes_owner", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM checkins c
  WHERE ((c.id = checkin_notes.checkin_id) AND (c.user_id = auth.uid())))))`  }),
]);

export const patternTricks = pgTable("pattern_tricks", {
	id: text().primaryKey().notNull(),
	patternSlug: text("pattern_slug").notNull(),
	name: text().notNull(),
	ideaMd: text("idea_md").notNull(),
	snippets: jsonb().default({}).notNull(),
	problemSlugs: text("problem_slugs").array().default([""]).notNull(),
	sort: integer().default(0).notNull(),
}, (table) => [
	index("pattern_tricks_pattern_idx").using("btree", table.patternSlug.asc().nullsLast().op("int4_ops"), table.sort.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.patternSlug],
			foreignColumns: [topics.slug],
			name: "pattern_tricks_pattern_slug_fkey"
		}).onDelete("cascade"),
	pgPolicy("pattern_tricks_read", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_approved()` }),
]);

export const topicLinks = pgTable("topic_links", {
	fromSlug: text("from_slug").notNull(),
	toSlug: text("to_slug").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.fromSlug],
			foreignColumns: [topics.slug],
			name: "topic_links_from_slug_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.toSlug],
			foreignColumns: [topics.slug],
			name: "topic_links_to_slug_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.fromSlug, table.toSlug], name: "topic_links_pkey"}),
	pgPolicy("topic_links_read", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_approved()` }),
]);

export const integrationStatus = pgTable("integration_status", {
	userId: uuid("user_id").notNull(),
	provider: text().notNull(),
	enabled: boolean().default(true).notNull(),
	lastSuccessAt: timestamp("last_success_at", { withTimezone: true, mode: 'string' }),
	lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true, mode: 'string' }),
	consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
	totals: jsonb(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "integration_status_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.provider], name: "integration_status_pkey"}),
	pgPolicy("integration_status_owner", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`(user_id = auth.uid())`  }),
	check("integration_status_provider_check", sql`provider = 'leetcode'::text`),
]);

export { users as usersInAuth } from "../auth";
