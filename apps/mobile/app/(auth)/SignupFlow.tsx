import { useEffect, useState } from "react";
import FirstOnbPage from "./firstOnbPage";
import SecondOnbPage from "./secondOnbPage";
import ThirdOnbPage from "./thirdOnbPage";
import { supabase, isOnboarding, getUserId } from "@/context/AuthContext";
import { router, useLocalSearchParams, useRouter } from "expo-router";
import { Alert } from "react-native";
import FifthOnbPage from "./fifthOnbPage";
import FourthOnbPage from "./fourthOnbPage";
import { decode } from 'base64-arraybuffer';


export default function SignupFlow() {
    const { method } = useLocalSearchParams();
    const router = useRouter()
    type SignupData = {
        name: string,
        profile_picture: string | null,
        email: string,
        password: string,
        age_group: string,
        level: string,
        availability: string[],
        city: string,
        last_active_at: string,
        elo: number,
        id: string,
        created_at: string,
        gamesPlayed: number;
        reliability_score: number;
    }
    
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState<SignupData>({
        name: '',
        profile_picture: null,
        email: '',
        password: '',
        age_group: '',
        level: '',
        availability: [],
        city: '',
        last_active_at: '',
        elo: 0,
        id: '',
        created_at: '',
        gamesPlayed: 0,
        reliability_score: 75
    })

    const name = formData.name

    useEffect(() => {
        isOnboarding.current = true;
        return () => {
            isOnboarding.current = false;
        };
    }, []);

    const handleBack = () => {
        if (step === 1) {
            router.back()
        } else {
            setStep(step - 1)
        }
    }


    const handleImageUpload = async (base64String: any) => {
        try {
    
        const user = await getUserId()
        const userId = user?.id;
    
      if (!userId) throw new Error("No user ID found");
    
      const filePath = `${userId}/avatar_${Date.now()}.png`;
      
      
        const { data, error } = await supabase.storage
          .from('files') 
          .upload(filePath, decode(base64String), {
            contentType: 'image/png',
            upsert: true,
          });

        if (error) {
            Alert.alert('Error occured while uploading your profile picture!')
        }
    
        const { data: urlData } = supabase.storage
        .from('files')
        .getPublicUrl(filePath);
    
    
        const publicUrl = urlData.publicUrl;
    

        const {data: dbData, error: dbError} = await supabase.from('users')
        .update({
            profile_picture: publicUrl
        }).eq('id', userId)


        if (dbError) {
            Alert.alert('error updating profile image')
            console.log(dbError)
            console.log(dbError.message)
        }

        if (dbData) {
            console.log('image successfully updated!')
        }
        
        if (error) throw error;
        return data.path
        
        } catch (err) {
          Alert.alert("Couldn't upload image!");
          console.log(err)
        }
    }


    async function addData(): Promise<boolean> {
        let user;
        let userEmail = formData.email;
    
    
        if (!method || method === 'email') {
            const {data, error} = await supabase.auth.signUp({
                email: formData.email,
                password: formData.password,
                options: {
                    data: {
                      display_name: formData.name,
                      last_active_at : new Date().toISOString()
    
                    },
                  },
            })
    
            if (error || !data.user) {
                Alert.alert('Signup Failed')
                console.log('signup failed, ', error?.message)
                return false
            } 
    
            user = data.user
    
            userEmail = data.user.email ?? '';
    
        } else {
            
            const { data, error } = await supabase.auth.getUser();
    
            if (error || !data.user) {
                Alert.alert('Error', 'User session not ready');
                return false
            }
    
            user = data.user;
    
            userEmail = data.user.email ?? '';
        }
    
        if (!user) {
            Alert.alert('Error', 'User missing');
            return false;
        }
    
        let elo = 400;
    
        if (formData.level === 'intermediate') {
            elo = 800
        } else if (formData.level === 'advanced') {
            elo = 1200
        } else if (formData.level === 'pro') {
            elo = 1600
        }
    
        formData.elo = elo;
    
        const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();
    
        if (existing) {
        console.log('User already exists, skipping insert');
        return true
        }

        const { error: dbError } = await supabase.from('users')
        .insert([
            {
                id: user.id,
                name: formData.name,
                email: userEmail,
                age_group: formData.age_group,
                level: formData.level,
                availability: formData.availability,
                profile_picture: '',
                city: 'Toronto',
                elo: formData.elo,
                last_active_at: new Date().toISOString(),
                gamesPlayed: 0,
                reliability_score: 75
            }
        ]).select().single()
    
        formData.password = '';
        
        if (formData.profile_picture) {
            console.log("about to upload the image...")
            await handleImageUpload(formData.profile_picture)
        }
    
        if (dbError) {
            console.log('oops, you got an error', dbError.message)
            return false
        }
    
        return true
        }

        async function handleSubmit() {
            const success = await addData();
            if (success) {
                isOnboarding.current = false;
                router.replace('/(tabs)');
            } else {
                Alert.alert('Error', 'Failed to sign up');
            }
            
        }


    if (step === 1) {
        return (
            <FirstOnbPage onNext={() => setStep(2)} changeData={setFormData} onBack={handleBack} method={method as string}/>
        ) 
    } else if (step === 2) {
        return (
            <SecondOnbPage onNext={() => setStep(3)} changeData={setFormData} onBack={handleBack} />
        ) 
    } else if (step === 3) { 
        return (
            <ThirdOnbPage onNext={() => setStep(4)} changeData={setFormData} onBack={handleBack} />
        ) 
    } else if (step === 4) {
        return (
            <FourthOnbPage 
            onNext={() => setStep(5)} 
            onBack={handleBack}
            changeData={setFormData}
            data={name}
        />
        ) 
    } else if (step === 5) {
        return (
            <FifthOnbPage 
            onNext={handleSubmit} 
            onBack={handleBack}
            changeData={setFormData}
        />
        ) 
    }

}