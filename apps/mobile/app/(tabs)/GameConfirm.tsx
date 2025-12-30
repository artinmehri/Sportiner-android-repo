import { Image } from 'expo-image';
import { View, StyleSheet, Text, TouchableOpacity, Share } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function HomeScreen() {
    const ShareGame = async () => {
        const result = await Share.share({
            message: 'Join my Sportiner Game!',
            url: 'https://sportiner.com/game/123',
            title: 'Sportiner Game'
        })
    }
    const navigation = useNavigation();
  return (
    <View style={styles.container}>
        <View style={styles.dismissWrap}>
            <TouchableOpacity style={styles.dismissButton} onPress={() => navigation.goBack()}>
                <Text style={styles.dismissText}>I don't want to share my game</Text>
            </TouchableOpacity>
        </View>
        <View>
          <Text style={styles.title}>Congrats 🎉</Text>
        </View>
        <View>
            <Image style={styles.confirmLogo} source={require('@/assets/images/check.png')}></Image>
            <Text style={styles.context}>GAME CREATED!</Text>
        </View>
        <View>
            <TouchableOpacity style={styles.button} onPress={ShareGame}>
                <View style={styles.buttonContent}>
                   <Text style={styles.buttonText}>Invite friends to fill spots faster</Text>
                </View>
            </TouchableOpacity>
        </View>
    </View>
  );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#ffffff',
        flex: 1
    },
    title: {
        fontWeight: 'bold',
        fontSize: 30,
        color: '#000000',
        alignSelf: 'center',
        marginTop: 100
    },
    context: {
        fontWeight: 'bold',
        fontSize: 30,
        color: '#19E675',
        alignSelf: 'center',
        marginTop: 17

    },
    confirmLogo: {
        width: 170,
        height: 170,
        alignSelf: 'center',
        marginTop: 120
    },
    button: {
        backgroundColor: '#19E675',
        paddingVertical: 12,
        borderRadius: 50,
        width: 300,
        alignItems: 'center',
        marginLeft: 50,
        marginTop: 100,
    },
    buttonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center'
    },
    buttonText: {
        color: '#ffffff',
        fontWeight: 'bold',
        marginLeft: 10
    },
    dismissButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.05)',    }
        ,
    dismissWrap: {
        position: 'absolute',
        top: 50,   // adjust for status bar/notch
        left: 20,
        zIndex: 10,
    },
    dismissText: {
        color: '#000000',
        fontWeight: '500',
      },
});
