import { pgTable, index, foreignKey, pgPolicy, check, uuid, text, jsonb, integer, timestamp, boolean, real, doublePrecision, numeric, uniqueIndex, unique, date, primaryKey, smallint, bigserial, bigint } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { users } from "../auth"



export const cards = pgTable("cards", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	batchId: uuid("batch_id"),
	topicSlug: text("topic_slug"),
	problemSlug: text("problem_slug"),
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
	hidden: boolean().default(false).notNull(),
	risk: real(),
	archetype: text(),
	picked: jsonb(),
	constraints: jsonb(),
	pairs: jsonb(),
	value: doublePrecision(),
	tolerance: doublePrecision(),
	whyStep: jsonb("why_step"),
	observedAttempts: integer("observed_attempts").default(0).notNull(),
	observedCorrect: integer("observed_correct").default(0).notNull(),
	publishedAt: timestamp("published_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("cards_batch_idx").using("btree", table.batchId.asc().nullsLast().op("uuid_ops")),
	index("cards_problem_slug_idx").using("btree", table.problemSlug.asc().nullsLast().op("text_ops")),
	index("cards_topic_live_idx").using("btree", table.topicSlug.asc().nullsLast().op("text_ops")).where(sql`(status = 'live'::text)`),
	foreignKey({
			columns: [table.batchId],
			foreignColumns: [cardBatches.id],
			name: "cards_batch_id_fkey"
		}).onDelete("cascade"),
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
	pgPolicy("cards_read", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(is_approved() AND (((status = 'live'::text) AND (NOT hidden)) OR is_admin()))` }),
	check("cards_difficulty_check", sql`difficulty = ANY (ARRAY['Easy'::text, 'Medium'::text, 'Hard'::text])`),
	check("cards_status_check", sql`status = ANY (ARRAY['draft'::text, 'live'::text, 'retired'::text])`),
	check("cards_format_check", sql`format = ANY (ARRAY['pick_one'::text, 'order'::text, 'match'::text, 'bucket'::text, 'tap_in_place'::text, 'assemble'::text, 'numeric'::text, 'claim_grid'::text, 'grid_toggle'::text, 'compose'::text, 'self_rate'::text, 'typed'::text, 'flash'::text, 'mcq'::text, 'output'::text, 'bug'::text])`),
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
		}).onDelete("set null"),
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
	weekdayMinutes: integer("weekday_minutes"),
	weekendMinutes: integer("weekend_minutes"),
	morningPushHour: integer("morning_push_hour"),
	feedTopics: jsonb("feed_topics"),
	diagnosticDoneAt: timestamp("diagnostic_done_at", { withTimezone: true, mode: 'string' }),
	level: text(),
	signupSource: text("signup_source"),
	signupSpot: text("signup_spot"),
	signupMedium: text("signup_medium"),
	signupCampaign: text("signup_campaign"),
	signupReferrer: text("signup_referrer"),
	welcomeSeenAt: timestamp("welcome_seen_at", { withTimezone: true, mode: 'string' }),
	tipsSeen: text("tips_seen").array().default([""]).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "profiles_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("profiles_read", { as: "permissive", for: "select", to: ["authenticated"], using: sql`((user_id = auth.uid()) OR (is_approved() AND is_friend(user_id)))` }),
	pgPolicy("profiles_update_own", { as: "permissive", for: "update", to: ["authenticated"] }),
	check("profiles_campaign_days_check", sql`(campaign_days >= 7) AND (campaign_days <= 365)`),
	check("profiles_language_check", sql`language = ANY (ARRAY['java'::text, 'python'::text, 'cpp'::text, 'javascript'::text])`),
	check("profiles_level_check", sql`level = ANY (ARRAY['first_time'::text, 'some_practice'::text, 'ready'::text])`),
	check("profiles_morning_push_hour_check", sql`(morning_push_hour >= 0) AND (morning_push_hour <= 23)`),
	check("profiles_weekday_minutes_check", sql`(weekday_minutes >= 30) AND (weekday_minutes <= 480)`),
	check("profiles_weekend_minutes_check", sql`(weekend_minutes >= 30) AND (weekend_minutes <= 480)`),
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
	section: text(),
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
	index("checkins_created_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("checkins_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	foreignKey({
			columns: [table.problemSlug],
			foreignColumns: [problems.slug],
			name: "checkins_problem_slug_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "checkins_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("checkins_read_approved", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(is_approved() AND is_friend(user_id))` }),
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
	hidden: boolean().default(false).notNull(),
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

export const missions = pgTable("missions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	date: date().notNull(),
	slotType: text("slot_type").notNull(),
	ref: text().notNull(),
	estMinutes: integer("est_minutes").notNull(),
	status: text().default('open').notNull(),
	reason: text().default('').notNull(),
	doneAt: timestamp("done_at", { withTimezone: true, mode: 'string' }),
	checkinId: uuid("checkin_id"),
	isRevive: boolean("is_revive").default(false).notNull(),
	reviveOf: date("revive_of"),
	isExtra: boolean("is_extra").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("missions_date_idx").using("btree", table.date.asc().nullsLast().op("date_ops")),
	index("missions_user_date_idx").using("btree", table.userId.asc().nullsLast().op("date_ops"), table.date.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.checkinId],
			foreignColumns: [checkins.id],
			name: "missions_checkin_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "missions_user_id_fkey"
		}).onDelete("cascade"),
	unique("missions_user_id_date_slot_type_ref_key").on(table.userId, table.date, table.slotType, table.ref),
	pgPolicy("missions_owner", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`((user_id = auth.uid()) AND is_approved())`  }),
	check("missions_est_minutes_check", sql`(est_minutes >= 0) AND (est_minutes <= 600)`),
	check("missions_revive_consistent", sql`is_revive = (revive_of IS NOT NULL)`),
	check("missions_slot_type_check", sql`slot_type = ANY (ARRAY['new_problem'::text, 'review'::text, 'topic'::text, 'cards'::text])`),
	check("missions_status_check", sql`status = ANY (ARRAY['open'::text, 'done'::text, 'skipped'::text, 'coming_soon'::text])`),
]);

export const campaigns = pgTable("campaigns", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	startDate: date("start_date").notNull(),
	lengthDays: integer("length_days").notNull(),
	status: text().default('active').notNull(),
	templates: jsonb().notNull(),
	companyFocus: jsonb("company_focus"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("campaigns_one_active").using("btree", table.userId.asc().nullsLast().op("uuid_ops")).where(sql`(status = 'active'::text)`),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "campaigns_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("campaigns_read_approved", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(is_approved() AND is_friend(user_id))` }),
	pgPolicy("campaigns_owner", { as: "permissive", for: "all", to: ["authenticated"] }),
	check("campaigns_length_days_check", sql`(length_days >= 7) AND (length_days <= 365)`),
	check("campaigns_status_check", sql`status = ANY (ARRAY['active'::text, 'ended'::text])`),
]);

export const pushSubscriptions = pgTable("push_subscriptions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	endpoint: text().notNull(),
	p256Dh: text("p256dh").notNull(),
	auth: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastOkAt: timestamp("last_ok_at", { withTimezone: true, mode: 'string' }),
	lastErrorAt: timestamp("last_error_at", { withTimezone: true, mode: 'string' }),
	lastStatus: integer("last_status"),
	lastError: text("last_error"),
	failCount: integer("fail_count").default(0).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "push_subscriptions_user_id_fkey"
		}).onDelete("cascade"),
	unique("push_subscriptions_endpoint_key").on(table.endpoint),
	pgPolicy("push_owner", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`((user_id = auth.uid()) AND is_approved())`  }),
]);

export const cardBatches = pgTable("card_batches", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	domain: text().notNull(),
	topicSlugs: text("topic_slugs").array().default([""]).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	aiPassRate: real("ai_pass_rate"),
	samplePassRate: real("sample_pass_rate"),
	status: text().default('draft').notNull(),
	label: text(),
	reviewedBy: uuid("reviewed_by"),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.reviewedBy],
			foreignColumns: [users.id],
			name: "card_batches_reviewed_by_fkey"
		}).onDelete("set null"),
	pgPolicy("card_batches_read", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_admin()` }),
	check("card_batches_status_check", sql`status = ANY (ARRAY['draft'::text, 'published'::text, 'rejected'::text])`),
]);

export const cardReviews = pgTable("card_reviews", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	cardId: uuid("card_id").notNull(),
	answer: text().default('').notNull(),
	score: real().notNull(),
	pointsHit: jsonb("points_hit").default([]).notNull(),
	outcome: text().notNull(),
	gradedBy: text("graded_by").notNull(),
	usedOptions: boolean("used_options").default(false).notNull(),
	diagnostic: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("card_reviews_created_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("card_reviews_card_idx").using("btree", table.cardId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	index("card_reviews_declared_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.outcome.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")).where(sql`(outcome = ANY (ARRAY['new_to_me'::text, 'known'::text]))`),
	index("card_reviews_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	foreignKey({
			columns: [table.cardId],
			foreignColumns: [cards.id],
			name: "card_reviews_card_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "card_reviews_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("card_reviews_owner", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`((user_id = auth.uid()) AND is_approved())`  }),
	check("card_reviews_graded_by_check", sql`graded_by = ANY (ARRAY['pure'::text, 'self'::text, 'skip'::text, 'declared'::text, 'match'::text, 'ai'::text, 'options'::text])`),
	check("card_reviews_outcome_check", sql`outcome = ANY (ARRAY['correct'::text, 'wrong'::text, 'skipped'::text, 'new_to_me'::text, 'known'::text])`),
	check("card_reviews_score_check", sql`(score >= (0)::double precision) AND (score <= (1)::double precision)`),
]);

export const aiUsage = pgTable("ai_usage", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	route: text().notNull(),
	model: text().notNull(),
	tokensIn: integer("tokens_in").default(0).notNull(),
	tokensOut: integer("tokens_out").default(0).notNull(),
	costUsd: numeric("cost_usd", { precision: 10, scale:  6 }).default('0').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ai_usage_created_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "ai_usage_user_id_fkey"
		}).onDelete("set null"),
	pgPolicy("ai_usage_owner", { as: "permissive", for: "select", to: ["authenticated"], using: sql`((user_id = auth.uid()) OR is_admin())` }),
]);

export const coachThreads = pgTable("coach_threads", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	kind: text().default('chat').notNull(),
	title: text().default('').notNull(),
	ref: text(),
	memoryExtractedAt: timestamp("memory_extracted_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("coach_threads_user_idx").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.updatedAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "coach_threads_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("coach_threads_owner", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`((user_id = auth.uid()) AND is_approved())`  }),
	check("coach_threads_kind_check", sql`kind = ANY (ARRAY['chat'::text, 'lesson'::text, 'review'::text, 'mock'::text, 'add'::text])`),
]);

export const coachMessages = pgTable("coach_messages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	threadId: uuid("thread_id").notNull(),
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	role: text().notNull(),
	parts: jsonb().default([]).notNull(),
	citations: jsonb().default([]).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("coach_messages_user_created_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(role = 'user'::text)`),
	index("coach_messages_thread_idx").using("btree", table.threadId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.threadId],
			foreignColumns: [coachThreads.id],
			name: "coach_messages_thread_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "coach_messages_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("coach_messages_owner", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`((user_id = auth.uid()) AND is_approved() AND (EXISTS ( SELECT 1
   FROM coach_threads t
  WHERE ((t.id = coach_messages.thread_id) AND (t.user_id = auth.uid())))))`  }),
	check("coach_messages_role_check", sql`role = ANY (ARRAY['user'::text, 'assistant'::text])`),
]);

export const solutionReviews = pgTable("solution_reviews", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	problemSlug: text("problem_slug").notNull(),
	checkinId: uuid("checkin_id"),
	threadId: uuid("thread_id"),
	language: text().notNull(),
	code: text().notNull(),
	correct: boolean(),
	complexity: jsonb().default({}).notNull(),
	review: jsonb().default({}).notNull(),
	patternLesson: text("pattern_lesson"),
	nextProblemSlug: text("next_problem_slug"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("solution_reviews_user_idx").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.checkinId],
			foreignColumns: [checkins.id],
			name: "solution_reviews_checkin_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.nextProblemSlug],
			foreignColumns: [problems.slug],
			name: "solution_reviews_next_problem_slug_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.problemSlug],
			foreignColumns: [problems.slug],
			name: "solution_reviews_problem_slug_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.threadId],
			foreignColumns: [coachThreads.id],
			name: "solution_reviews_thread_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "solution_reviews_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("solution_reviews_owner", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`((user_id = auth.uid()) AND is_approved())`  }),
	check("solution_reviews_code_check", sql`length(code) <= 20000`),
]);

export const stories = pgTable("stories", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	title: text().notNull(),
	situation: text().default('').notNull(),
	task: text().default('').notNull(),
	action: text().default('').notNull(),
	result: text().default('').notNull(),
	tags: text().array().default([""]).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "stories_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("stories_owner", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`((user_id = auth.uid()) AND is_approved())`  }),
	check("stories_title_check", sql`(length(title) >= 1) AND (length(title) <= 120)`),
]);

export const mocks = pgTable("mocks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	type: text().notNull(),
	topic: text().default('').notNull(),
	status: text().default('running').notNull(),
	score: integer(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	endedAt: timestamp("ended_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("mocks_started_idx").using("btree", table.startedAt.asc().nullsLast().op("timestamptz_ops")),
	index("mocks_user_idx").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "mocks_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("mocks_read_approved", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(is_approved() AND is_friend(user_id))` }),
	pgPolicy("mocks_owner", { as: "permissive", for: "all", to: ["authenticated"] }),
	check("mocks_score_check", sql`(score >= 0) AND (score <= 100)`),
	check("mocks_status_check", sql`status = ANY (ARRAY['running'::text, 'done'::text, 'abandoned'::text])`),
	check("mocks_type_check", sql`type = ANY (ARRAY['design'::text, 'behavioral'::text])`),
]);

export const mockDetails = pgTable("mock_details", {
	mockId: uuid("mock_id").primaryKey().notNull(),
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	threadId: uuid("thread_id"),
	prompt: text().default('').notNull(),
	rubricScores: jsonb("rubric_scores").default({}).notNull(),
	feedbackMd: text("feedback_md"),
}, (table) => [
	foreignKey({
			columns: [table.mockId],
			foreignColumns: [mocks.id],
			name: "mock_details_mock_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.threadId],
			foreignColumns: [coachThreads.id],
			name: "mock_details_thread_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "mock_details_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("mock_details_owner", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`((user_id = auth.uid()) AND is_approved() AND (EXISTS ( SELECT 1
   FROM mocks m
  WHERE ((m.id = mock_details.mock_id) AND (m.user_id = auth.uid())))))`  }),
]);

export const weeklyReviews = pgTable("weekly_reviews", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	weekStart: date("week_start").notNull(),
	formulaScore: integer("formula_score"),
	coachScore: integer("coach_score"),
	summaryMd: text("summary_md").default('').notNull(),
	suggestedChanges: jsonb("suggested_changes").default([]).notNull(),
	focus: jsonb().default({}).notNull(),
	accepted: boolean(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "weekly_reviews_user_id_fkey"
		}).onDelete("cascade"),
	unique("weekly_reviews_user_id_week_start_key").on(table.userId, table.weekStart),
	pgPolicy("weekly_reviews_owner", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`((user_id = auth.uid()) AND is_approved())`  }),
	check("weekly_reviews_coach_score_check", sql`(coach_score >= 0) AND (coach_score <= 100)`),
	check("weekly_reviews_formula_score_check", sql`(formula_score >= 0) AND (formula_score <= 100)`),
]);

export const coachMemory = pgTable("coach_memory", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	kind: text().notNull(),
	text: text().notNull(),
	evidence: jsonb().default([]).notNull(),
	status: text().default('active').notNull(),
	source: text().default('coach').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	expiresOn: date("expires_on"),
}, (table) => [
	index("coach_memory_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "coach_memory_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("coach_memory_owner", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`((user_id = auth.uid()) AND is_approved())`  }),
	check("coach_memory_kind_check", sql`kind = ANY (ARRAY['habit'::text, 'strength'::text, 'goal'::text, 'preference'::text, 'context'::text])`),
	check("coach_memory_source_check", sql`source = ANY (ARRAY['user'::text, 'coach'::text])`),
	check("coach_memory_status_check", sql`status = ANY (ARRAY['active'::text, 'improving'::text, 'resolved'::text, 'dismissed'::text])`),
	check("coach_memory_text_check", sql`(length(text) >= 1) AND (length(text) <= 500)`),
]);

export const roadmapNodes = pgTable("roadmap_nodes", {
	id: text().primaryKey().notNull(),
	roadmap: text().notNull(),
	domain: text().notNull(),
	label: text().notNull(),
	kind: text().notNull(),
	sort: integer().notNull(),
	topicSlug: text("topic_slug"),
}, (table) => [
	index("roadmap_nodes_domain_idx").using("btree", table.domain.asc().nullsLast().op("text_ops"), table.roadmap.asc().nullsLast().op("int4_ops"), table.sort.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.topicSlug],
			foreignColumns: [topics.slug],
			name: "roadmap_nodes_topic_slug_fkey"
		}).onDelete("set null"),
	pgPolicy("roadmap_nodes_read", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_approved()` }),
	check("roadmap_nodes_kind_check", sql`kind = ANY (ARRAY['topic'::text, 'subtopic'::text])`),
]);

export const lessons = pgTable("lessons", {
	topicSlug: text("topic_slug").primaryKey().notNull(),
	title: text().notNull(),
	summary: text(),
	bodyMd: text("body_md").notNull(),
	practice: jsonb().default({}).notNull(),
	sourceRefs: jsonb("source_refs").default([]).notNull(),
	words: integer(),
	generatedAt: timestamp("generated_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	writtenBy: uuid("written_by"),
}, (table) => [
	index("lessons_title_idx").using("btree", table.title.asc().nullsLast().op("text_ops")),
	index("lessons_written_by_idx").using("btree", table.writtenBy.asc().nullsLast().op("uuid_ops")).where(sql`(written_by IS NOT NULL)`),
	foreignKey({
			columns: [table.topicSlug],
			foreignColumns: [topics.slug],
			name: "lessons_topic_slug_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.writtenBy],
			foreignColumns: [users.id],
			name: "lessons_written_by_fkey"
		}).onDelete("set null"),
	pgPolicy("lessons_read", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_approved()` }),
]);

export const friendInvites = pgTable("friend_invites", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	email: text("email").notNull(),
	invitedBy: uuid("invited_by").notNull(),
	status: text().default('pending').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	respondedAt: timestamp("responded_at", { withTimezone: true, mode: 'string' }),
	dismissedAt: timestamp("dismissed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("friend_invites_email_idx").using("btree", table.email.asc().nullsLast().op("citext_ops")).where(sql`(status = 'pending'::text)`),
	uniqueIndex("friend_invites_pending_idx").using("btree", table.invitedBy.asc().nullsLast().op("uuid_ops"), table.email.asc().nullsLast().op("uuid_ops")).where(sql`(status = 'pending'::text)`),
	foreignKey({
			columns: [table.invitedBy],
			foreignColumns: [users.id],
			name: "friend_invites_invited_by_fkey"
		}).onDelete("cascade"),
	pgPolicy("friend_invites_respond", { as: "permissive", for: "update", to: ["authenticated"], using: sql`((lower((email)::text) = lower(current_user_email())) OR (invited_by = auth.uid()))` }),
	pgPolicy("friend_invites_send", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("friend_invites_read", { as: "permissive", for: "select", to: ["authenticated"] }),
	check("friend_invites_check", sql`(status = 'pending'::text) = (responded_at IS NULL)`),
	check("friend_invites_status_check", sql`status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text])`),
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

export const topicProgress = pgTable("topic_progress", {
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	topicSlug: text("topic_slug").notNull(),
	studiedAt: timestamp("studied_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.topicSlug],
			foreignColumns: [topics.slug],
			name: "topic_progress_topic_slug_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "topic_progress_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.topicSlug], name: "topic_progress_pkey"}),
	pgPolicy("topic_progress_owner", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`((user_id = auth.uid()) AND is_approved())`  }),
]);

export const topicOpens = pgTable("topic_opens", {
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	topicSlug: text("topic_slug").notNull(),
	openedAt: timestamp("opened_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	openCount: integer("open_count").default(1).notNull(),
	lastOpenedAt: timestamp("last_opened_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.topicSlug],
			foreignColumns: [topics.slug],
			name: "topic_opens_topic_slug_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "topic_opens_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.topicSlug], name: "topic_opens_pkey"}),
	pgPolicy("topic_opens_owner", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`((user_id = auth.uid()) AND is_approved())`  }),
	check("topic_opens_open_count_check", sql`open_count >= 1`),
]);

export const readinessSnapshots = pgTable("readiness_snapshots", {
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	date: date().notNull(),
	overall: integer(),
	perArea: jsonb("per_area").default({}).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "readiness_snapshots_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.date], name: "readiness_snapshots_pkey"}),
	pgPolicy("readiness_read_approved", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(is_approved() AND is_friend(user_id))` }),
	pgPolicy("readiness_owner", { as: "permissive", for: "all", to: ["authenticated"] }),
	check("readiness_snapshots_overall_check", sql`(overall >= 0) AND (overall <= 100)`),
]);

export const cardFlags = pgTable("card_flags", {
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	cardId: uuid("card_id").notNull(),
	reason: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.cardId],
			foreignColumns: [cards.id],
			name: "card_flags_card_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "card_flags_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.cardId], name: "card_flags_pkey"}),
	pgPolicy("card_flags_owner", { as: "permissive", for: "all", to: ["authenticated"], using: sql`((user_id = auth.uid()) OR is_admin())`, withCheck: sql`((user_id = auth.uid()) AND is_approved())`  }),
	check("card_flags_reason_check", sql`(length(reason) >= 1) AND (length(reason) <= 500)`),
]);

export const cardRatings = pgTable("card_ratings", {
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	cardId: uuid("card_id").notNull(),
	stars: smallint().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("card_ratings_card_idx").using("btree", table.cardId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.cardId],
			foreignColumns: [cards.id],
			name: "card_ratings_card_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "card_ratings_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.cardId], name: "card_ratings_pkey"}),
	pgPolicy("card_ratings_owner", { as: "permissive", for: "all", to: ["authenticated"], using: sql`((user_id = auth.uid()) OR is_admin())`, withCheck: sql`((user_id = auth.uid()) AND is_approved())`  }),
	check("card_ratings_stars_check", sql`(stars >= 1) AND (stars <= 5)`),
]);

export const roadmapProgress = pgTable("roadmap_progress", {
	userId: uuid("user_id").notNull(),
	nodeId: text("node_id").notNull(),
	doneAt: timestamp("done_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	source: text().default('manual').notNull(),
}, (table) => [
	foreignKey({
			columns: [table.nodeId],
			foreignColumns: [roadmapNodes.id],
			name: "roadmap_progress_node_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "roadmap_progress_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.nodeId], name: "roadmap_progress_pkey"}),
	pgPolicy("roadmap_progress_owner", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`((user_id = auth.uid()) AND is_approved())`  }),
	check("roadmap_progress_source_check", sql`source = ANY (ARRAY['manual'::text, 'topic'::text])`),
]);

export const friendships = pgTable("friendships", {
	userA: uuid("user_a").notNull(),
	userB: uuid("user_b").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	fromInvite: uuid("from_invite"),
}, (table) => [
	index("friendships_user_b_idx").using("btree", table.userB.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.fromInvite],
			foreignColumns: [friendInvites.id],
			name: "friendships_from_invite_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userA],
			foreignColumns: [users.id],
			name: "friendships_user_a_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userB],
			foreignColumns: [users.id],
			name: "friendships_user_b_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userA, table.userB], name: "friendships_pkey"}),
	pgPolicy("friendships_read", { as: "permissive", for: "select", to: ["authenticated"], using: sql`((user_a = auth.uid()) OR (user_b = auth.uid()))` }),
	check("friendships_check", sql`user_a < user_b`),
]);

export const days = pgTable("days", {
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	date: date().notNull(),
	campaignId: uuid("campaign_id").notNull(),
	status: text().default('pending').notNull(),
	closedAt: timestamp("closed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.campaignId],
			foreignColumns: [campaigns.id],
			name: "days_campaign_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "days_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.date], name: "days_pkey"}),
	pgPolicy("days_read_approved", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(is_approved() AND is_friend(user_id))` }),
	pgPolicy("days_owner", { as: "permissive", for: "all", to: ["authenticated"] }),
	check("days_status_check", sql`status = ANY (ARRAY['pending'::text, 'done'::text, 'partial'::text, 'missed'::text, 'revived'::text, 'rest'::text])`),
]);

export const problemReviews = pgTable("problem_reviews", {
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	problemSlug: text("problem_slug").notNull(),
	step: integer().notNull(),
	dueDate: date("due_date").notNull(),
	status: text().default('active').notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("problem_reviews_updated_idx").using("btree", table.updatedAt.asc().nullsLast().op("timestamptz_ops")),
	index("problem_reviews_due_idx").using("btree", table.userId.asc().nullsLast().op("date_ops"), table.dueDate.asc().nullsLast().op("uuid_ops")).where(sql`(status = 'active'::text)`),
	foreignKey({
			columns: [table.problemSlug],
			foreignColumns: [problems.slug],
			name: "problem_reviews_problem_slug_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "problem_reviews_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.problemSlug], name: "problem_reviews_pkey"}),
	pgPolicy("problem_reviews_owner", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`((user_id = auth.uid()) AND is_approved())`  }),
	check("problem_reviews_status_check", sql`status = ANY (ARRAY['active'::text, 'graduated'::text, 'dismissed'::text])`),
	check("problem_reviews_step_check", sql`(step >= 1) AND (step <= 3)`),
]);

export const batchReviewItems = pgTable("batch_review_items", {
	batchId: uuid("batch_id").notNull(),
	cardId: uuid("card_id").notNull(),
	verdict: text().notNull(),
	note: text(),
	decidedBy: uuid("decided_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.batchId],
			foreignColumns: [cardBatches.id],
			name: "batch_review_items_batch_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.cardId],
			foreignColumns: [cards.id],
			name: "batch_review_items_card_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.decidedBy],
			foreignColumns: [users.id],
			name: "batch_review_items_decided_by_fkey"
		}).onDelete("set null"),
	primaryKey({ columns: [table.batchId, table.cardId], name: "batch_review_items_pkey"}),
	pgPolicy("batch_review_items_admin", { as: "permissive", for: "all", to: ["authenticated"], using: sql`is_admin()`, withCheck: sql`is_admin()`  }),
	check("batch_review_items_verdict_check", sql`verdict = ANY (ARRAY['good'::text, 'bad'::text])`),
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

export const cardState = pgTable("card_state", {
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	cardId: uuid("card_id").notNull(),
	stability: real().notNull(),
	difficulty: real().notNull(),
	dueAt: timestamp("due_at", { withTimezone: true, mode: 'string' }).notNull(),
	reps: integer().default(0).notNull(),
	lapses: integer().default(0).notNull(),
	state: integer().default(0).notNull(),
	lastReview: timestamp("last_review", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("card_state_due_idx").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.dueAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.cardId],
			foreignColumns: [cards.id],
			name: "card_state_card_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "card_state_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.cardId], name: "card_state_pkey"}),
	pgPolicy("card_state_owner", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(user_id = auth.uid())`, withCheck: sql`((user_id = auth.uid()) AND is_approved())`  }),
]);

export { users as usersInAuth } from "../auth";

export const appSettings = pgTable("app_settings", {
	key: text().primaryKey().notNull(),
	value: jsonb().notNull(),
	updatedBy: uuid("updated_by"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [users.id],
			name: "app_settings_updated_by_fkey"
		}).onDelete("set null"),
]);

export const xpEvents = pgTable("xp_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").default(sql`auth.uid()`).notNull(),
	day: date().notNull(),
	kind: text().notNull(),
	ref: text().notNull(),
	xp: integer().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("xp_events_user_day_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.day.asc().nullsLast().op("date_ops")),
	uniqueIndex("xp_events_once_problem_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.ref.asc().nullsLast().op("text_ops")).where(sql`(kind = 'problem'::text)`),
	uniqueIndex("xp_events_once_topic_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.ref.asc().nullsLast().op("text_ops")).where(sql`(kind = 'topic'::text)`),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "xp_events_user_id_fkey"
		}).onDelete("cascade"),
	unique("xp_events_user_id_kind_ref_day_key").on(table.userId, table.kind, table.ref, table.day),
	pgPolicy("xp_events_owner_read", { as: "permissive", for: "select", to: ["authenticated"], using: sql`((user_id = auth.uid()) AND is_approved())` }),
	check("xp_events_kind_check", sql`kind = ANY (ARRAY['problem'::text, 'review'::text, 'topic'::text, 'card'::text, 'card_ai'::text, 'bonus'::text])`),
	check("xp_events_xp_check", sql`xp > 0`),
]);

export const problemReports = pgTable("problem_reports", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	message: text().notNull(),
	doing: text(),
	path: text(),
	userAgent: text("user_agent"),
	appVersion: text("app_version"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: 'string' }),
	resolvedBy: uuid("resolved_by"),
}, (table) => [
	index("problem_reports_open_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")).where(sql`(resolved_at IS NULL)`),
	index("problem_reports_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "problem_reports_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.resolvedBy],
			foreignColumns: [users.id],
			name: "problem_reports_resolved_by_fkey"
		}).onDelete("set null"),
	check("problem_reports_message_check", sql`(char_length(message) >= 1) AND (char_length(message) <= 2000)`),
	check("problem_reports_doing_check", sql`char_length(doing) <= 1000`),
	check("problem_reports_path_check", sql`char_length(path) <= 300`),
	check("problem_reports_user_agent_check", sql`char_length(user_agent) <= 500`),
	check("problem_reports_app_version_check", sql`char_length(app_version) <= 64`),
]);

export const shareCodes = pgTable("share_codes", {
	userId: uuid("user_id").default(sql`auth.uid()`).primaryKey().notNull(),
	code: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	sharedCount: integer("shared_count").default(0).notNull(),
	views: integer().default(0).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "share_codes_user_id_fkey"
		}).onDelete("cascade"),
	unique("share_codes_code_key").on(table.code),
	pgPolicy("share_codes_owner_read", { as: "permissive", for: "select", to: ["authenticated"], using: sql`((user_id = auth.uid()) AND is_approved())`  }),
	check("share_codes_code_check", sql`code ~ '^[a-z0-9]{8}$'::text`),
	check("share_codes_shared_count_check", sql`shared_count >= 0`),
	check("share_codes_views_check", sql`views >= 0`),
]);

export const jobRuns = pgTable("job_runs", {
	id: bigserial({ mode: "number" }).primaryKey().notNull(),
	job: text().notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	status: text().notNull(),
	durationMs: integer("duration_ms"),
	result: jsonb().default({}).notNull(),
	error: text(),
}, (table) => [
	index("job_runs_job_started_idx").using("btree", table.job.asc().nullsLast().op("text_ops"), table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
	check("job_runs_job_check", sql`job ~ '^[a-z0-9-]{1,40}$'::text`),
	check("job_runs_status_check", sql`status = ANY (ARRAY['running'::text, 'ok'::text, 'failed'::text, 'skipped'::text])`),
	check("job_runs_duration_ms_check", sql`duration_ms >= 0`),
	check("job_runs_error_check", sql`char_length(error) <= 2000`),
]);

export const tryEvents = pgTable("try_events", {
	id: bigserial({ mode: "number" }).primaryKey().notNull(),
	visit: text().notNull(),
	kind: text().notNull(),
	data: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("try_events_created_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("try_events_visit_idx").using("btree", table.visit.asc().nullsLast().op("text_ops")),
	check("try_events_visit_check", sql`visit ~ '^[a-z0-9]{16,32}$'::text`),
	check("try_events_kind_check", sql`kind = ANY (ARRAY['view'::text, 'tab'::text, 'answer'::text, 'listen_start'::text, 'listen_95'::text, 'listen_pause'::text, 'signin_click'::text, 'leave'::text])`),
	check("try_events_data_check", sql`pg_column_size(data) <= 512`),
]);

export const deletedAccounts = pgTable("deleted_accounts", {
	id: bigserial({ mode: "number" }).primaryKey().notNull(),
	userId: uuid("user_id"),
	email: text(),
	name: text(),
	signedUpAt: timestamp("signed_up_at", { withTimezone: true, mode: 'string' }),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedBy: text("deleted_by").notNull(),
}, (table) => [
	index("deleted_accounts_personal_idx").using("btree", table.deletedAt.asc().nullsLast().op("timestamptz_ops")).where(sql`((email IS NOT NULL) OR (name IS NOT NULL) OR (user_id IS NOT NULL))`),
	uniqueIndex("deleted_accounts_user_id_key").using("btree", table.userId.asc().nullsLast().op("uuid_ops")).where(sql`(user_id IS NOT NULL)`),
	check("deleted_accounts_deleted_by_check", sql`deleted_by = ANY (ARRAY['self'::text, 'admin'::text])`),
]);

export const lessonAudio = pgTable("lesson_audio", {
	topicSlug: text("topic_slug").primaryKey().notNull(),
	r2Key: text("r2_key").notNull(),
	durationS: doublePrecision("duration_s").notNull(),
	bytes: bigint({ mode: "number" }).notNull(),
	scriptHash: text("script_hash").notNull(),
	voice: text().notNull(),
	lines: jsonb().default([]).notNull(),
	publishedAt: timestamp("published_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.topicSlug],
			foreignColumns: [lessons.topicSlug],
			name: "lesson_audio_topic_slug_fkey"
		}).onDelete("cascade"),
]);

export const lessonAudioProgress = pgTable("lesson_audio_progress", {
	userId: uuid("user_id").notNull(),
	topicSlug: text("topic_slug").notNull(),
	positionS: doublePrecision("position_s").default(0).notNull(),
	rate: real().default(1).notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("lesson_audio_progress_user_updated_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.updatedAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "lesson_audio_progress_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.topicSlug],
			foreignColumns: [lessons.topicSlug],
			name: "lesson_audio_progress_topic_slug_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.topicSlug], name: "lesson_audio_progress_pkey"}),
]);
