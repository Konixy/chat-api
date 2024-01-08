import { GraphQLError, subscribe } from 'graphql';
import { ConversationPopulated, GraphQLContext } from '../../lib/types';
import { ConversationParticipant, Prisma } from '@prisma/client';
import { withFilter } from 'graphql-subscriptions';
import { userIsConversationParticipant } from '../../lib/util';

const resolvers = {
  Query: {
    conversations: async (_: any, __: any, { session, prisma }: GraphQLContext): Promise<ConversationPopulated[]> => {
      if (!session?.user) {
        throw new GraphQLError('Not authorized.');
      }

      const {
        user: { id: userId },
      } = session;

      try {
        const conversations = await prisma.conversation.findMany({
          where: {
            participants: {
              some: {
                userId: {
                  equals: userId,
                },
              },
            },
          },
          include: conversationPopulated,
        });

        return conversations;
      } catch (err) {
        console.log('conversations ERROR', err);
        throw new GraphQLError(err.message);
      }
    },
  },
  Mutation: {
    createConversation: async (
      _: any,
      { participantsIds }: { participantsIds: string[] },
      { session, prisma, pubsub }: GraphQLContext,
    ): Promise<{ conversationId: string }> => {
      if (!session.user) throw new GraphQLError('Not authorized.');

      const {
        user: { id: userId },
      } = session;

      try {
        // if a conversation exists with the following participants, just return the conversation id of the existing conversation

        if (participantsIds.length === 2) {
          prisma.conversation.findFirst({
            where: {
              participants: {},
            },
          });
        }

        const conversation = await prisma.conversation.create({
          data: {
            id: String(Date.now()),
            participants: {
              createMany: {
                data: participantsIds.map((id) => ({
                  userId: id,
                  hasSeenAllMessages: id === userId,
                })),
              },
            },
          },
          include: conversationPopulated,
        });

        pubsub.publish('CONVERSATION_UPDATED', {
          conversationUpdated: conversation,
        });

        return {
          conversationId: conversation.id,
        };
      } catch (err) {
        console.log('createConversation ERROR', err);
        throw new GraphQLError('Error creating conversation');
      }
    },
    markConversationAsRead: async (_: any, { conversationId }: { conversationId: string }, { session, prisma, pubsub }: GraphQLContext): Promise<boolean> => {
      if (!session.user) throw new GraphQLError('Not authorized.');

      const {
        user: { id: userId },
      } = session;

      try {
        const participant = await prisma.conversationParticipant.findFirst({
          where: {
            userId,
            conversationId,
          },
        });

        if (!participant) throw new GraphQLError('Participant entity not found.');

        if (participant.hasSeenAllMessages) return true;

        await prisma.conversationParticipant.update({
          where: {
            id: participant.id,
          },
          data: {
            hasSeenAllMessages: true,
          },
        });

        return true;
      } catch (err) {
        console.log('markConversationAsRead ERROR', err);
        throw new GraphQLError('Error marking conversation as read');
      }
    },
    deleteConversation: async (_: any, { conversationId }: { conversationId: string }, { session, prisma, pubsub }: GraphQLContext): Promise<boolean> => {
      if (!session.user) throw new GraphQLError('Not authorized.');

      try {
        const conversation = await prisma.conversation.findUnique({
          where: {
            id: conversationId,
          },
          include: conversationPopulated,
        });

        if (!conversation) throw new GraphQLError('Conversation not found.');
        if (conversation.participants.length > 2) throw new GraphQLError('Cannot delete a conversation with more than 2 members.');

        await prisma.$transaction([
          prisma.conversationParticipant.deleteMany({
            where: {
              conversationId,
            },
          }),
          prisma.conversation.update({
            where: {
              id: conversationId,
            },
            data: {
              latestMessage: {
                disconnect: true,
              },
            },
          }),
          prisma.message.deleteMany({
            where: {
              conversationId,
            },
          }),
          prisma.conversation.delete({
            where: {
              id: conversationId,
            },
          }),
        ]);

        pubsub.publish('CONVERSATION_DELETED', {
          conversationDeleted: conversation,
        });

        return true;
      } catch (err) {
        console.log('deleteConversation ERROR', err);
        throw new GraphQLError('Failed to delete conversation.');
      }
    },
    leaveConversation: async (_: any, { conversationId }: { conversationId: string }, { session, prisma, pubsub }: GraphQLContext): Promise<boolean> => {
      if (!session.user) throw new GraphQLError('Not authorized.');

      const {
        user: { id: userId },
      } = session;

      try {
        const conversation = await prisma.conversation.findUnique({
          where: {
            id: conversationId,
          },
          include: conversationPopulated,
        });
        const participant = conversation.participants.find((p) => p.userId === userId);

        if (!conversation) throw new GraphQLError('Conversation not found.');
        if (conversation.participants.length < 3) throw new GraphQLError('Cannot leave a conversation with less than 3 members.');

        const newConversation = await prisma.conversation
          .update({
            where: {
              id: conversationId,
            },
            data: {
              participants: {
                delete: {
                  id: participant.id,
                },
              },
            },
            include: conversationPopulated,
          })
          .catch((err) => {
            console.log(err);
            throw new GraphQLError(err);
          });

        // conversation = await prisma.conversation.findUnique({
        //   where: {
        //     id: conversationId,
        //   },
        //   include: conversationPopulated,
        // });

        pubsub.publish('CONVERSATION_PARTICIPANT_DELETED', {
          conversationParticipantDeleted: {
            participantId: participant.id,
            oldConversation: conversation,
            newConversation,
          },
        });

        return true;
      } catch (err) {
        console.log('leaveConversation ERROR', err);
        throw new GraphQLError('Failed to leave conversation.');
      }
    },
    addParticipants: async (
      _: any,
      { conversationId, userIds }: { conversationId: string; userIds: string[] },
      { session, prisma, pubsub }: GraphQLContext,
    ): Promise<boolean> => {
      if (!session.user) throw new GraphQLError('Not authorized.');

      const {
        user: { id: userId },
      } = session;

      try {
        const conversation = await prisma.conversation.findUnique({
          where: {
            id: conversationId,
          },
        });

        if (!conversation) throw new GraphQLError('Conversation not found.');

        const users = await prisma.user.findMany({
          where: {
            id: {
              in: userIds,
            },
          },
        });

        if (users.length < 1) throw new GraphQLError('This user does not exist.');

        const newConversation = await prisma.conversation.update({
          where: {
            id: conversationId,
          },
          data: {
            participants: {
              createMany: {
                data: users.map((u) => ({
                  hasSeenAllMessages: false,
                  userId: u.id,
                })),
              },
            },
          },
          include: conversationPopulated,
        });

        pubsub.publish('CONVERSATION_UPDATED', {
          conversationUpdated: newConversation,
        });

        return true;
      } catch (err) {
        console.log('addParticipant ERROR', err);
      }
    },
  },
  Subscription: {
    conversationUpdated: {
      subscribe: withFilter(
        (_, __, { pubsub }: GraphQLContext) => pubsub.asyncIterator('CONVERSATION_UPDATED'),
        ({ conversationUpdated: { participants } }: { conversationUpdated: ConversationPopulated }, _, { session }: GraphQLContext) => {
          if (!session.user) throw new GraphQLError('Not Authorized.');

          return userIsConversationParticipant(participants, session.user.id);
        },
      ),
    },
    conversationDeleted: {
      subscribe: withFilter(
        (_, __, { pubsub }: GraphQLContext) => pubsub.asyncIterator('CONVERSATION_DELETED'),
        ({ conversationDeleted }: { conversationDeleted: ConversationPopulated }, _, { session }: GraphQLContext) => {
          if (!session.user) throw new GraphQLError('Not Authorized.');
          return userIsConversationParticipant(conversationDeleted.participants, session.user.id);
        },
      ),
    },
    conversationParticipantDeleted: {
      subscribe: withFilter(
        (_, __, { pubsub }: GraphQLContext) => pubsub.asyncIterator('CONVERSATION_PARTICIPANT_DELETED'),
        (
          {
            conversationParticipantDeleted,
          }: { conversationParticipantDeleted: { participantId: string; oldConversation: ConversationPopulated; newConversation: ConversationPopulated } },
          _,
          { session }: GraphQLContext,
        ) => {
          if (!session.user) throw new GraphQLError('Not Authorized.');

          return userIsConversationParticipant(conversationParticipantDeleted.oldConversation.participants, session.user.id);
        },
      ),
    },
  },
};

export type ConversationSubscriptionPayload<SubscriptionName extends string> = {
  [Property in SubscriptionName]: ConversationPopulated;
};

export const userPopulated = {
  id: true,
  username: true,
  name: true,
  image: true,
};

export const participantPopulated = Prisma.validator<Prisma.ConversationParticipantInclude>()({
  user: {
    select: userPopulated,
  },
});

export const conversationPopulated = Prisma.validator<Prisma.ConversationInclude>()({
  participants: {
    include: participantPopulated,
  },
  latestMessage: {
    include: {
      sender: {
        select: userPopulated,
      },
    },
  },
});

export default resolvers;
