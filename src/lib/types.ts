import type { Prisma, PrismaClient } from "@prisma/client";
import {
  conversationPopulated,
  participantPopulated,
} from "../graphql/resolvers/conversation";
import { Context } from "graphql-ws/lib/server";
import { PubSub } from "graphql-subscriptions";

export type Session = {
  user?: {
    name?: string | null;
    email?: string | null;
    emailVerified: boolean | null;
    image?: string | null;
    id?: string | null;
    username?: string | null;
  };
  expires: string;
};

export type GraphQLContext = {
  session?: Session | null;
  prisma: PrismaClient;
  pubsub: PubSub;
};

export type SubscriptionContext = Context & {
  connectionParams: {
    session?: Session;
  };
};

/**
 * Users
 */

export type CreateUsernameResponse = {
  success?: boolean;
  error?: string;
};

/**
 * Conversations
 */
export type ConversationPopulated = Prisma.ConversationGetPayload<{
  include: typeof conversationPopulated;
}>;

export type ParticipantPopulated = Prisma.ConversationParticipantGetPayload<{
  include: typeof participantPopulated;
}>;
