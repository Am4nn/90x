import { relations } from "drizzle-orm/relations";
import { usersInAuth, userApprovals, profiles, checkins, missions, campaigns, pushSubscriptions, topics, sources, documents, cardBatches, cards, problems, checkinNotes, patternTricks, topicLinks, topicProgress, readinessSnapshots, days, problemReviews, integrationStatus } from "./schema";

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

export const usersInAuthRelations = relations(usersInAuth, ({many}) => ({
	userApprovals_decidedBy: many(userApprovals, {
		relationName: "userApprovals_decidedBy_usersInAuth_id"
	}),
	userApprovals_userId: many(userApprovals, {
		relationName: "userApprovals_userId_usersInAuth_id"
	}),
	profiles: many(profiles),
	missions: many(missions),
	campaigns: many(campaigns),
	pushSubscriptions: many(pushSubscriptions),
	checkins: many(checkins),
	checkinNotes: many(checkinNotes),
	topicProgresses: many(topicProgress),
	readinessSnapshots: many(readinessSnapshots),
	days: many(days),
	problemReviews: many(problemReviews),
	integrationStatuses: many(integrationStatus),
}));

export const profilesRelations = relations(profiles, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [profiles.userId],
		references: [usersInAuth.id]
	}),
}));

export const missionsRelations = relations(missions, ({one}) => ({
	checkin: one(checkins, {
		fields: [missions.checkinId],
		references: [checkins.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [missions.userId],
		references: [usersInAuth.id]
	}),
}));

export const checkinsRelations = relations(checkins, ({one, many}) => ({
	missions: many(missions),
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

export const campaignsRelations = relations(campaigns, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [campaigns.userId],
		references: [usersInAuth.id]
	}),
	days: many(days),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [pushSubscriptions.userId],
		references: [usersInAuth.id]
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
	topicProgresses: many(topicProgress),
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
	problemReviews: many(problemReviews),
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

export const topicProgressRelations = relations(topicProgress, ({one}) => ({
	topic: one(topics, {
		fields: [topicProgress.topicSlug],
		references: [topics.slug]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [topicProgress.userId],
		references: [usersInAuth.id]
	}),
}));

export const readinessSnapshotsRelations = relations(readinessSnapshots, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [readinessSnapshots.userId],
		references: [usersInAuth.id]
	}),
}));

export const daysRelations = relations(days, ({one}) => ({
	campaign: one(campaigns, {
		fields: [days.campaignId],
		references: [campaigns.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [days.userId],
		references: [usersInAuth.id]
	}),
}));

export const problemReviewsRelations = relations(problemReviews, ({one}) => ({
	problem: one(problems, {
		fields: [problemReviews.problemSlug],
		references: [problems.slug]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [problemReviews.userId],
		references: [usersInAuth.id]
	}),
}));

export const integrationStatusRelations = relations(integrationStatus, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [integrationStatus.userId],
		references: [usersInAuth.id]
	}),
}));