import { useEffect, useState } from "react";
import FirstOnbPage from "./firstOnbPage";
import SecondOnbPage from "./secondOnbPage";
import ThirdOnbPage from "./thirdOnbPage";
import { supabase, isOnboarding } from "@/context/AuthContext";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert } from "react-native";
import FifthOnbPage from "./fifthOnbPage";
import FourthOnbPage from "./fourthOnbPage";

export default function SignupFlow() {
    const { method } = useLocalSearchParams();
    const [userId, setUserId] = useState('');
    const router = useRouter()
    type SignupData = {
        name: string,
        profile_picture: string | null,
        email: string,
        password: string,
        age_group: string,
        level: string,
        availability: {},
        city_id: string,
        last_active_ad: string,
        points: string,
        level_score: string,
        id: string,
        created_at: string,
    }
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState<SignupData>({
        name: '',
        profile_picture: null,
        email: '',
        password: '',
        age_group: '',
        level: '',
        availability: {},
        city_id: '',
        last_active_ad: '',
        points: '',
        level_score: '',
        id: '',
        created_at: '',
    })

    useEffect(() => {
        isOnboarding.current = true; // entering signup onboarding
        return () => {
            isOnboarding.current = false; // leaving onboarding
        };
    }, []);


    useEffect(() => {
        if (step === 4) {
            addData();
        }
    }, [step])


    const handleBack = () => {
        if (step === 1) {
            router.back()
        } else {
            setStep(step - 1)
        }
    }

    if (step === 1) {
        return (
            <FirstOnbPage onNext={() => setStep(2)} changeData={setFormData} onBack={handleBack} />
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
            <FourthOnbPage onNext={() => setStep(5)} onBack={function (): void {
                throw new Error("Function not implemented.");
            } } changeData={function (value: any | ((prev: any) => any)): void {
                throw new Error("Function not implemented.");
            } } />
        ) 
    } else if (step === 5) {
        return (
            <FifthOnbPage onNext={() => router.push('/(tabs)')} onBack={function (): void {
                throw new Error("Function not implemented.");
            } } changeData={function (value: any | ((prev: any) => any)): void {
                throw new Error("Function not implemented.");
            } } />
        ) 
    }


    async function addData() {
        const {data: authData, error: authError} = await supabase.auth.signUp({
            email: formData.email,
            password: formData.password
        })

        if (authError) {
            Alert.alert('Signup Failed')
            console.log('signup failed, ', authError.message)
        }
        const authUID = authData.user?.id;

        if (!authUID) {
            console.log('could not retrieve user ID')
        }


        const {data: dbData, error: dbError} = await supabase.from('users')
        .insert([
            {
                name: formData.name,
                profile_picture: formData.profile_picture,
                email: formData.email,
                password: formData.password,
                age_group: formData.age_group,
                level: formData.level,
                availability: formData.availability,
                city_id: 'Toronto',
                points: '0',
                level_score: '0',
                last_active_ad: new Date().toLocaleTimeString('en-GB'), // Matches timetz format
                id: authUID,
            }
        ]).select().single()

        if (dbError) {
            console.log('oops, you got an error', dbError.message)
        }
    }
}