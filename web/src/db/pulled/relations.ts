import { relations } from "drizzle-orm/relations";
import { usersInAuth, userApprovals, profiles, campaigns, pushSubscriptions, checkins, missions, topics, sources, documents, problems, cardBatches, cards, checkinNotes, cardReviews, patternTricks, aiUsage, coachThreads, coachMessages, coachMemory, solutionReviews, stories, mocks, mockDetails, weeklyReviews, topicLinks, topicProgress, readinessSnapshots, cardFlags, days, problemReviews, batchReviewItems, integrationStatus, cardState } from "./schema";

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
	campaigns: many(campaigns),
	pushSubscriptions: many(pushSubscriptions),
	missions: many(missions),
	checkins: many(checkins),
	cardBatches: many(cardBatches),
	checkinNotes: many(checkinNotes),
	cardReviews: many(cardReviews),
	aiUsages: many(aiUsage),
	coachThreads: many(coachThreads),
	coachMessages: many(coachMessages),
	coachMemories: many(coachMemory),
	solutionReviews: many(solutionReviews),
	stories: many(stories),
	mocks: many(mocks),
	mockDetails: many(mockDetails),
	weeklyReviews: many(weeklyReviews),
	topicProgresses: many(topicProgress),
	readinessSnapshots: many(readinessSnapshots),
	cardFlags: many(cardFlags),
	days: many(days),
	problemReviews: many(problemReviews),
	batchReviewItems: many(batchReviewItems),
	integrationStatuses: many(integrationStatus),
	cardStates: many(cardState),
}));

export const profilesRelations = relations(profiles, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [profiles.userId],
		references: [usersInAuth.id]
	}),
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
	solutionReviews: many(solutionReviews),
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
	problems: many(problems),
	cards: many(cards),
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

export const problemsRelations = relations(problems, ({one, many}) => ({
	topic: one(topics, {
		fields: [problems.patternSlug],
		references: [topics.slug]
	}),
	source: one(sources, {
		fields: [problems.sourceId],
		references: [sources.id]
	}),
	checkins: many(checkins),
	cards: many(cards),
	solutionReviews_nextProblemSlug: many(solutionReviews, {
		relationName: "solutionReviews_nextProblemSlug_problems_slug"
	}),
	solutionReviews_problemSlug: many(solutionReviews, {
		relationName: "solutionReviews_problemSlug_problems_slug"
	}),
	problemReviews: many(problemReviews),
}));

export const cardsRelations = relations(cards, ({one, many}) => ({
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
	cardReviews: many(cardReviews),
	cardFlags: many(cardFlags),
	batchReviewItems: many(batchReviewItems),
	cardStates: many(cardState),
}));

export const cardBatchesRelations = relations(cardBatches, ({one, many}) => ({
	cards: many(cards),
	usersInAuth: one(usersInAuth, {
		fields: [cardBatches.reviewedBy],
		references: [usersInAuth.id]
	}),
	batchReviewItems: many(batchReviewItems),
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

export const cardReviewsRelations = relations(cardReviews, ({one}) => ({
	card: one(cards, {
		fields: [cardReviews.cardId],
		references: [cards.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [cardReviews.userId],
		references: [usersInAuth.id]
	}),
}));

export const patternTricksRelations = relations(patternTricks, ({one}) => ({
	topic: one(topics, {
		fields: [patternTricks.patternSlug],
		references: [topics.slug]
	}),
}));

export const aiUsageRelations = relations(aiUsage, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [aiUsage.userId],
		references: [usersInAuth.id]
	}),
}));

export const coachThreadsRelations = relations(coachThreads, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [coachThreads.userId],
		references: [usersInAuth.id]
	}),
	coachMessages: many(coachMessages),
	solutionReviews: many(solutionReviews),
	mockDetails: many(mockDetails),
}));

export const coachMessagesRelations = relations(coachMessages, ({one}) => ({
	coachThread: one(coachThreads, {
		fields: [coachMessages.threadId],
		references: [coachThreads.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [coachMessages.userId],
		references: [usersInAuth.id]
	}),
}));

export const coachMemoryRelations = relations(coachMemory, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [coachMemory.userId],
		references: [usersInAuth.id]
	}),
}));

export const solutionReviewsRelations = relations(solutionReviews, ({one}) => ({
	checkin: one(checkins, {
		fields: [solutionReviews.checkinId],
		references: [checkins.id]
	}),
	problem_nextProblemSlug: one(problems, {
		fields: [solutionReviews.nextProblemSlug],
		references: [problems.slug],
		relationName: "solutionReviews_nextProblemSlug_problems_slug"
	}),
	problem_problemSlug: one(problems, {
		fields: [solutionReviews.problemSlug],
		references: [problems.slug],
		relationName: "solutionReviews_problemSlug_problems_slug"
	}),
	coachThread: one(coachThreads, {
		fields: [solutionReviews.threadId],
		references: [coachThreads.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [solutionReviews.userId],
		references: [usersInAuth.id]
	}),
}));

export const storiesRelations = relations(stories, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [stories.userId],
		references: [usersInAuth.id]
	}),
}));

export const mocksRelations = relations(mocks, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [mocks.userId],
		references: [usersInAuth.id]
	}),
	mockDetails: many(mockDetails),
}));

export const mockDetailsRelations = relations(mockDetails, ({one}) => ({
	mock: one(mocks, {
		fields: [mockDetails.mockId],
		references: [mocks.id]
	}),
	coachThread: one(coachThreads, {
		fields: [mockDetails.threadId],
		references: [coachThreads.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [mockDetails.userId],
		references: [usersInAuth.id]
	}),
}));

export const weeklyReviewsRelations = relations(weeklyReviews, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [weeklyReviews.userId],
		references: [usersInAuth.id]
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

export const cardFlagsRelations = relations(cardFlags, ({one}) => ({
	card: one(cards, {
		fields: [cardFlags.cardId],
		references: [cards.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [cardFlags.userId],
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

export const batchReviewItemsRelations = relations(batchReviewItems, ({one}) => ({
	cardBatch: one(cardBatches, {
		fields: [batchReviewItems.batchId],
		references: [cardBatches.id]
	}),
	card: one(cards, {
		fields: [batchReviewItems.cardId],
		references: [cards.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [batchReviewItems.decidedBy],
		references: [usersInAuth.id]
	}),
}));

export const integrationStatusRelations = relations(integrationStatus, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [integrationStatus.userId],
		references: [usersInAuth.id]
	}),
}));

export const cardStateRelations = relations(cardState, ({one}) => ({
	card: one(cards, {
		fields: [cardState.cardId],
		references: [cards.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [cardState.userId],
		references: [usersInAuth.id]
	}),
}));