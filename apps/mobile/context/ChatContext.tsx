import { getCurrentUser, getCurrentUserId, supabase } from "./AuthContext";
import { router } from 'expo-router';

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ModerationReportInput = {
    reportedUserId: string;
    reportedMessageId?: string | null;
    reportedPostId?: string | null;
    reason: string;
    details?: string;
};

type GameChatMetadata = {
    title: string | null;
    type: string | null;
    image: string | null;
    chat_id: string | null;
};

type ExistingChat = {
    id: string;
};

function normalizeGameChatType(type: string | null | undefined) {
    const normalized = String(type || '').toLowerCase();
    return normalized.includes('1v1') || normalized.includes('1-1') || normalized.includes('1 vs 1')
        ? 'private'
        : 'group';
}

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    reportedPostId = null,
    reason,
}: ModerationReportInput) {
    const userId = await getCurrentUserId();
    if (!userId?.id || !reportedUserId || userId.id === reportedUserId) return false;

    const { error } = await supabase
        .from('reports')
        .insert({
            reporter_id: userId.id,
            reported_user_id: reportedUserId,
            reported_post_id: reportedPostId,
            reason,
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

async function getGameChatMetadata(gameId: string): Promise<GameChatMetadata | null> {
    const { data, error } = await supabase
        .from('games')
        .select('title, type, image, chat_id')
        .eq('id', gameId)
        .maybeSingle();

    if (error) {
        console.log('Error fetching game metadata for chat:', error.message, error.code);
        return null;
    }

    return data as GameChatMetadata | null;
}

async function findExistingGameChat(gameId: string, chatId?: string | null): Promise<ExistingChat | null> {
    if (chatId) {
        const { data, error } = await supabase
            .from('chat')
            .select('id')
            .eq('id', chatId)
            .maybeSingle();

        if (error) {
            console.log('Error fetching game chat by id:', error.message, error.code);
        }

        if (data?.id) {
            return data as ExistingChat;
        }
    }

    const { data, error } = await supabase
        .from('chat')
        .select('id')
        .eq('game_id', gameId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.log('Error fetching game chat by game id:', error.message, error.code);
        return null;
    }

    return data as ExistingChat | null;
}

async function getOrCreateGameChat(gameId: string, gameType?: string | null): Promise<string | null> {
    const game = await getGameChatMetadata(gameId);

    if (!game) {
        return null;
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
        const existing = await findExistingGameChat(gameId, game.chat_id);

        if (existing?.id) {
            return existing.id;
        }

        await sleep(200);
    }

    const now = new Date().toISOString();
    const chatType = normalizeGameChatType(gameType ?? game.type);

    const { data: createdChat, error: createError } = await supabase
        .from('chat')
        .insert({
            type: chatType,
            name: game.title || 'Tennis Game',
            photo: game.image || null,
            last_message: null,
            last_message_at: null,
            created_at: now,
            updated_at: now,
            game_id: gameId,
        })
        .select('id')
        .single();

    if (createError || !createdChat?.id) {
        if (createError?.code === '23505') {
            const existing = await findExistingGameChat(gameId, game.chat_id);
            return existing?.id ?? null;
        }

        console.log('Error creating game chat:', createError?.message, createError?.code);
        return null;
    }

    const { error: updateGameError } = await supabase
        .from('games')
        .update({ chat_id: createdChat.id })
        .eq('id', gameId);

    if (updateGameError) {
        console.log('Error attaching chat to game:', updateGameError.message, updateGameError.code);
    }

    return createdChat.id;
}

async function ensureCurrentUserChatMembership(gameId: string, chatId: string) {
    const user = await getCurrentUser();
    const userId = await getCurrentUserId();

    if (!user || !userId?.id) {
        console.log('Error adding user to chat: missing current user');
        return false;
    }

    const { error } = await supabase
        .from('conversation_members')
        .upsert({
            id: userId.id,
            chat_id: chatId,
            joined_at: new Date().toISOString(),
            last_read_message_id: null,
            level: user.level,
            game_id: gameId,
        }, { onConflict: 'id,chat_id', ignoreDuplicates: true });

    if (error) {
        console.log('Error adding user to chat:', error.message, error.code);
        return false;
    }

    return true;
}

// Adding user to chat
export async function addUserToChat(gameId: string, gameType?: string | null) {
    if (!gameId || !UUID_RE.test(gameId)) return null;

    const alreadyInChat = await userInChat(gameId);
    if (alreadyInChat) {
        return getChatId(gameId);
    }

    const chatId = await getOrCreateGameChat(gameId, gameType);

    if (!chatId) {
        console.log('Unable to find or create chat for game:', gameId);
        return null;
    }

    const addedToChat = await ensureCurrentUserChatMembership(gameId, chatId);

    if (!addedToChat) {
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

    // Update sender's own read state to the message just sent
    await supabase
        .from('conversation_members')
        .update({
            last_read_message_id: data.id,
            last_read_at: now
        })
        .eq('chat_id', chatId)
        .eq('id', userId.id);

    return data;
}


export async function sendMessage(message: string, type: string, chatId: string, image?: string) {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const now = new Date().toISOString();

    const blocked = await hasBlockedRelationshipInChat(chatId, userId.id);
    if (blocked) {
        console.log('Blocked relationship prevents message in chat:', chatId);
        return null;
    }

    const { data, error } = await supabase
    .from('messages')
    .insert({
        chat_id: chatId,
        sender_id: userId.id,
        type: type,
        message: message,
        image: image,
        created_at: now,
    })
    .select()
    .single();

    if (error) {
        console.log(error.message);
        return null;
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

    // Update sender's own read state to the message just sent
    await supabase
        .from('conversation_members')
        .update({
            last_read_message_id: data.id,
            last_read_at: now
        })
        .eq('chat_id', chatId)
        .eq('id', userId.id);

    return data;
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

        if (blockedError) {
            console.log('Error filtering blocked chat messages:', blockedError.message);
            return data;
        }

        const blockedPeerIds = new Set(
            (blockedRows ?? []).map((row: { blocker_id: string; blocked_id: string }) => (
                row.blocker_id === userId.id ? row.blocked_id : row.blocker_id
            ))
        );

        return data.filter((message: { sender_id?: string }) => !blockedPeerIds.has(message.sender_id ?? ''));
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


export async function editMessage(messageId: string, message: string) {

    const { data, error } = await supabase
    .from('messages').update({
        message: message,
        is_edited: true
    }).eq('id', messageId)
    .select();

    if (data) {
        console.log('user message added successfully!')
    }

    if (error) {
        console.log(error.message)
    }
}


export async function deleteMessage(messageId: string) {
    const userId = await getCurrentUserId();
    if (!userId?.id) return false;

    const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId)
    .eq('sender_id', userId.id);

    if (error) {
        console.log(error.message);
        return false;
    }

    console.log('message deleted successfully!');
    return true;
}

export async function markAsRead(chatId: string) {
    const userId = await getCurrentUserId();
    if (!userId) return;

    try {
        // Step 1 — get latest message with created_at
        const { data: latestMessage } = await supabase
            .from('messages')
            .select('id, created_at')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!latestMessage) return;

        // Step 2 — update user read state with regression guard
        const { error } = await supabase
            .from('conversation_members')
            .update({
                last_read_message_id: latestMessage.id,
                last_read_at: latestMessage.created_at
            })
            .eq('chat_id', chatId)
            .eq('id', userId.id)
            .lt('last_read_at', latestMessage.created_at); // Regression guard: only update if moving forward

        if (error) {
            console.log('Error marking conversation as read:', error.message, 'chatId:', chatId, 'userId:', userId.id);
        }
    } catch (error) {
        console.log('Exception in markAsRead:', error, 'chatId:', chatId);
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
            last_read_message_id
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

        return data.filter((chat: { members?: { user?: { id?: string } | { id?: string }[] | null }[] }) => {
            const memberIds = (chat.members ?? [])
                .map((member) => Array.isArray(member.user) ? member.user[0]?.id : member.user?.id)
                .filter(Boolean) as string[];

            return !memberIds.some((memberId) => blockedPeerIds.has(memberId));
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
            pathname: '/(tabs)/chat',
            params: { id: chatId },
        });
        return;
    }

    console.log('navigating to group chat');
    router.push({
        pathname: '/(tabs)/groupchat',
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
    const now = new Date().toISOString();

    const { data: chat, error: chatError } = await supabase
        .from('chat')
        .insert({
            type,
            name,
            photo: image || null,
            last_message: null,
            last_message_at: null,
            created_at: now,
            updated_at: now,
            game_id: gameId,
        })
        .select()
        .single();

    if (chatError || !chat) {
        throw new Error(chatError?.message ?? 'Failed to create chat');
    }
    
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
    let index = 0;

    for (const member of members) {

        const { error: memberError } = await supabase.from('conversation_members').insert({
            id: member.id,
            chat_id: chat.id,
            joined_at: now,
            last_read_message_id: null,
            level: member.level,
            game_id: gameId,
            color: colors[index]
        });

        index++

        if (memberError) {
            throw new Error(memberError.message);
        }
    }

    return chat.id;
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
