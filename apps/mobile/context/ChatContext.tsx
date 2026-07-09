import { getCurrentUser, getCurrentUserId, supabase } from "./AuthContext";
import { Alert } from "react-native";
import { router } from 'expo-router';

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
            console.log(error.message)
            return null
        }

        if (member === null) {
            console.log('returned null!')
            return null
        }

        if (member !== null) {
            return member.chat_id
        }
}

// Adding user to chat
export async function addUserToChat(gameId: string) {
    if (!gameId || !UUID_RE.test(gameId)) return null;

    const user = await getCurrentUser();
    const userId = await getCurrentUserId();
    if (!user || !userId?.id) return null;

    const alreadyInChat = await userInChat(gameId);
    if (alreadyInChat) {
        // User is already in chat, get the chat ID
        const chatId = await getChatId(gameId);
        return chatId;
    }

    const { data: chat, error: chatError } = await supabase
            .from('chat')
            .select('id')
            .eq('game_id', gameId)
            .maybeSingle();

    if (chatError) {
        console.log('Error fetching chat:', chatError.message);
        return null;
    }

    if (chat === null) {
        console.log('Chat does not exist for game:', gameId);
        return null;
    }

    const { data, error } = await supabase
        .from('conversation_members')
        .insert({
            id: userId.id,
            chat_id: chat.id,
            joined_at: new Date().toISOString(),
            last_read_message_id: null,
            level: user.level,
            game_id: gameId,
        });

    if (error) {
        console.log('Error adding user to chat:', error.message);
        return null;
    }

    if (data) {
        console.log('user successfully added to chat')
        // returning chat's id
        return chat.id;
    }

    return null;
}

export async function replyMessage(reply_to: string, type: string, reply_message: string, chatId: string, image?: string) {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const now = new Date().toISOString();

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

    return data;
}


export async function sendMessage(message: string, type: string, chatId: string, image?: string) {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const now = new Date().toISOString();

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
    const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })

    if (data) {
        return data
    }

    if (error) {
        console.log(error.message)
    }
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

    const { data, error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId);

    if (data) {
        console.log('message deleted successfully!')
    }

    if (error) {
        console.log(error.message)
    }
}

export async function markAsRead(chatId: string) {
    const userId = await getCurrentUserId();
    if (!userId) return;

    // Step 1 — get latest message
    const { data: latestMessage } = await supabase
        .from('messages')
        .select('id')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!latestMessage) return;

    // Step 2 — update user read state
    await supabase
        .from('conversation_members')
        .update({
            last_read_message_id: latestMessage.id,
            last_read_at: new Date().toISOString()
        })
        .eq('chat_id', chatId)
        .eq('id', userId.id);
}

export async function uploadImage() {   

}

export async function sendImageMessage() {

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
        return data
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
