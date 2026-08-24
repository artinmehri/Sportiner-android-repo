import { getCurrentUserId, supabase } from "./AuthContext";
import { router } from 'expo-router';
import { hydrateChatImage, removeChatImage } from '@/lib/chatImages';
import { isUgcTextRejectedError } from '@/lib/ugcModeration';

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ModerationReportInput = {
    reportedUserId: string;
    reportedMessageId?: string | null;
    reportedPostId?: string | null;
    reason: string;
    details?: string;
};

async function getChatMemberIds(chatId: string): Promise<string[]> {
    const { data, error } = await supabase
        .from('conversation_members')
        .select('id')
        .eq('chat_id', chatId);

    if (error) {
        console.log('Error fetching chat members:', error.message);
        return [];
    }

    return (data ?? [])
        .map((member: { id: string | null }) => member.id)
        .filter(Boolean) as string[];
}

async function hasBlockedRelationshipInChat(chatId: string, senderId: string): Promise<boolean> {
    const memberIds = await getChatMemberIds(chatId);
    const otherMemberIds = memberIds.filter((memberId) => memberId !== senderId);

    if (otherMemberIds.length === 0) {
        return false;
    }

    const { data, error } = await supabase
        .from('blocked_users')
        .select('blocker_id, blocked_id')
        .in('blocker_id', [senderId, ...otherMemberIds])
        .in('blocked_id', [senderId, ...otherMemberIds]);

    if (error) {
        console.log('Error checking blocked chat relationship:', error.message);
        return false;
    }

    return (data ?? []).some((row: { blocker_id: string; blocked_id: string }) => (
        row.blocker_id === senderId || row.blocked_id === senderId
    ));
}

export async function submitModerationReport({
    reportedUserId,
    reportedMessageId = null,
    reportedPostId = null,
    reason,
    details = '',
}: ModerationReportInput) {
    const userId = await getCurrentUserId();
    if (!userId?.id || !reportedUserId || userId.id === reportedUserId) return false;

    const { error } = await supabase
        .from('reports')
        .insert({
            reporter_id: userId.id,
            reported_user_id: reportedUserId,
            reported_message_id: reportedMessageId,
            reported_post_id: reportedPostId,
            reason,
            details: details.trim() || null,
        });

    if (error) {
        console.log('Error submitting report:', error.message);
        return false;
    }

    return true;
}

export async function blockUser(blockedUserId: string) {
    const userId = await getCurrentUserId();
    if (!userId?.id || !blockedUserId || userId.id === blockedUserId) return false;

    const { error } = await supabase
        .from('blocked_users')
        .insert({
            blocker_id: userId.id,
            blocked_id: blockedUserId,
        });

    if (error && error.code !== '23505') {
        console.log('Error blocking user:', error.message);
        return false;
    }

    return true;
}

// Checking if the user is already in chat
export async function userInChat(gameId: string) {
    if (!gameId || !UUID_RE.test(gameId)) return false;

    const userId = await getCurrentUserId();

    if (!userId?.id) return false;

    const { data: member, error } = await supabase
        .from('conversation_members')
        .select('id')
        .eq('game_id', gameId)
        .eq('id', userId.id)
        .maybeSingle();

        if (error) {
            console.log(error.message)
            return false
        }

        if (member === null) {
            console.log('returned null!')
            return false
        }
        return !!member;
}

export async function getChatId(gameId: string) {
    if (!gameId || !UUID_RE.test(gameId)) return null;

    const userId = await getCurrentUserId();

    if (!userId?.id) return null;

    const { data: member, error } = await supabase
        .from('conversation_members')
        .select('chat_id')
        .eq('game_id', gameId)
        .eq('id', userId.id)
        .maybeSingle();

    if (error) {
        console.log('Error fetching chat id from membership:', error.message)
        return null
    }

    if (member?.chat_id) {
        return member.chat_id;
    }

    const { data: chat, error: chatError } = await supabase
        .from('chat')
        .select('id')
        .eq('game_id', gameId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (chatError) {
        console.log('Error fetching chat id from game:', chatError.message);
        return null;
    }

    return chat?.id ?? null;
}

// Adding user to chat
export async function addUserToChat(gameId: string, gameType?: string | null) {
    if (!gameId || !UUID_RE.test(gameId)) return null;
    void gameType;

    const { data: chatId, error } = await supabase.rpc('ensure_game_chat_membership_v1', {
        p_game_id: gameId,
    });

    if (error || typeof chatId !== 'string') {
        console.log(
            'Unable to ensure game chat membership:',
            error?.message,
            error?.code,
            gameId,
        );
        return null;
    }

    console.log('user successfully added to chat');
    return chatId;
}

export async function replyMessage(reply_to: string, type: string, reply_message: string, chatId: string, image?: string) {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const now = new Date().toISOString();

    const blocked = await hasBlockedRelationshipInChat(chatId, userId.id);
    if (blocked) {
        console.log('Blocked relationship prevents reply in chat:', chatId);
        return null;
    }

    const { data, error } = await supabase
    .from('messages').insert({
        chat_id: chatId,
        sender_id: userId.id,
        reply_to: reply_to,
        message: reply_message,
        is_reply: true,
        type: type,
        image: image,
        created_at: now,
    })
    .select()
    .single();

    if (error) {
        if (isUgcTextRejectedError(error)) throw error;
        console.log(error.message)
        return null;
    }

    console.log('user message added successfully!')

    await supabase
    .from('chat')
    .update({
        last_message: reply_message,
        last_message_at: now,
        last_message_id: data.id,
        last_message_sender_id: userId.id,
        updated_at: now,
    })
    .eq('id', chatId);

    // Sender has already "read" their own outbound message.
    const { error: readError } = await supabase
        .from('conversation_members')
        .update({
            last_read_message_id: data.id,
            last_read_at: now
        })
        .eq('chat_id', chatId)
        .eq('id', userId.id);

    if (readError) {
        console.log('Failed to advance sender read cursor after reply:', readError.message);
    }

    return data;
}


export async function sendMessage(
    message: string,
    type: string,
    chatId: string,
    image?: string,
    messageId?: string,
) {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const now = new Date().toISOString();

    const blocked = await hasBlockedRelationshipInChat(chatId, userId.id);
    if (blocked) {
        console.log('Blocked relationship prevents message in chat:', chatId);
        return null;
    }

    const { data: inserted, error } = await supabase
    .from('messages')
    .insert({
        ...(messageId ? { id: messageId } : {}),
        chat_id: chatId,
        sender_id: userId.id,
        type: type,
        message: message,
        image: image,
        created_at: now,
    })
    .select()
    .single();

    let data = inserted;
    if (error) {
        if (messageId && error.code === '23505') {
            const { data: existing, error: existingError } = await supabase
                .from('messages')
                .select()
                .eq('id', messageId)
                .eq('sender_id', userId.id)
                .maybeSingle();

            if (!existingError && existing?.chat_id === chatId && existing.image === image) {
                data = existing;
            } else {
                console.log(existingError?.message ?? error.message);
                return null;
            }
        } else {
            if (isUgcTextRejectedError(error)) throw error;
            console.log(error.message);
            return null;
        }
    }

    await supabase
    .from('chat')
    .update({
        last_message: message,
        last_message_at: now,
        last_message_id: data.id,
        last_message_sender_id: userId.id,
        updated_at: now,
    })
    .eq('id', chatId);

    // Sender has already "read" their own outbound message.
    const { error: readError } = await supabase
        .from('conversation_members')
        .update({
            last_read_message_id: data.id,
            last_read_at: now
        })
        .eq('chat_id', chatId)
        .eq('id', userId.id);

    if (readError) {
        console.log('Failed to advance sender read cursor after send:', readError.message);
    }

    return hydrateChatImage(data);
}

export async function getGameInfo(chatId: string) {
    const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('chat_id', chatId)

    if (data) {
        return data
    }

    if (error) {
        console.log(error)
    }
}


export async function getMessages(chatId: string) {
    const userId = await getCurrentUserId();
    if (!userId?.id) return [];

    const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })

    if (error) {
        console.log(error.message)
        return [];
    }

    if (data) {
        const { data: blockedRows, error: blockedError } = await supabase
            .from('blocked_users')
            .select('blocker_id, blocked_id')
            .or(`blocker_id.eq.${userId.id},blocked_id.eq.${userId.id}`);

        const blockedPeerIds = new Set(
            (blockedRows ?? []).map((row: { blocker_id: string; blocked_id: string }) => (
                row.blocker_id === userId.id ? row.blocked_id : row.blocker_id
            ))
        );

        const visibleMessages = blockedError
            ? data
            : data.filter((message: { sender_id?: string }) => !blockedPeerIds.has(message.sender_id ?? ''));

        if (blockedError) {
            console.log('Error filtering blocked chat messages:', blockedError.message);
        }

        return Promise.all(visibleMessages.map((message) => hydrateChatImage(message)));
    }

    return [];
}
 

export async function getplayers(gameId: string) {
    const {data, error} = await supabase
    .from('game_players')
    .select(`
        *,
        user:users (
            id,
            name,
            profile_picture,
            level
        )
    `)
    .eq('game_id', gameId)

    if (data) {
        return data
    }

    if (error) {
        console.log('error')
    }
}

export async function getConversationMemberIds(chatId: string): Promise<string[]> {
    const { data, error } = await supabase
    .from('conversation_members')
    .select('id')
    .eq('chat_id', chatId);

    if (error) {
        console.log(error.message);
        return [];
    }

    return (data ?? []).map((member) => member.id as string);
}


export async function editMessage(messageId: string, message: string) {
    const currentUser = await getCurrentUserId();
    if (!currentUser?.id) return null;

    const { data, error } = await supabase
    .from('messages')
    .update({
        message,
        is_edited: true
    })
    .eq('id', messageId)
    .eq('sender_id', currentUser.id)
    .select()
    .maybeSingle();

    if (error) {
        if (isUgcTextRejectedError(error)) throw error;
        console.log(error.message);
        return null;
    }

    if (data) {
        const { error: chatError } = await supabase
            .from('chat')
            .update({
                last_message: data.message,
                updated_at: new Date().toISOString(),
            })
            .eq('last_message_id', messageId);

        if (chatError) {
            console.log('Failed to refresh chat preview after edit:', chatError.message);
        }
    }

    return data;
}


export async function deleteMessage(messageId: string) {
    const userId = await getCurrentUserId();
    if (!userId?.id) return false;

    const { data: message, error: messageError } = await supabase
        .from('messages')
        .select('id, chat_id, image')
        .eq('id', messageId)
        .eq('sender_id', userId.id)
        .maybeSingle();

    if (messageError || !message?.chat_id) {
        console.log(messageError?.message ?? 'message lookup returned no row');
        return false;
    }

    if (message.image && !message.image.startsWith('http')) {
        try {
            await removeChatImage(message.image);
        } catch (error) {
            console.log('Failed to remove chat image before message delete:', error);
            return false;
        }
    }

    const deleteRow = () => supabase
        .from('messages')
        .delete()
        .eq('id', messageId)
        .eq('sender_id', userId.id)
        .select('id, chat_id')
        .maybeSingle();

    let { data: deleted, error } = await deleteRow();
    if (error || !deleted?.chat_id) {
        // Storage is already gone, so retry only the idempotent row delete.
        ({ data: deleted, error } = await deleteRow());
    }

    if (error || !deleted?.chat_id) {
        console.log(error?.message ?? 'message delete returned no row');
        return false;
    }

    const { data: latest } = await supabase
        .from('messages')
        .select('id, message, created_at, sender_id')
        .eq('chat_id', deleted.chat_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    const { error: chatError } = await supabase
        .from('chat')
        .update({
            last_message: latest?.message ?? null,
            last_message_at: latest?.created_at ?? null,
            last_message_id: latest?.id ?? null,
            last_message_sender_id: latest?.sender_id ?? null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', deleted.chat_id);

    if (chatError) {
        console.log('Failed to refresh chat preview after delete:', chatError.message);
    }

    return true;
}

export async function markAsRead(chatId: string) {
    const userId = await getCurrentUserId();
    if (!userId) return false;

    try {
        const { data: latestMessage } = await supabase
            .from('messages')
            .select('id, created_at')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!latestMessage) return true;

        const { data: membership } = await supabase
            .from('conversation_members')
            .select('last_read_message_id, last_read_at')
            .eq('chat_id', chatId)
            .eq('id', userId.id)
            .maybeSingle();

        // Inbox badge bumps can advance last_read_at without last_read_message_id.
        // Always sync the message cursor when it lags, even if last_read_at is ahead.
        if (membership?.last_read_message_id === latestMessage.id) {
            return true;
        }

        const nextReadAt =
            !membership?.last_read_at || latestMessage.created_at >= membership.last_read_at
                ? latestMessage.created_at
                : membership.last_read_at;

        const { error } = await supabase
            .from('conversation_members')
            .update({
                last_read_message_id: latestMessage.id,
                last_read_at: nextReadAt,
            })
            .eq('chat_id', chatId)
            .eq('id', userId.id);

        if (error) {
            console.log('Error marking conversation as read:', error.message, 'chatId:', chatId, 'userId:', userId.id);
            return false;
        }

        return true;
    } catch (error) {
        console.log('Exception in markAsRead:', error, 'chatId:', chatId);
        return false;
    }
}

export async function getConversations() {
    const userId = await getCurrentUserId();
    if (!userId) return;

    const { data, error } = await supabase
    .from('chat')
    .select(`
        id,
        type,
        name,
        photo,
        last_message,
        last_message_sender_id,
        last_message_at,
        last_message_id,
        conversation_members!inner (   
            id,
            last_read_message_id,
            last_read_at
        ),
        members:conversation_members (  
            user:users (
                id,
                name,
                profile_picture
            )
        )
    `)
    .eq('conversation_members.id', userId.id)
    .order('last_message_at', { ascending: false });

    if (error) {
        console.log('Error fetching conversations:', error.message);
        return [];
    }

    if (data) {
        const { data: blockedRows, error: blockedError } = await supabase
            .from('blocked_users')
            .select('blocker_id, blocked_id')
            .or(`blocker_id.eq.${userId.id},blocked_id.eq.${userId.id}`);

        if (blockedError) {
            console.log('Error fetching blocked conversations:', blockedError.message);
            return data;
        }

        const blockedPeerIds = new Set(
            (blockedRows ?? []).map((row: { blocker_id: string; blocked_id: string }) => (
                row.blocker_id === userId.id ? row.blocked_id : row.blocker_id
            ))
        );

        return data
            .filter((chat: { members?: { user?: { id?: string } | { id?: string }[] | null }[] }) => {
                const memberIds = (chat.members ?? [])
                    .map((member) => Array.isArray(member.user) ? member.user[0]?.id : member.user?.id)
                    .filter(Boolean) as string[];

                return !memberIds.some((memberId) => blockedPeerIds.has(memberId));
            })
            .map((chat) => {
                const memberships = Array.isArray(chat.conversation_members)
                    ? chat.conversation_members
                    : chat.conversation_members
                      ? [chat.conversation_members]
                      : [];
                // The embed can include peer rows when aliased twice — keep only mine.
                const myMembership = memberships.find((membership) => membership.id === userId.id);

                return {
                    ...chat,
                    conversation_members: myMembership ? [myMembership] : [],
                };
            });
    }

    return [];
}

export async function getUnreadCount(chatId: string) {
    const userId = await getCurrentUserId();
    if (!userId) return 0;

    // Step 1 — get your last_read_message_id
    const { data: member } = await supabase
    .from('conversation_members')
    .select('last_read_at')
    .eq('chat_id', chatId)
    .eq('id', userId.id)
    .single();

    if (!member) return 0;

    // Step 2 — count messages after last_read_message_id
const { count } = await supabase
.from('messages')
.select('id', { count: 'exact' })
.eq('chat_id', chatId)
.neq('sender_id', userId.id)
.gt('created_at', member.last_read_at);

return count ?? 0;
}

export async function getTotalUnreadCount() {
    const userId = await getCurrentUserId();
    if (!userId) return 0;

    // Get all conversations with their last_read_at
    const { data: conversations } = await supabase
        .from('conversation_members')
        .select('chat_id, last_read_at')
        .eq('id', userId.id);

    if (!conversations || conversations.length === 0) return 0;

    let totalUnread = 0;

    for (const conversation of conversations) {
        const { count } = await supabase
            .from('messages')
            .select('id', { count: 'exact' })
            .eq('chat_id', conversation.chat_id)
            .neq('sender_id', userId.id)
            .gt('created_at', conversation.last_read_at);

        totalUnread += count ?? 0;
    }

    return totalUnread;
}

export async function chatNavigator(chatId: string, type: any) {
    await markAsRead(chatId);

    const normalized = String(type || '').toLowerCase();

    const is1v1 =
        normalized === '1v1' ||
        normalized.includes('1v1') ||
        normalized.includes('1-1') ||
        normalized.includes('1 vs 1') ||
        normalized.includes('1v 1');

    if (is1v1) {
        console.log('navigating to private chat');
        router.push({
            pathname: '/chat/[id]',
            params: { id: chatId },
        });
        return;
    }

    console.log('navigating to group chat');
    router.push({
        pathname: '/groupchat/[id]',
        params: { id: chatId },
    });
}

export async function createChat(
    type: string,
    name: string,
    photo: string,
    gameId: string,
    image: string,
    members: Array<{ id: string; level: string }>
) {
    void type;
    void name;
    void photo;
    void image;
    void members;

    const { data: chatId, error } = await supabase.rpc('ensure_game_chat_membership_v1', {
        p_game_id: gameId,
    });

    if (error || typeof chatId !== 'string') {
        throw new Error(error?.message ?? 'Failed to create game chat');
    }

    return chatId;
}

export async function findOtherPlayer(chatId: string) {
    const currentUser = await getCurrentUserId();
    if (!currentUser?.id) return null;

    const { data, error } = await supabase
        .from('conversation_members')
        .select('id')
        .eq('chat_id', chatId);

    if (error) {
        throw new Error(error.message);
    }

    const otherMember = data?.find((member) => member.id !== currentUser.id);
    return otherMember?.id ?? null;
}


export async function getChatMembers(chatId: string) {
    
    const { data, error } = await supabase
    .from('conversation_members')
    .select('*')
    .eq('chat_id', chatId)

    if (data) {
        return data
    } 

    if (error) {
        console.log('error occured! ')
    }
}
