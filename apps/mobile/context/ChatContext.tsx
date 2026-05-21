import { getUser, getUserId, supabase } from "./AuthContext";
import { Alert } from "react-native";

// Checking if the user is already in chat
export async function userInChat(gameId: string) {
    const userId = await getUserId();

    if (!userId) return false;

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
    const userId = await getUserId();

    if (!userId) return false;

    const { data: member, error } = await supabase
        .from('conversation_members')
        .select('id, chat_id')
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
    const user = await getUser();
    const userId = await getUserId();
    if (!user || !userId) return;

    const alreadyInChat = await userInChat(gameId);
    const chatId = await getChatId(gameId);

    if (alreadyInChat) {
        // returning chat's id to navigate later!
        return chatId;
    }

    const { data: chat, error } = await supabase
            .from('chat')
            .select('id')
            .eq('game_id', gameId)
            .maybeSingle();

    if (chat !== null) {
        const { data, error } = await supabase
        .from('conversation_members')
        .insert({
            id: userId.id,
            chat_id: chat.id,
            joined_at: new Date().toISOString(),
            last_read_at: new Date().toISOString(),
            level: user.level,
            game_id: gameId
        });

        if (data) {
            console.log('user successfully added to chat')
            // returning chat's id
            return chat.id;
        } 

        if (error) {
        Alert.alert('Error', 'error while adding user to chat')
        console.log(error.message)
        }
    } else {
        Alert.alert('Chat does not exist!')
    }
}

export async function sendMessage(message: string, type: string, chatId: string) {
    const userId = await getUserId();
    if (!userId) return;

    const { data, error } = await supabase
    .from('messages').insert({
        chat_id: chatId,
        sender_id: userId.id,
        content: message,
        type: type,
        reply_to: null,
        is_edited: false,
        is_deleted: false,
    })

    if (data) {
        console.log('user message added successfully!')
    }

    if (error) {
        console.log(error.message)
    }
}

export async function getMessages(chatId: string) {
    const { data, error } = await supabase
    .from('messages')
    .select(`
        id,
        content,
        type,
        is_edited,
        is_deleted,
        created_at,
        sender:users!sender_id (    
            id,
            name,
            profile_picture
        ),
        reply:messages!reply_to (   
            id,
            content,
            sender:users!sender_id (
                name
            )
        )
    `)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })

    if (data) {
        return data
    }

    if (error) {
        console.log(error.message)
    }
}

export async function editMessage() {

}

export async function deleteMessage() {

}

export async function markAsRead() {

}

export async function uploadImage() {   

}

export async function sendImageMessage() {

}

export async function getConversations() {
    const userId = await getUserId();
    if (!userId) return;

    const { data } = await supabase
    .from('chat')
    .select(`
        id,
        type,
        name,
        photo,
        last_message,
        last_message_at,
        conversation_members!inner (   
            id,
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

    if (data) {
        return data
    }
}

export async function getUnreadCount(chatId: string) {
    const userId = await getUserId();
    if (!userId) return 0;

    // Step 1 — get your last_read_at
    const { data: member } = await supabase
    .from('conversation_members')
    .select('last_read_at')
    .eq('chat_id', chatId)
    .eq('id', userId.id)
    .single();

    if (!member) return 0;

    // Step 2 — count messages after last_read_at
    const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact' })
    .eq('chat_id', chatId)
    .gt('created_at', member.last_read_at)
    .neq('sender_id', userId.id);

    return count ?? 0;
}

export async function createChat(
    type: string,
    name: string,
    photo: string,
    gameId: string,
    members: Array<{ id: string; level: string }>
) {
    const now = new Date().toISOString();

    const { data: chat, error: chatError } = await supabase
        .from('chat')
        .insert({
            type,
            name,
            photo: photo || null,
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

    for (const member of members) {
        const { error: memberError } = await supabase.from('conversation_members').insert({
            id: member.id,
            chat_id: chat.id,
            joined_at: now,
            last_read_at: now,
            level: member.level,
            game_id: gameId,
        });

        if (memberError) {
            throw new Error(memberError.message);
        }
    }

    return chat.id;
}

export async function getChatMembers(chatId: string) {
    
    const { data, error } = await supabase
    .from('conversation_members')
    .select('*')
    .eq('chat_id', chatId)
    .single()

    if (data) {
        return data
    } 

    if (error) {
        console.log('error occured! ')
    }
}