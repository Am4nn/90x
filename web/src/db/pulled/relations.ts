import { relations } from "drizzle-orm/relations";
import { usersInAuth, profiles, userApprovals, topics, sources, documents, cardBatches, cards, problems, checkins, checkinNotes, patternTricks, topicLinks, integrationStatus } from "./schema";

export const profilesRelations = relations(profiles, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [profiles.userId],
		references: [usersInAuth.id]
	}),
}));

export const usersInAuthRelations = relations(usersInAuth, ({many}) => ({
	profiles: many(profiles),
	userApprovals_decidedBy: many(userApprovals, {
		relationName: "userApprovals_decidedBy_usersInAuth_id"
	}),
	userApprovals_userId: many(userApprovals, {
		relationName: "userApprovals_userId_usersInAuth_id"
	}),
	checkins: many(checkins),
	checkinNotes: many(checkinNotes),
	integrationStatuses: many(integrationStatus),
}));

export const userApprovalsRelations = relations(userApprovals, ({one}) => ({
	usersInAuth_decidedBy: one(usersInAuth, {
		fields: [userApprovals.decidedBy],
		references: [usersInAuth.id],
		relationName: "userApprovals_decidedBy_usersInAuth_id"
	}),
	usersInAuth_userId: one(usersInAuth, {
		fields: [userApprovals.userId],
		references: [usersInAuth.id],
		relationName: "userApprovals_userId_usersInAuth_id"
	}),
}));

export const topicsRelations = relations(topics, ({one, many}) => ({
	topic: one(topics, {
		fields: [topics.parentSlug],
		references: [topics.slug],
		relationName: "topics_parentSlug_topics_slug"
	}),
	topics: many(topics, {
		relationName: "topics_parentSlug_topics_slug"
	}),
	documents: many(documents),
	cards: many(cards),
	problems: many(problems),
	patternTricks: many(patternTricks),
	topicLinks_fromSlug: many(topicLinks, {
		relationName: "topicLinks_fromSlug_topics_slug"
	}),
	topicLinks_toSlug: many(topicLinks, {
		relationName: "topicLinks_toSlug_topics_slug"
	}),
}));

export const documentsRelations = relations(documents, ({one, many}) => ({
	source: one(sources, {
		fields: [documents.sourceId],
		references: [sources.id]
	}),
	topic: one(topics, {
		fields: [documents.topicSlug],
		references: [topics.slug]
	}),
	cards: many(cards),
}));

export const sourcesRelations = relations(sources, ({many}) => ({
	documents: many(documents),
	problems: many(problems),
}));

export const cardsRelations = relations(cards, ({one}) => ({
	cardBatch: one(cardBatches, {
		fields: [cards.batchId],
		references: [cardBatches.id]
	}),
	document: one(documents, {
		fields: [cards.documentId],
		references: [documents.id]
	}),
	problem: one(problems, {
		fields: [cards.problemSlug],
		references: [problems.slug]
	}),
	topic: one(topics, {
		fields: [cards.topicSlug],
		references: [topics.slug]
	}),
}));

export const cardBatchesRelations = relations(cardBatches, ({many}) => ({
	cards: many(cards),
}));

export const problemsRelations = relations(problems, ({one, many}) => ({
	cards: many(cards),
	topic: one(topics, {
		fields: [problems.patternSlug],
		references: [topics.slug]
	}),
	source: one(sources, {
		fields: [problems.sourceId],
		references: [sources.id]
	}),
	checkins: many(checkins),
}));

export const checkinsRelations = relations(checkins, ({one, many}) => ({
	problem: one(problems, {
		fields: [checkins.problemSlug],
		references: [problems.slug]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [checkins.userId],
		references: [usersInAuth.id]
	}),
	checkinNotes: many(checkinNotes),
}));

export const checkinNotesRelations = relations(checkinNotes, ({one}) => ({
	checkin: one(checkins, {
		fields: [checkinNotes.checkinId],
		references: [checkins.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [checkinNotes.userId],
		references: [usersInAuth.id]
	}),
}));

export const patternTricksRelations = relations(patternTricks, ({one}) => ({
	topic: one(topics, {
		fields: [patternTricks.patternSlug],
		references: [topics.slug]
	}),
}));

export const topicLinksRelations = relations(topicLinks, ({one}) => ({
	topic_fromSlug: one(topics, {
		fields: [topicLinks.fromSlug],
		references: [topics.slug],
		relationName: "topicLinks_fromSlug_topics_slug"
	}),
	topic_toSlug: one(topics, {
		fields: [topicLinks.toSlug],
		references: [topics.slug],
		relationName: "topicLinks_toSlug_topics_slug"
	}),
}));

export const integrationStatusRelations = relations(integrationStatus, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [integrationStatus.userId],
		references: [usersInAuth.id]
	}),
}));